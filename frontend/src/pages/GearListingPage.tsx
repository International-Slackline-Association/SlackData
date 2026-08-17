// Gear listing page: filter sidebar + toolbar (search / count / view toggle /
// sort) + card grid or detailed spec panels.
//
// The grid stays mounted and is hidden (display:none) when Detailed is active;
// the detailed list mounts only while active (see the Results block for why).
// When there are no results, an empty state with a clear-filters action
// replaces both.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import { useGearList } from '@/hooks/useGearList'
import { useCurrency } from '@/context/CurrencyContext'
import { useUrlState } from '@/hooks/useUrlState'
import { filterBySearch } from '@/utils/search'
import { sortItems } from '@/utils/sort'
import { filterGroupsFor } from '@/config/filterGroups'
import { applyFilters, type RangeBounds } from '@/utils/filter'
import { percentAtKn, topKnPoints } from '@/utils/stretch'
import type { AnyItem } from '@/utils/format'
import FilterSidebar from '@/components/gear/FilterSidebar'
import type { Status } from '@/components/gear/StatusToggle'
import StretchFilter from '@/components/gear/StretchFilter'
import SortDropdown from '@/components/gear/SortDropdown'
import GearGrid from '@/components/gear/GearGrid'
import GearDetailedList from '@/components/gear/GearDetailedList'
import CompareBar from '@/components/gear/CompareBar'
import NotFoundPage from './NotFoundPage'

type View = 'cards' | 'detailed'

const COMPARE_MAX = 4

function LoadingSkeleton() {
  return (
    <div data-cy="loading-skeleton" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />
      ))}
    </div>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div data-cy="empty-state" className="py-16 text-center">
      <p className="text-gray-500">No matches found.</p>
      <button
        data-cy="clear-filters"
        type="button"
        onClick={onClear}
        className="mt-3 font-medium text-teal-primary hover:underline"
      >
        Clear filters
      </button>
    </div>
  )
}

const viewBtn = (active: boolean) =>
  `px-3 py-1.5 text-sm ${active ? 'bg-teal-primary text-white' : 'bg-white text-gray-600 hover:text-gray-900'}`

export default function GearListingPage() {
  const { slug } = useParams()
  const meta = slug ? getGearType(slug) : undefined
  const available = !!meta?.available
  const { items: rawItems, loading } = useGearList(meta?.slug ?? '', available)
  const { basePrice, displayPrice } = useCurrency()
  const url = useUrlState()
  const { q, setQ, sort, setSort } = url
  const [view, setView] = useState<View>('cards')
  // Lifecycle scope, owned here but controlled from the sidebar's status bubble.
  // All = everything (the default — the listing opens on the whole catalogue).
  // Current = still sold (active true, or unknown/null). Historic = legacy gear
  // that's no longer sold (active === false).
  const [status, setStatus] = useState<Status>('all')
  const navigate = useNavigate()

  // Compare selection: an ordered list of item ids (order = the columns/chips
  // order downstream). Lives in local state, capped at COMPARE_MAX. It clears on
  // a gear-type switch — the component stays mounted across the same :slug route,
  // so a slug change is the signal (see the effect below). The compare page is
  // reached by handing these ids off through the ?ids= query param, which is what
  // makes that page deep-linkable independent of this state.
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const prevCompareSlug = useRef(slug)
  useEffect(() => {
    if (prevCompareSlug.current === slug) return
    prevCompareSlug.current = slug
    setSelectedIds([])
  }, [slug])

  const toggleCompare = (id: number) =>
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length >= COMPARE_MAX
          ? prev
          : [...prev, id],
    )
  const removeCompare = (id: number) => setSelectedIds(prev => prev.filter(x => x !== id))
  const clearCompare = () => setSelectedIds([])

  // Search box holds LOCAL state and drives filtering directly; the URL is kept
  // in sync for bookmarking but is NOT the input's value. Binding value={q}
  // straight to the async URL echo drops characters while Cypress types fast
  // (same race the Phase-4 range inputs hit — see RangeSlider). Seed from the URL
  // on mount; reset on clear-all via the nonce, not on every param echo.
  // Re-seed from the clear's own intent rather than blanking: clearAll carries
  // '' so the box empties, while the empty state's clear-filters carries the
  // kept term so the box keeps showing it. Read from resetQuery, not `q` — the
  // router commits the cleared params a render later than the nonce bump, so `q`
  // here would still be the pre-clear term.
  const [query, setQuery] = useState(q)
  const prevSearchNonce = useRef(url.resetNonce)
  useEffect(() => {
    if (prevSearchNonce.current === url.resetNonce) return
    prevSearchNonce.current = url.resetNonce
    setQuery(url.resetQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.resetNonce])
  // The listing component stays mounted across gear-type switches (same :slug
  // route), so resync the box from the URL when the type changes — a bare tab
  // switch clears it, a deep-link (?q=) seeds it. (Sort/filters live in the URL,
  // so they reset on their own; only the local search box needs this.) Guarded on
  // slug so it never fires mid-typing, which would fight the lagging URL echo.
  const prevSlug = useRef(slug)
  useEffect(() => {
    if (prevSlug.current === slug) return
    prevSlug.current = slug
    setQuery(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])
  const onSearchChange = (value: string) => {
    setQuery(value)
    setQ(value)
  }

  // Webbing stretch widget state (owned here so it also drives filtering, the
  // contextual sort option, and the cards' data-stretch-percent). NOTHING is
  // selected on load: no pill is active, the % slider is inert, cards carry no
  // stretch %, and the contextual stretch sort is absent until a kN is picked.
  const isWebbing = meta?.slug === 'webbings'
  const [stretchKn, setStretchKn] = useState<number | null>(null)
  const [stretchMin, setStretchMin] = useState('')
  const [stretchMax, setStretchMax] = useState('')
  // One value now: the engaged kN, or null when the widget is off. (There is no
  // separate "display" kN — a pre-selected default hint would render a pill
  // active on load, which it must not.)
  const selectedKn = isWebbing ? stretchKn : null

  // Reset the stretch widget only when clear-all actually bumps the nonce.
  // Comparing the previous value (not a mounted flag) survives StrictMode's
  // double-invoked mount effect.
  const prevNonce = useRef(url.resetNonce)
  useEffect(() => {
    if (prevNonce.current === url.resetNonce) return
    prevNonce.current = url.resetNonce
    // clear-all: deselect the kN (no pill active) and clear the % range.
    setStretchKn(null)
    setStretchMin('')
    setStretchMax('')
  }, [url.resetNonce])

  // Clicking the engaged pill toggles the widget off; any other pill engages it.
  const selectKn = (kn: number) => setStretchKn(prev => (prev === kn ? null : kn))

  // Every item gains two derived money fields, the same way the stretch widget
  // attaches stretch_percent below:
  //   price_base    — normalized to the rate table's base AND to one item; what
  //                   SORT compares, so a 5377 RUB grip and an 89 USD one rank
  //                   correctly, and an €80 pair of tree protectors ranks below
  //                   a €50 single because it is €40 a protector.
  //   price_display — the same price in the viewer's currency; what the price
  //                   FILTER compares, so its bounds mean what the sidebar says.
  // Both are null when the item has no price or its currency isn't in the table,
  // which is exactly the null-last / excluded-by-a-bound behaviour already in
  // place for every other numeric field.
  const items = useMemo<AnyItem[]>(
    () =>
      (rawItems as unknown as AnyItem[]).map(it => ({
        ...it,
        price_base: basePrice(it),
        price_display: displayPrice(it),
      })),
    [rawItems, basePrice, displayPrice],
  )

  const { activePills, activeRanges } = useMemo(() => {
    const activePills: Record<string, string[]> = {}
    const activeRanges: Record<string, RangeBounds> = {}
    if (meta) {
      for (const g of filterGroupsFor(meta.slug)) {
        if (g.type === 'pill') {
          const values = url.getPillValues(g.group)
          if (values.length) activePills[g.group] = values
        } else {
          // The URL key is the group; the field compared may differ (price).
          const r = url.getRange(g.group)
          if (r.min != null || r.max != null) activeRanges[g.valueField ?? g.group] = r
        }
      }
    }
    return { activePills, activeRanges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.params, meta])

  // Everything the OTHER controls (search + the regular filter groups) leave in
  // play, before the stretch widget itself narrows further. This is the context
  // the stretch kN pills and the sort dropdown's kN submenu are built from, so
  // their counts track the rest of the UI live. The stretch widget's own kN/%
  // selection is deliberately excluded — folding it in would collapse every
  // count to the engaged pill's own number the moment you clicked one.
  // Narrow to the chosen status before anything else — search, filters, facet
  // counts and the grid all work off this scope.
  const scopedItems = useMemo(() => {
    if (status === 'all') return items
    return items.filter(it => (status === 'historic' ? it.active === false : it.active !== false))
  }, [items, status])

  const contextItems = useMemo(
    () =>
      applyFilters(
        filterBySearch(scopedItems as never, query) as unknown as AnyItem[],
        activePills,
        activeRanges,
      ),
    [scopedItems, query, activePills, activeRanges],
  )

  const visible = useMemo(() => {
    let filtered = contextItems
    if (selectedKn != null) {
      // Attach stretch % at the reference kN for the cards + stretch sort, and
      // exclude webbings with no data there. Both only once a pill is engaged.
      filtered = filtered.map(it => ({ ...it, stretch_percent: percentAtKn(it.stretch, selectedKn) }))
      const lo = stretchMin === '' ? null : Number(stretchMin)
      const hi = stretchMax === '' ? null : Number(stretchMax)
      filtered = filtered.filter(it => {
        const p = it.stretch_percent as number | null
        if (p == null) return false
        if (lo != null && p < lo) return false
        if (hi != null && p > hi) return false
        return true
      })
    }
    return sortItems(filtered, sort)
  }, [contextItems, selectedKn, stretchMin, stretchMax, sort])

  // The selected items, in selection order, resolved from the FULL list (not
  // `visible`) so a chip survives the item being filtered out of the grid.
  const selectedItems = useMemo(() => {
    const byId = new Map((items as unknown as AnyItem[]).map(it => [Number(it.id), it]))
    return selectedIds.map(id => byId.get(id)).filter((it): it is AnyItem => it != null)
  }, [items, selectedIds])

  const viewComparison = () =>
    navigate(`/${meta?.slug}/compare?ids=${selectedIds.join(',')}`)

  // The two clear actions. Both drop every filter and put the status scope back
  // to All; they differ on the search term — the empty state's button keeps it
  // (you asked for those words; the filters are what dead-ended), the sidebar's
  // "Clear all" wipes it.
  const clearFilters = () => {
    url.clearFilters()
    setStatus('all')
  }
  const clearAll = () => {
    url.clearAll()
    setStatus('all')
  }

  if (!meta) return <NotFoundPage />

  if (!available) {
    return (
      <div data-cy="gear-listing">
        <h1 className="text-xl font-bold text-gray-900">{meta.label}</h1>
        <p data-cy="coming-soon" className="mt-3 text-gray-500">
          Coming soon — we don&apos;t have {meta.label.toLowerCase()} data yet.
        </p>
      </div>
    )
  }

  return (
    <div data-cy="gear-listing">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{meta.label}</h1>

      <div className="flex gap-8">
        <FilterSidebar
          meta={meta}
          items={scopedItems as unknown as AnyItem[]}
          url={url}
          status={status}
          onStatusChange={setStatus}
          onClearAll={clearAll}
        >
          {isWebbing && (
            <StretchFilter
              items={contextItems}
              displayKn={selectedKn}
              onSelectKn={selectKn}
              min={stretchMin}
              max={stretchMax}
              onMinChange={setStretchMin}
              onMaxChange={setStretchMax}
            />
          )}
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              data-cy="search-input"
              type="search"
              value={query}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={`Search ${meta.label}…`}
              className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-primary focus:outline-none"
            />
            <span data-cy="item-count" className="text-sm text-gray-500">
              {visible.length} {visible.length === 1 ? 'item' : 'items'}
            </span>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-gray-300">
                <button
                  data-cy="view-cards"
                  type="button"
                  data-active={view === 'cards' ? 'true' : 'false'}
                  onClick={() => setView('cards')}
                  className={viewBtn(view === 'cards')}
                >
                  Cards
                </button>
                <button
                  data-cy="view-detailed"
                  type="button"
                  data-active={view === 'detailed' ? 'true' : 'false'}
                  onClick={() => setView('detailed')}
                  className={`border-l border-gray-300 ${viewBtn(view === 'detailed')}`}
                >
                  Detailed
                </button>
              </div>
              <SortDropdown
                slug={meta.slug}
                sort={sort}
                onChange={setSort}
                stretchKns={
                  isWebbing
                    ? // Ranked by count (most common first) so the dropdown's own kN
                      // submenu opens on the most useful reference point. Computed
                      // over contextItems, so the offered points follow the active
                      // search/filters. Still independent of the stretch widget:
                      // stretch sort reads the curve directly (see sortItems), so it
                      // works with no kN pill engaged.
                      topKnPoints(contextItems as unknown as { stretch?: unknown }[]).map(p => p.kn)
                    : []
                }
              />
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState onClear={clearFilters} />
          ) : (
            <>
              {/* The grid stays mounted-but-hidden (cheap, and the toggle just
                  flips visibility). The detailed list is mounted only while
                  active — its panels reuse the detail page's data-cy hooks and
                  render a full spec table each, so keeping N of them in the DOM
                  behind display:none would both cost real work and double the
                  element counts gear_cards.cy.ts reads off the grid. */}
              <div className={view === 'detailed' ? 'hidden' : ''}>
                <GearGrid
                  items={visible}
                  meta={meta}
                  selectedIds={selectedIds}
                  compareFull={selectedIds.length >= COMPARE_MAX}
                  onToggleCompare={toggleCompare}
                />
              </div>
              {/* Same compare wiring as the grid above — selection is owned here,
                  so it is shared by both views and survives switching between
                  them. */}
              {view === 'detailed' && (
                <GearDetailedList
                  items={visible}
                  meta={meta}
                  selectedIds={selectedIds}
                  compareFull={selectedIds.length >= COMPARE_MAX}
                  onToggleCompare={toggleCompare}
                />
              )}
            </>
          )}
        </div>
      </div>

      <CompareBar
        items={selectedItems}
        onRemove={removeCompare}
        onClear={clearCompare}
        onView={viewComparison}
      />
    </div>
  )
}
