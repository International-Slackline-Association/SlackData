// Gear listing page: filter sidebar + toolbar (search / count / view toggle /
// sort) + card grid or chart table.
//
// Grid and table are both mounted when there are results; the inactive one is
// hidden (display:none) so the view toggle just flips visibility. When there are
// no results, an empty state with a clear-filters action replaces both.

import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import { useGearList } from '@/hooks/useGearList'
import { useUrlState } from '@/hooks/useUrlState'
import { filterBySearch } from '@/utils/search'
import { sortItems } from '@/utils/sort'
import type { AnyItem } from '@/utils/format'
import FilterSidebar from '@/components/gear/FilterSidebar'
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
  const { q, setQ, sort, setSort, clearAll } = useUrlState()
  const [view, setView] = useState<View>('cards')

  const visible = useMemo(() => {
    const filtered = filterBySearch(items, q)
    return sortItems(filtered as unknown as AnyItem[], sort)
  }, [items, q, sort])

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
        <FilterSidebar meta={meta} />

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
              <SortDropdown slug={meta.slug} sort={sort} onChange={setSort} />
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState onClear={clearAll} />
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
