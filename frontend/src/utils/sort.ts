// Client-side sorting for the listing.
//
// Name is the default AND the universal tie-breaker:
//   - A null/absent sort sorts alphabetically by name (ascending). A fresh load
//     of the listing is therefore alphabetical.
//   - Numeric sorts (e.g. mbs) break ties on equal values — and order among
//     null/blank values — alphabetically by name, always ascending regardless of
//     the numeric direction.
// Numeric sorts put nulls/blanks last in both directions.

import type { SortSpec } from '@/hooks/useUrlState'
import type { AnyItem } from '@/utils/format'
import { compareByBrand as byBrand, compareByName as byName } from '@/utils/compare'
import { percentAtRoundedKn } from '@/utils/stretch'

// Compare two nullable numbers with the shared listing rules: nulls last in both
// directions, ties (incl. both-null) fall back to name ascending.
function compareNumeric(
  a: AnyItem,
  b: AnyItem,
  an: number | null,
  bn: number | null,
  factor: number,
): number {
  if (an === null && bn === null) return byName(a, b)
  if (an === null) return 1
  if (bn === null) return -1
  if (an === bn) return byName(a, b)
  return factor * (an - bn)
}

export function sortItems(items: AnyItem[], sort: SortSpec | null): AnyItem[] {
  // Default (no sort) and explicit Name sort are both alphabetical by name.
  if (!sort || sort.field === 'name') {
    const factor = sort && sort.direction === 'desc' ? -1 : 1
    return [...items].sort((a, b) => factor * byName(a, b))
  }

  const { field, direction } = sort
  const factor = direction === 'asc' ? 1 : -1

  // Manufacturer: the table view's other identity sort. Alphabetical, not
  // numeric — falling through to the numeric path below would Number() every
  // brand name to NaN, read them all as null, and leave the list in name order
  // while the header claimed it was sorted by maker. Names stay ascending
  // inside a brand whichever way the brand runs, which is the same tie-break
  // rule the numeric sorts follow.
  if (field === 'brand_name') {
    return [...items].sort((a, b) => factor * byBrand(a, b) || byName(a, b))
  }
  // Price is the one field whose stored number can't be compared item to item:
  // it's in whatever currency the seller charges, so "Price Low→High" on the raw
  // values ranks a 5377 RUB grip against an 89 USD one. Order on the normalized
  // value the listing attaches instead. The URL and the sort dropdown still say
  // `price` — this is purely which number gets compared.
  const key = field === 'price' ? 'price_base' : field

  // Webbing stretch sort. The field carries the reference kN (`stretch@10`), so
  // sorting by stretch is self-contained — it reads the % at that kN straight off
  // each item's curve, independent of whichever kN the filter widget is showing.
  // The lookup is the ROUNDED one, because the table view's per-kN columns are
  // sorted through this same field and must rank on the number they print.
  if (field.startsWith('stretch@')) {
    const kn = Number(field.slice('stretch@'.length))
    return [...items].sort((a, b) =>
      compareNumeric(a, b, percentAtRoundedKn(a.stretch, kn), percentAtRoundedKn(b.stretch, kn), factor),
    )
  }

  return [...items].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const an = av == null || av === '' ? null : Number(av)
    const bn = bv == null || bv === '' ? null : Number(bv)
    return compareNumeric(a, b, an, bn, factor)
  })
}
