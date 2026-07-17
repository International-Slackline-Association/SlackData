// Gear listing page: filter sidebar + toolbar (search / count / view toggle /
// sort) + card grid or chart table.
//
// Grid and table are both mounted when there are results; the inactive one is
// hidden (display:none) so the view toggle just flips visibility. When there are
// no results, an empty state with a clear-filters action replaces both.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import { useGearList } from '@/hooks/useGearList'
import { useUrlState } from '@/hooks/useUrlState'
import { filterBySearch } from '@/utils/search'
import { sortItems } from '@/utils/sort'
import { filterGroupsFor } from '@/config/filterGroups'
import { applyFilters, type RangeBounds } from '@/utils/filter'
import { mostCommonKn, percentAtKn, topKnPoints } from '@/utils/stretch'
import type { AnyItem } from '@/utils/format'
import FilterSidebar from '@/components/gear/FilterSidebar'
import StretchFilter from '@/components/gear/StretchFilter'
import SortDropdown from '@/components/gear/SortDropdown'
import GearGrid from '@/components/gear/GearGrid'
import GearTable from '@/components/gear/GearTable'
import NotFoundPage from './NotFoundPage'

type View = 'cards' | 'chart'

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
  const { items, loading } = useGearList(meta?.slug ?? '', available)
  const url = useUrlState()
  const { q, setQ, sort, setSort } = url
  const [view, setView] = useState<View>('cards')

  // Webbing stretch widget state (owned here so it also drives filtering, the
  // contextual sort option, and the cards' data-stretch-percent). The default kN
  // is pre-selected for DISPLAY but does not filter until a pill is engaged, so a
  // fresh load still shows all webbings (keeps gear_listing/gear_cards green).
  const isWebbing = meta?.slug === 'webbings'
  const [stretchKn, setStretchKn] = useState<number | null>(null)
  const [stretchTouched, setStretchTouched] = useState(false)
  const [stretchMin, setStretchMin] = useState('')
  const [stretchMax, setStretchMax] = useState('')
  const defaultKn = useMemo(
    () => (isWebbing ? mostCommonKn(items as unknown as { stretch?: unknown }[]) : null),
    [isWebbing, items],
  )
  const displayKn = isWebbing ? (stretchTouched ? stretchKn : defaultKn) : null
  const filterKn = isWebbing && stretchTouched ? stretchKn : null

  // Reset the stretch widget only when clear-all actually bumps the nonce.
  // Comparing the previous value (not a mounted flag) survives StrictMode's
  // double-invoked mount effect, which would otherwise fire the reset on load
  // and deselect the default kN pill.
  const prevNonce = useRef(url.resetNonce)
  useEffect(() => {
    if (prevNonce.current === url.resetNonce) return
    prevNonce.current = url.resetNonce
    // clear-all: deselect the kN (no pill active) and clear the % range.
    setStretchTouched(true)
    setStretchKn(null)
    setStretchMin('')
    setStretchMax('')
  }, [url.resetNonce])

  const selectKn = (kn: number) => {
    // Clicking the currently-engaged pill toggles the widget off; clicking any
    // other pill — including the non-filtering default hint — engages it. (The
    // default is only engaged after the first explicit click, so it never filters
    // on load.)
    if (stretchTouched && stretchKn === kn) {
      setStretchKn(null)
    } else {
      setStretchTouched(true)
      setStretchKn(kn)
    }
  }

  const { activePills, activeRanges } = useMemo(() => {
    const activePills: Record<string, string[]> = {}
    const activeRanges: Record<string, RangeBounds> = {}
    if (meta) {
      for (const g of filterGroupsFor(meta.slug)) {
        if (g.type === 'pill') {
          const values = url.getPillValues(g.group)
          if (values.length) activePills[g.group] = values
        } else {
          const r = url.getRange(g.group)
          if (r.min != null || r.max != null) activeRanges[g.group] = r
        }
      }
    }
    return { activePills, activeRanges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.params, meta])

  const visible = useMemo(() => {
    const searched = filterBySearch(items, q) as unknown as AnyItem[]
    let filtered = applyFilters(searched, activePills, activeRanges)
    if (displayKn != null) {
      // Attach stretch % at the reference kN for the cards + stretch sort.
      filtered = filtered.map(it => ({ ...it, stretch_percent: percentAtKn(it.stretch, displayKn) }))
      // Exclusion only once a pill is engaged (filterKn), not on the default.
      if (filterKn != null) {
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
    }
    return sortItems(filtered, sort)
  }, [items, q, activePills, activeRanges, displayKn, filterKn, stretchMin, stretchMax, sort])

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
        <FilterSidebar meta={meta} items={items as unknown as AnyItem[]} url={url}>
          {isWebbing && (
            <StretchFilter
              items={items as unknown as AnyItem[]}
              displayKn={displayKn}
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
              value={q}
              onChange={e => setQ(e.target.value)}
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
                  data-cy="view-chart"
                  type="button"
                  data-active={view === 'chart' ? 'true' : 'false'}
                  onClick={() => setView('chart')}
                  className={`border-l border-gray-300 ${viewBtn(view === 'chart')}`}
                >
                  Chart
                </button>
              </div>
              <SortDropdown
                slug={meta.slug}
                sort={sort}
                onChange={setSort}
                stretchKns={
                  isWebbing
                    ? // Ranked by count (most common first) so the dropdown's default
                      // stretch-sort kN matches the filter's default reference kN.
                      topKnPoints(items as unknown as { stretch?: unknown }[]).map(p => p.kn)
                    : []
                }
              />
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState onClear={url.clearAll} />
          ) : (
            <>
              <div className={view === 'chart' ? 'hidden' : ''}>
                <GearGrid items={visible} meta={meta} />
              </div>
              <div className={view === 'cards' ? 'hidden' : ''}>
                <GearTable items={visible} meta={meta} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
