// The brand line of a listing item: the maker, or — for a collapsed
// generic-part group (utils/groups.ts) — the shops selling it, each its own
// brand link, three at most and "+N" for the rest.

import BrandLink from '@/components/brand/BrandLink'
import { isGroupItem, vendorNames } from '@/utils/groups'
import type { AnyItem } from '@/utils/format'

const SHOWN = 3

export default function VendorBrands({ item }: { item: AnyItem }) {
  if (!isGroupItem(item)) return <BrandLink name={item.brand_name} />
  const names = vendorNames(item._members)
  const rest = names.length - SHOWN
  return (
    <span data-cy="group-vendors" data-count={names.length}>
      {names.slice(0, SHOWN).map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <BrandLink name={n} />
        </span>
      ))}
      {rest > 0 && <span> +{rest}</span>}
    </span>
  )
}
