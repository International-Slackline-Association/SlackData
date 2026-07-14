// Central gear-type registry. Single source of truth for the nav tabs, routing,
// and API path resolution.
//
// `GEAR_TYPES` are the eight data-backed types the test suite iterates over
// (mirrors cypress/support/gear_types.ts) and the only ones rendered as
// [data-cy="nav-tab"]. `UPCOMING_GEAR_TYPES` are categories with no data yet —
// shown in the nav (as [data-cy="nav-tab-upcoming"]) and routing to a
// "coming soon" listing. `ALL_GEAR_TYPES` is the full nav order.

import type { GearSlug } from '@/types'

export interface GearTypeMeta {
  slug: GearSlug
  apiPath: string        // backend router prefix (singular)
  label: string          // human label shown in the nav + headings
  hasISA: boolean        // has an isa_certified field
  hasISAWarning: boolean // has an isa_warning field
  available: boolean      // false = no data/router yet (coming soon)
}

export const GEAR_TYPES: GearTypeMeta[] = [
  { slug: 'webbings',      apiPath: 'webbing',      label: 'Webbings',        hasISA: true,  hasISAWarning: true,  available: true },
  { slug: 'weblocks',      apiPath: 'weblock',      label: 'Weblocks',        hasISA: true,  hasISAWarning: true,  available: true },
  { slug: 'leashrings',    apiPath: 'leashring',    label: 'Leash Rings',     hasISA: true,  hasISAWarning: true,  available: true },
  { slug: 'grips',         apiPath: 'grip',         label: 'Grips',           hasISA: true,  hasISAWarning: true,  available: true },
  { slug: 'rollers',       apiPath: 'roller',       label: 'Rollers',         hasISA: true,  hasISAWarning: true,  available: true },
  { slug: 'treepros',      apiPath: 'treepro',      label: 'Tree Protectors', hasISA: false, hasISAWarning: false, available: true },
  { slug: 'starterkits',   apiPath: 'starterkit',   label: 'Starter Kits',    hasISA: true,  hasISAWarning: false, available: true },
  { slug: 'tricklinekits', apiPath: 'tricklinekit', label: 'Trickline Kits',  hasISA: true,  hasISAWarning: false, available: true },
]

export const UPCOMING_GEAR_TYPES: GearTypeMeta[] = [
  { slug: 'bungees',      apiPath: 'bungee',      label: 'Bungees',        hasISA: false, hasISAWarning: false, available: false },
  { slug: 'leashringpro', apiPath: 'ringpadding', label: 'Leash Ring Pro', hasISA: false, hasISAWarning: false, available: false },
]

export const ALL_GEAR_TYPES: GearTypeMeta[] = [...GEAR_TYPES, ...UPCOMING_GEAR_TYPES]

const BY_SLUG = new Map(ALL_GEAR_TYPES.map(g => [g.slug, g]))

export function getGearType(slug: string): GearTypeMeta | undefined {
  return BY_SLUG.get(slug as GearSlug)
}

export function isGearSlug(slug: string): slug is GearSlug {
  return BY_SLUG.has(slug as GearSlug)
}
