// Gear data access. Resolves a URL slug to its backend apiPath via the registry.

import { getGearType } from '@/config/gearTypes'
import type { GearItem } from '@/types'
import { getAll, getItem } from './client'

function apiPathFor(slug: string): string {
  const meta = getGearType(slug)
  if (!meta) throw new Error(`Unknown gear slug: ${slug}`)
  return meta.apiPath
}

// All items for a gear type (fully paginated).
export function fetchGearList(slug: string): Promise<GearItem[]> {
  return getAll<GearItem>(apiPathFor(slug))
}

// A single gear item by id.
export function fetchGearItem(slug: string, id: number | string): Promise<GearItem> {
  return getItem<GearItem>(apiPathFor(slug), id)
}
