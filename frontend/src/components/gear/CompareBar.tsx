// Sticky bottom bar summarising the current compare selection. Rendered only
// when ≥1 item is selected (the parent guards on that — the bar's very existence
// is part of the contract: compare.cy.ts asserts it does NOT exist at 0).
//
// Selection state (and the item cap) lives in GearListingPage; this component
// is presentational. The "Compare" CTA is disabled below 2 items — you can't
// compare a single thing.
//
// Layout: the bar is `fixed`, so it would otherwise sit on top of the last row
// of cards and the footer. It measures itself and publishes --compare-bar-h,
// which AppLayout turns into page bottom padding (the same trick TopNav uses for
// --header-h). On narrow screens the chips move to their own horizontally
// scrolling line so the count and the CTA always fit on one row.

import { useLayoutEffect, useRef } from 'react'
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
  const barRef = useRef<HTMLDivElement>(null)

  // Publish the height while mounted; reset it to 0 on unmount so the page
  // doesn't keep a phantom gap once the selection is cleared. The bar's height
  // is genuinely variable (chips wrap, safe-area inset differs per device), so
  // observe it rather than hard-coding a value.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--compare-bar-h', `${bar.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(bar)
    return () => {
      ro.disconnect()
      root.style.setProperty('--compare-bar-h', '0px')
    }
  })

  if (items.length === 0) return null

  return (
    <div
      ref={barRef}
      data-cy="compare-bar"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      {/* One instance of every control, re-ordered by breakpoint rather than
          duplicated — a second hidden copy would put two
          [data-cy="compare-bar-view-btn"] nodes in the DOM and break cy.click().
          Mobile order: count · actions / chips-on-their-own-line.
          Desktop order: count · chips · actions (the original row). */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span
          data-cy="compare-bar-count"
          className="order-1 text-sm font-medium text-gray-700"
        >
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>

        {/* Chips scroll sideways on a phone rather than stacking the bar to half
            the screen height when several are selected. On desktop they wrap,
            but ten of them would wrap to three rows and eat the grid, so the
            strip is capped at two rows and scrolls vertically past that. */}
        <div className="order-3 -mx-1 flex w-full items-center gap-2 overflow-x-auto scrollbar-none px-1 sm:order-2 sm:mx-0 sm:w-auto sm:max-h-[4.75rem] sm:flex-1 sm:flex-wrap sm:overflow-x-visible sm:overflow-y-auto sm:px-0">
          {items.map(item => (
            <span
              key={String(item.id)}
              data-cy="compare-bar-item"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1 text-xs text-gray-700"
            >
              <span data-cy="compare-bar-item-name" className="max-w-[10rem] truncate">
                {String(item.name)}
              </span>
              <button
                data-cy="compare-bar-remove"
                type="button"
                aria-label={`Remove ${String(item.name)}`}
                onClick={() => onRemove(Number(item.id))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="order-2 ml-auto flex items-center gap-3 sm:order-3 sm:ml-0">
          <button
            data-cy="compare-bar-clear"
            type="button"
            onClick={onClear}
            className="min-h-11 px-1 text-sm text-gray-500 hover:text-gray-800 hover:underline sm:min-h-0 sm:px-0"
          >
            Clear all
          </button>
          <button
            data-cy="compare-bar-view-btn"
            type="button"
            disabled={items.length < 2}
            onClick={onView}
            className="min-h-11 rounded-full bg-teal-primary px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-2"
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  )
}
