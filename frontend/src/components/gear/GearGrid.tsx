// Card grid (3 columns at ≥lg, per DESIGN.md). `className` lets the page hide it
// (display:none) when the Detailed view is active while keeping it in the DOM.

import type { GearTypeMeta } from '@/config/gearTypes'
import type { AnyItem } from '@/utils/format'
import GearCard from './GearCard'

export default function GearGrid({
  items,
  meta,
  className = '',
  selectedIds = [],
  compareFull = false,
  onToggleCompare,
}: {
  items: AnyItem[]
  meta: GearTypeMeta
  className?: string
  selectedIds?: number[]
  compareFull?: boolean
  onToggleCompare?: (id: number) => void
}) {
  return (
    <div
      data-cy="gear-grid"
      className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      {items.map(item => {
        const selected = selectedIds.includes(Number(item.id))
        return (
          <GearCard
            key={String(item.id)}
            item={item}
            meta={meta}
            compareSelected={selected}
            compareDisabled={compareFull && !selected}
            onToggleCompare={onToggleCompare}
          />
        )
      })}
    </div>
  )
}
