// The narrow-screen replacement for the listing toolbar. Below `lg` the filter
// sidebar has nowhere to live, so its entry point moves here: a sticky strip
// under the header carrying search, a Filters button badged with how many
// filters are engaged, a Sort button, and the result count.
//
// It is sticky rather than scrolling away because on a phone the results are the
// whole page — without a pinned entry point, changing a filter means scrolling
// back to the top first.
//
// Contract (mobile.cy.ts):
//   [data-cy="mobile-filter-bar"]
//   [data-cy="mobile-filter-btn"]   data-count="{n}"
//   [data-cy="mobile-sort-btn"]
//
// Search and count reuse the SAME data-cy hooks as the desktop toolbar
// (search-input, item-count) — only one of the two bars is ever mounted, so the
// selectors stay single-instance and every existing spec keeps working.

export default function MobileFilterBar({
  query,
  onQueryChange,
  placeholder,
  count,
  filterCount,
  sortLabel,
  onOpenFilters,
  onOpenSort,
  noun = 'item',
}: {
  query: string
  onQueryChange: (next: string) => void
  placeholder: string
  count: number
  filterCount: number
  sortLabel: string
  onOpenFilters: () => void
  onOpenSort: () => void
  noun?: string
}) {
  return (
    <div
      data-cy="mobile-filter-bar"
      // Pins directly beneath the nav, whose height is published as --header-h.
      // z-10 keeps it under the nav (z-20) and the sheet (z-40).
      className="sticky top-[var(--header-h,96px)] z-10 -mx-4 mb-4 border-b border-gray-200 bg-page-bg px-4 py-2.5 lg:hidden"
    >
      <input
        data-cy="search-input"
        type="search"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        // text-base is not cosmetic: iOS Safari zooms the whole page when a
        // focused input's font is under 16px, and never zooms back out.
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus:border-teal-primary focus:outline-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          data-cy="mobile-filter-btn"
          data-count={filterCount}
          type="button"
          onClick={onOpenFilters}
          className={
            'flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ' +
            (filterCount > 0
              ? 'border-teal-primary text-teal-primary'
              : 'border-gray-300 bg-white text-gray-700')
          }
          style={filterCount > 0 ? { background: '#E0F2F1' } : undefined}
        >
          Filters
          {filterCount > 0 && (
            <span className="rounded-full bg-teal-primary px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {filterCount}
            </span>
          )}
        </button>

        <button
          data-cy="mobile-sort-btn"
          type="button"
          onClick={onOpenSort}
          className="flex min-h-11 items-center gap-1 rounded-full border border-gray-300 bg-white px-4 text-sm text-gray-700"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Sort
          </span>
          <span className="max-w-[8rem] truncate">{sortLabel}</span>
        </button>

        <span data-cy="item-count" className="ml-auto shrink-0 text-sm text-gray-500">
          {count} {count === 1 ? noun : `${noun}s`}
        </span>
      </div>
    </div>
  )
}
