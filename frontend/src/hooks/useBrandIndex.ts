// Every brand's name → id, fetched once per page load.
//
// Same shape and same reasoning as useIsaWarnings: the brand table is ~76 rows
// and static between deploys, while the thing that needs it renders once per
// card — one request beats one per link. The promise is cached module-side, so
// a listing, a detail page and the compare table share a single fetch.
//
// A failed fetch resolves to an empty index rather than rejecting: every caller
// already has a "no id for this name" branch (it renders the plain name), so
// losing the directory costs the links and nothing else.

import { useEffect, useState } from 'react'
import { fetchBrands } from '@/api/brands'
import { buildBrandIndex, type BrandIndex } from '@/utils/brandLinks'

let cache: Promise<BrandIndex> | null = null

function load(): Promise<BrandIndex> {
  cache ??= fetchBrands()
    .then(buildBrandIndex)
    .catch(() => new Map<string, number>())
  return cache
}

/** Empty until the fetch resolves. */
export function useBrandIndex(): BrandIndex {
  const [index, setIndex] = useState<BrandIndex | null>(null)

  useEffect(() => {
    let cancelled = false
    load().then(result => {
      if (!cancelled) setIndex(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return index ?? EMPTY
}

// One shared empty map, so the pre-load return value is referentially stable
// and a consumer's useMemo on it doesn't re-run every render.
const EMPTY: BrandIndex = new Map()
