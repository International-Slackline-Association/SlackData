// Brand directory data: every brand, plus every gear item grouped by type.
//
// Why the gear fetch is unavoidable: BrandPublic (slack_data/models/brands.py)
// declares only `webbings: list[str]` among the gear lists. The other seven
// computed fields exist on the ORM model but are NOT in the response schema, so
// the API cannot tell us how many weblocks/rollers/… a brand has. We derive all
// eight counts client-side by grouping each gear endpoint on `brand_name` —
// which is exactly how manufacturers.cy.ts computes its expectations.
//
// Shared by ManufacturersPage (counts per card) and BrandDetailPage (the actual
// items for one brand), so both agree on brand→gear membership by construction.

import { useEffect, useMemo, useState } from 'react'
import { fetchGearList } from '@/api/gear'
import { getAll } from '@/api/client'
import { GEAR_TYPES } from '@/config/gearTypes'
import type { Brand, GearItem, GearSlug } from '@/types'

export type GearBySlug = Partial<Record<GearSlug, GearItem[]>>

export interface BrandWithCounts extends Brand {
  // One entry per available gear type; 0 when the brand has none.
  counts: Record<string, number>
  total: number
}

export function useBrandDirectory() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [gearBySlug, setGearBySlug] = useState<GearBySlug>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getAll<Brand>('brand'),
      Promise.all(GEAR_TYPES.map(t => fetchGearList(t.slug))),
    ])
      .then(([brandList, gearLists]) => {
        if (cancelled) return
        const bySlug: GearBySlug = {}
        GEAR_TYPES.forEach((t, i) => {
          bySlug[t.slug] = gearLists[i]
        })
        setBrands(brandList)
        setGearBySlug(bySlug)
      })
      .catch(err => {
        if (!cancelled) setError(err as Error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // brand name → per-slug counts. Built once per fetch rather than per card, so
  // the page stays O(items) instead of O(brands × items).
  const countsByBrand = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const type of GEAR_TYPES) {
      for (const item of gearBySlug[type.slug] ?? []) {
        const name = String((item as unknown as Record<string, unknown>).brand_name ?? '')
        if (!name) continue
        let row = map.get(name)
        if (!row) {
          row = {}
          map.set(name, row)
        }
        row[type.slug] = (row[type.slug] ?? 0) + 1
      }
    }
    return map
  }, [gearBySlug])

  const brandsWithCounts = useMemo<BrandWithCounts[]>(
    () =>
      brands.map(brand => {
        const row = countsByBrand.get(brand.name) ?? {}
        // Every available type gets an explicit 0 so the card can always emit a
        // data-count-* attribute for it (the spec reads all eight).
        const counts: Record<string, number> = {}
        let total = 0
        for (const type of GEAR_TYPES) {
          const n = row[type.slug] ?? 0
          counts[type.slug] = n
          total += n
        }
        return { ...brand, counts, total }
      }),
    [brands, countsByBrand],
  )

  return { brands: brandsWithCounts, gearBySlug, loading, error }
}
