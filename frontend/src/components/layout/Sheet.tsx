// Bottom sheet — the mobile home for controls that are a sidebar or a popover on
// desktop (filters, sort, the manufacturers country filter).
//
// Why a sheet and not a full-screen drawer: filters are judged by their effect,
// and the sheet caps at 85dvh so a strip of results stays visible behind it. The
// footer carries a live "Show N results" count so the effect is legible even
// where the sheet does cover the grid.
//
// Contract (mobile.cy.ts):
//   [data-cy="sheet"]         the panel (absent from the DOM when closed)
//   [data-cy="sheet-scrim"]   the backdrop; tapping it closes
//   [data-cy="sheet-close"]   the × button
//   [data-cy="sheet-footer"]  present only when `footer` is passed
//
// Nothing is rendered while closed — callers mount this conditionally, so the
// children (e.g. FilterSidebar) stay single-instance in the DOM.

import { useEffect, useRef, type ReactNode } from 'react'

export default function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc closes, and the page behind must not scroll while the sheet owns the
  // screen — otherwise a flick meant for the filter list drags the grid instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      // Send focus back where it came from — the Filters button — so a keyboard
      // or screen-reader user isn't dropped at the top of the document.
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  // Move focus into the panel on open so the sheet, not the page behind it, is
  // what the next Tab walks through.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div
        data-cy="sheet-scrim"
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
      />

      <div
        ref={panelRef}
        data-cy="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.15)] outline-none"
      >
        {/* Drag handle — visual affordance only; the sheet is dismissed by the
            × , the scrim or Esc. A real drag gesture would fight the inner
            scroll region for the same vertical swipe. */}
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button
            data-cy="sheet-close"
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            ×
          </button>
        </div>

        {/* The one scroll region. `overscroll-contain` stops a flick that hits
            the end of the list from scrolling the page behind the sheet. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>

        {footer && (
          <div
            data-cy="sheet-footer"
            className="shrink-0 border-t border-gray-200 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
