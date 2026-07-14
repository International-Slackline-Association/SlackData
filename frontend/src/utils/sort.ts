// Client-side sorting for the listing.
//
// A null/absent sort = the backend's own order (the gear_cards tests assert the
// first card matches the API's first item, so the default must NOT reorder).
// Name sorts use locale compare; numeric sorts put nulls/blanks last in both
// directions.

import type { SortSpec } from '@/hooks/useUrlState'
import type { AnyItem } from '@/utils/format'

export function sortItems(items: AnyItem[], sort: SortSpec | null): AnyItem[] {
  if (!sort) return items // default: backend order

  const { field, direction } = sort
  const factor = direction === 'asc' ? 1 : -1

  if (field === 'name') {
    return [...items].sort(
      (a, b) => factor * String(a.name).localeCompare(String(b.name)),
    )
  }

  return [...items].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    const an = av == null || av === '' ? null : Number(av)
    const bn = bv == null || bv === '' ? null : Number(bv)
    if (an === null && bn === null) return 0
    if (an === null) return 1 // nulls last, regardless of direction
    if (bn === null) return -1
    return factor * (an - bn)
  })
}
