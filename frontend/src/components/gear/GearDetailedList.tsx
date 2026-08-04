// Detailed view — the listing's alternative to the card grid (DESIGN.md
// § Detailed View). Every matching item is rendered as a full-width panel
// carrying its complete spec sheet, stacked vertically; the page's own
// scrollbar moves through them. Same items, same filters and sort order as the
// grid — only the density differs.
//
// Panels share GearDetailBody with the standalone detail page, so a spec row
// added there shows up here for free. Unlike the grid, this list is mounted
// ONLY while its view is active: the panels reuse the detail page's data-cy
// hooks, and leaving them hidden in the DOM would double the counts that
// gear_cards.cy.ts reads off the grid.

import type { GearTypeMeta } from '@/config/gearTypes'
import type { AnyItem } from '@/utils/format'
import GearDetailBody from './GearDetailBody'

export default function GearDetailedList({
  items,
  meta,
  selectedIds = [],
  compareFull = false,
  onToggleCompare,
}: {
  items: AnyItem[]
  meta: GearTypeMeta
  selectedIds?: number[]
  compareFull?: boolean
  onToggleCompare?: (id: number) => void
}) {
  return (
    <div data-cy="gear-detailed-list" className="flex flex-col gap-5">
      {items.map(item => {
        // Same derivation as GearGrid: when the selection is full, only the
        // buttons that aren't themselves selected go disabled — so a selected
        // panel can always be toggled back off.
        const selected = selectedIds.includes(Number(item.id))
        return (
          <article
            data-cy="gear-detailed-row"
            key={String(item.id)}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <GearDetailBody
              item={item}
              meta={meta}
              nameHref={`/${meta.slug}/${item.id}`}
              showActions
              compareSelected={selected}
              compareDisabled={compareFull && !selected}
              onToggleCompare={onToggleCompare}
            />
          </article>
        )
      })}
    </div>
  )
}
