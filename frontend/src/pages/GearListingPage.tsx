// Gear listing page: filter sidebar + toolbar (search / count / view toggle /
// sort) + card grid, detailed spec panels, or the spec table.
//
// The grid stays mounted and is hidden (display:none) when another view is
// active; the detailed list and the table mount only while active (see the
// Results block for why).
// When there are no results, an empty state with a clear-filters action
// replaces both.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { OriginProvider, useCurrentOrigin } from '@/context/OriginContext'
import { originState } from '@/utils/origin'
import { getGearType } from '@/config/gearTypes'
import { useGearList } from '@/hooks/useGearList'
import { useCurrency } from '@/context/CurrencyContext'
import { STRETCH_RANGE_FIELD, useUrlState } from '@/hooks/useUrlState'
import { filterBySearch } from '@/utils/search'
import { sortItems } from '@/utils/sort'
import { BRAND_GROUP, filterGroupsFor } from '@/config/filterGroups'
import { activeFilterCount, applyFilters, type RangeBounds } from '@/utils/filter'
import { percentAtKn, topKnPoints } from '@/utils/stretch'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { brandsFor } from '@/utils/sellers'
import type { AnyItem } from '@/utils/format'
import FilterSidebar from '@/components/gear/FilterSidebar'
import StretchFilter from '@/components/gear/StretchFilter'
import SortDropdown, { labelFor } from '@/components/gear/SortDropdown'
import MobileFilterBar from '@/components/gear/MobileFilterBar'
import Sheet from '@/components/layout/Sheet'
import GearGrid from '@/components/gear/GearGrid'
import GearDetailedList from '@/components/gear/GearDetailedList'
import GearTable from '@/components/gear/GearTable'
import CompareBar from '@/components/gear/CompareBar'
import SuggestButton from '@/components/submissions/SuggestButton'
import NotFoundPage from './NotFoundPage'

// How many items one comparison may hold. The table scrolls sideways with the
// label column pinned, so columns are cheap; the chart used to be the binding
// constraint at eight, and the palette was widened to ten so it no longer is —
// every compared webbing with a curve gets its own line (MAX_PLOTTED_SERIES).
// Ten is what people actually want to line up — a brand's whole range, or every
// 25mm webbing on the market. Raising this past ten means widening the palette
// first, or the extra lines arrive gray.
const COMPARE_MAX = 10

function LoadingSkeleton() {
  return (
    <div data-cy="loading-skeleton" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
  const { q, setQ, sort, setSort, setView } = url
  // Lifecycle scope, controlled from the sidebar's status bubble and held in the
  // URL (?status=). All = everything (the default — the listing opens on the
  // whole catalogue). Current = still sold (active true, or unknown/null).
  // Historic = gear that is no longer sold (active === false).
  const { status, setStatus } = url
  const navigate = useNavigate()

  // What a link leaving this page should offer as the way back: this listing,
  // filters and sort included, under the gear type's own name. Every card link
  // below picks it up through the provider around the results.
  const origin = useCurrentOrigin(meta?.label ?? '')

  // Below `lg` the sidebar has nowhere to live, so filters and sort move into a
  // bottom sheet. `isDesktop` (matchMedia, not a `hidden lg:block` pair) decides
  // which tree is MOUNTED — rendering both would put two
  // [data-cy="filter-sidebar"] / [data-cy="sort-option"] sets in the DOM and
  // break every selector the Cypress suite is built on.
  const isDesktop = useIsDesktop()

  // The listing mode lives in the URL (?view=detailed|table), so it is
  // shareable and survives Back — unlike the local state it used to be.
  //
  // Below `lg` the Table button is absent and a deep-linked ?view=table falls
  // back to Cards. A frozen-column table needs room the phone doesn't have, and
  // the fallback is deliberately a RENDER decision rather than a rewrite of the
  // URL: rotating the device or widening the window brings the table back
  // rather than having silently lost the link's intent.
  const view = !isDesktop && url.view === 'table' ? 'cards' : url.view

  const [sheet, setSheet] = useState<'none' | 'filters' | 'sort'>('none')
  const closeSheet = () => setSheet('none')
  // A sheet left open while the window grows past `lg` would sit on top of a
  // perfectly good sidebar.
  useEffect(() => {
    if (isDesktop) setSheet('none')
  }, [isDesktop])

  // Compare selection: an ordered list of item ids (order = the columns/chips
  // order downstream), capped at COMPARE_MAX.
  //
  // LOCAL state, and writing it to the URL on every tick is exactly what this
  // must not do. It was ?compare= for a while, so the picks survived a detour
  // into an item — but a param write goes through useSearchParams, and every
  // memo on this page that keys off `url.params` then recomputes: the two
  // applyFilters passes, the sort, and the table view's column set. Ticking one
  // box re-ran the entire listing pipeline and re-rendered 12,000 table cells,
  // and the box took about a second to look checked. A selection is not a
  // filter, and it is not a view: nothing downstream of the URL depends on it.
  //
  // Seeded once from ?compare= so a link that carries one still fills the bar,
  // and the compare PAGE is still reached by handing the ids off as ?ids= —
  // that is what makes that page deep-linkable on its own. Sliced on the way in
  // as well as capped on the way out: a URL can name any number of items, and
  // eleven columns is eleven columns however they were asked for.
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    url.compareIds.slice(0, COMPARE_MAX),
  )
  // The picks belong to the gear type they were made in. As URL state that came
  // free (a nav tab carries no query string); as local state it needs saying.
  const prevCompareSlug = useRef(slug)
  useEffect(() => {
    if (prevCompareSlug.current === slug) return
    prevCompareSlug.current = slug
    setSelectedIds([])
  }, [slug])

  // Stable identities: GearTable memoizes its rows, and a fresh callback on
  // every render would defeat that and re-render all 258 of them per tick.
  const toggleCompare = useCallback(
    (id: number) =>
      setSelectedIds(ids =>
        ids.includes(id)
          ? ids.filter(x => x !== id)
          : ids.length >= COMPARE_MAX
            ? ids
            : [...ids, id],
      ),
    [],
  )
  const removeCompare = useCallback(
    (id: number) => setSelectedIds(ids => ids.filter(x => x !== id)),
    [],
  )
  const clearCompare = useCallback(() => setSelectedIds([]), [])

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

  // Webbing stretch widget state (it drives filtering, the contextual sort
  // option, and the cards' data-stretch-percent). NOTHING is selected on load:
  // no pill is active, the % slider is inert, cards carry no stretch %, and the
  // contextual stretch sort is absent until a kN is picked.
  //
  // It lives in the URL (?kn=, ?stretch_min=, ?stretch_max=) like every other
  // filter. As local state it was the one filter that silently reverted on Back
  // — you came back from a webbing to an unfiltered grid, which reads as wrong
  // data rather than as lost state. The two clears drop the params with
  // everything else, so no reset signal is needed here any more.
  const isWebbing = meta?.slug === 'webbings'
  const stretchRange = url.getRange(STRETCH_RANGE_FIELD)
  const stretchMin = stretchRange.min == null ? '' : String(stretchRange.min)
  const stretchMax = stretchRange.max == null ? '' : String(stretchRange.max)
  // One value: the engaged kN, or null when the widget is off. (There is no
  // separate "display" kN — a pre-selected default hint would render a pill
  // active on load, which it must not.)
  const selectedKn = isWebbing ? url.stretchKn : null

  // Clicking the engaged pill toggles the widget off; any other pill engages it.
  const selectKn = (kn: number) => url.setStretchKn(selectedKn === kn ? null : kn)

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
  //
  // A third joins them: `brands` — the maker plus every name in the item's own
  // `gear_sellers`. It is what the Brand filter group compares (see
  // filterGroups.ts → BRAND_GROUP), so picking a brand finds what that brand
  // SELLS, not only what it makes. Derived here, beside the money fields,
  // because the filter machinery already handles an array-valued field.
  const items = useMemo<AnyItem[]>(
    () =>
      (rawItems as unknown as AnyItem[]).map(it => ({
        ...it,
        price_base: basePrice(it),
        price_display: displayPrice(it),
        brands: brandsFor(it),
      })),
    [rawItems, basePrice, displayPrice],
  )

  const { activePills, activeRanges } = useMemo(() => {
    const activePills: Record<string, string[]> = {}
    const activeRanges: Record<string, RangeBounds> = {}
    if (meta) {
      for (const g of filterGroupsFor(meta.slug)) {
        if (g.type === 'pill') {
          // Same split as the ranges below: the URL key is the group, the field
          // compared may differ (brand → the derived `brands` list).
          const values = url.getPillValues(g.group)
          if (values.length) activePills[g.valueField ?? g.group] = values
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

  // The brand facet: every OTHER control applied, but not the brand group
  // itself. Excluding its own selection is the whole trick — folded in, picking
  // "Spider Slacklines" would leave Spider as the only pill in the group and
  // there would be no way to add a second brand. Excluding the stretch widget
  // too, for the same reason its own kN counts exclude it (see contextItems):
  // that widget re-derives its pills from `contextItems`, and making the two
  // facets depend on each other's selection makes both jump as you click.
  const brandFacetItems = useMemo(() => {
    const withoutBrand = { ...activePills }
    delete withoutBrand[BRAND_GROUP.valueField ?? BRAND_GROUP.group]
    return applyFilters(
      filterBySearch(scopedItems as never, query) as unknown as AnyItem[],
      withoutBrand,
      activeRanges,
    )
  }, [scopedItems, query, activePills, activeRanges])

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
    navigate(`/${meta?.slug}/compare?ids=${selectedIds.join(',')}`, {
      state: originState(origin),
    })

  // The two clear actions. Both drop every filter and put the status scope back
  // to All; they differ on the search term — the empty state's button keeps it
  // (you asked for those words; the filters are what dead-ended), the sidebar's
  // "Clear all" wipes it.
  // Both wipe ?status= and the stretch params along with the rest of the query
  // string, so neither needs to reset anything by hand.
  const clearFilters = () => url.clearFilters()
  const clearAll = () => url.clearAll()

  // How many filters are engaged, for the mobile "Filters (n)" badge — the only
  // signal, once the sidebar is behind a sheet, that the list is narrowed at all.
  const filterCount = meta
    ? activeFilterCount(filterGroupsFor(meta.slug), url.params, {
        statusScoped: status !== 'all',
        stretchEngaged: selectedKn != null,
      })
    : 0

  // The webbing stretch widget, slotted into whichever FilterSidebar is mounted.
  const stretchWidget = isWebbing && (
    <StretchFilter
      items={contextItems}
      displayKn={selectedKn}
      onSelectKn={selectKn}
      min={stretchMin}
      max={stretchMax}
      onMinChange={v => url.setRangeBound(STRETCH_RANGE_FIELD, 'min', v)}
      onMaxChange={v => url.setRangeBound(STRETCH_RANGE_FIELD, 'max', v)}
    />
  )

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
    // Everything below links out under this page's identity: a card opened from
    // here comes back to HERE — this gear type, these filters, this sort — and
    // not to the bare listing (see context/OriginContext.tsx).
    <OriginProvider origin={origin}>
    <div data-cy="gear-listing">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 lg:mb-6">{meta.label}</h1>

      {!isDesktop && (
        <MobileFilterBar
          query={query}
          onQueryChange={onSearchChange}
          placeholder={`Search ${meta.label}…`}
          count={visible.length}
          filterCount={filterCount}
          sortLabel={labelFor(sort, meta.slug)}
          onOpenFilters={() => setSheet('filters')}
          onOpenSort={() => setSheet('sort')}
        />
      )}

      <div className="flex flex-col lg:flex-row lg:gap-8">
        {isDesktop && (
          <FilterSidebar
            meta={meta}
            items={scopedItems as unknown as AnyItem[]}
            brandItems={brandFacetItems}
            url={url}
            status={status}
            onStatusChange={setStatus}
            onClearAll={clearAll}
          >
            {stretchWidget}
          </FilterSidebar>
        )}

        <div className="min-w-0 flex-1">
          {/* Toolbar — desktop only, and CONDITIONALLY MOUNTED rather than
              CSS-hidden: below `lg` its search box and count live in the sticky
              MobileFilterBar above under the same data-cy hooks, so keeping this
              one in the DOM would double every one of those selectors. */}
          {isDesktop && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <input
              data-cy="search-input"
              type="search"
              value={query}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={`Search ${meta.label}…`}
              // FIXED width, deliberately. This used to be `min-w-0 flex-1
              // max-w-64`, sized from whatever the row had left over — which
              // meant the search box shrank as the copy beside it grew, and at
              // ~1200px it resolved to about 130px: too narrow to show even the
              // word "Search" in its own placeholder. Elastic sizing made the
              // box a residue of everything else on the row instead of a
              // control with a size. `w-64` is that size; keeping the row from
              // wrapping is now a question of what else is allowed on it, which
              // is why the accuracy note left (it lives in the footer) and
              // "Missing something?" moved into the right-hand group.
              className="w-64 shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-primary focus:outline-none"
            />
            <span data-cy="item-count" className="text-sm text-gray-500">
              {visible.length} {visible.length === 1 ? 'item' : 'items'}
            </span>

            <div className="ml-auto flex items-center gap-3">
              {/* If the data is incomplete, say where to report what's missing —
                  but from the right-hand group, not wedged between the count and
                  the view toggle. */}
              <SuggestButton gearType={meta.slug} variant="new-item" />
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
                <button
                  data-cy="view-table"
                  type="button"
                  data-active={view === 'table' ? 'true' : 'false'}
                  onClick={() => setView('table')}
                  className={`border-l border-gray-300 ${viewBtn(view === 'table')}`}
                >
                  Table
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
          )}

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
              <div className={view === 'cards' ? '' : 'hidden'}>
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
              {/* `allItems` is the whole gear type, not `visible`: it decides
                  which COLUMNS exist, which must not change as you filter. */}
              {view === 'table' && (
                <GearTable
                  items={visible}
                  allItems={items}
                  meta={meta}
                  sort={sort}
                  onSortChange={setSort}
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

      {/* The mobile homes for the sidebar and the sort menu. Mounted only while
          open, so their children stay single-instance in the DOM. */}
      {sheet === 'filters' && (
        <Sheet
          title="Filters"
          onClose={closeSheet}
          footer={
            // Filters already apply live (they write straight to the URL), so
            // this commits nothing — it dismisses, and carries the result count
            // so the effect of what you just tapped is legible without closing.
            <button
              data-cy="sheet-apply"
              type="button"
              onClick={closeSheet}
              className="w-full rounded-full bg-teal-primary py-3 text-sm font-medium text-white"
            >
              Show {visible.length} {visible.length === 1 ? 'result' : 'results'}
            </button>
          }
        >
          <FilterSidebar
            meta={meta}
            items={scopedItems as unknown as AnyItem[]}
            brandItems={brandFacetItems}
            url={url}
            status={status}
            onStatusChange={setStatus}
            onClearAll={clearAll}
            variant="sheet"
          >
            {stretchWidget}
          </FilterSidebar>
        </Sheet>
      )}

      {sheet === 'sort' && (
        <Sheet title="Sort by" onClose={closeSheet}>
          <SortDropdown
            slug={meta.slug}
            sort={sort}
            onChange={setSort}
            variant="sheet"
            onClose={closeSheet}
            stretchKns={
              isWebbing
                ? topKnPoints(contextItems as unknown as { stretch?: unknown }[]).map(p => p.kn)
                : []
            }
          />
        </Sheet>
      )}
    </div>
    </OriginProvider>
  )
}
