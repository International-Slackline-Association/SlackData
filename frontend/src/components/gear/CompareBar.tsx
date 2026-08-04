// Sticky bottom bar summarising the current compare selection. Rendered only
// when ≥1 item is selected (the parent guards on that — the bar's very existence
// is part of the contract: compare.cy.ts asserts it does NOT exist at 0).
//
// Selection state (and the 4-item cap) lives in GearListingPage; this component
// is presentational. The "Compare" CTA is disabled below 2 items — you can't
// compare a single thing.

import type { AnyItem } from '@/utils/format'

export default function CompareBar({
  items,
  onRemove,
  onClear,
  onView,
}: {
  items: AnyItem[]
  onRemove: (id: number) => void
  onClear: () => void
  onView: () => void
}) {
  if (items.length === 0) return null

  return (
    <div
      data-cy="compare-bar"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <span data-cy="compare-bar-count" className="text-sm font-medium text-gray-700">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {items.map(item => (
            <span
              key={String(item.id)}
              data-cy="compare-bar-item"
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1.5 text-xs text-gray-700"
            >
              <span data-cy="compare-bar-item-name" className="max-w-[10rem] truncate">
                {String(item.name)}
              </span>
              <button
                data-cy="compare-bar-remove"
                type="button"
                aria-label={`Remove ${String(item.name)}`}
                onClick={() => onRemove(Number(item.id))}
                className="flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <button
          data-cy="compare-bar-clear"
          type="button"
          onClick={onClear}
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Clear all
        </button>
        <button
          data-cy="compare-bar-view-btn"
          type="button"
          disabled={items.length < 2}
          onClick={onView}
          className="rounded-full bg-teal-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Compare
        </button>
      </div>
    </div>
  )
}
