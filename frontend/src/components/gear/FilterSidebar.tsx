// Left filter sidebar. Phase 3 renders the container + header; the filter groups
// (pills, ranges, stretch widget) are built in Phase 4.

import type { GearTypeMeta } from '@/config/gearTypes'

export default function FilterSidebar({ meta }: { meta: GearTypeMeta }) {
  return (
    <aside data-cy="filter-sidebar" className="w-[280px] shrink-0">
      <div
        data-cy="filter-sidebar-header"
        className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
      >
        Find your {meta.label.toUpperCase()}
      </div>
      {/* filter groups added in Phase 4 */}
    </aside>
  )
}
