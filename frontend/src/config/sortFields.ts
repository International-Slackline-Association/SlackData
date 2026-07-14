// Sort options per gear type. ONLY numeric fields are sortable; enums/booleans
// are filter-only (see search_sort.cy.ts). Name A→Z / Z→A are always present.
// Source of truth for field names/types is slack_data/models/*.py.

import type { GearSlug } from '@/types'

export interface SortFieldMeta {
  field: string
  label: string
  nullLast: boolean // items with null value sort to the bottom in both directions
}

// Present for every gear type.
export const UNIVERSAL_SORT_FIELDS: SortFieldMeta[] = [
  { field: 'price',  label: 'Price',  nullLast: true },
  { field: 'weight', label: 'Weight', nullLast: true },
]

export const EXTRA_SORT_FIELDS: Record<GearSlug, SortFieldMeta[]> = {
  webbings: [
    { field: 'width',             label: 'Width',             nullLast: false },
    { field: 'breaking_strength', label: 'Breaking Strength', nullLast: true },
  ],
  weblocks: [
    { field: 'width_min',         label: 'Min Width',         nullLast: false },
    { field: 'breaking_strength', label: 'Breaking Strength', nullLast: true },
  ],
  leashrings: [
    { field: 'inner_diameter',    label: 'Inner Diameter',    nullLast: true },
    { field: 'outer_diameter',    label: 'Outer Diameter',    nullLast: true },
    { field: 'breaking_strength', label: 'Breaking Strength', nullLast: true },
  ],
  grips: [
    { field: 'width_min',                 label: 'Min Width',          nullLast: false },
    { field: 'wll',                       label: 'WLL',                nullLast: true },
    { field: 'mbs',                       label: 'MBS',                nullLast: true },
    { field: 'common_slipping_threshold', label: 'Slipping Threshold', nullLast: true },
  ],
  rollers: [
    { field: 'breaking_strength', label: 'Breaking Strength', nullLast: true },
  ],
  treepros: [
    { field: 'width',     label: 'Width',     nullLast: true },
    { field: 'length',    label: 'Length',    nullLast: true },
    { field: 'thickness', label: 'Thickness', nullLast: true },
  ],
  starterkits: [
    { field: 'webbing_length', label: 'Webbing Length', nullLast: false },
    { field: 'webbing_width',  label: 'Webbing Width',  nullLast: false },
  ],
  tricklinekits: [
    { field: 'webbing_length', label: 'Webbing Length', nullLast: false },
    { field: 'webbing_width',  label: 'Webbing Width',  nullLast: false },
  ],
  bungees:      [],
  leashringpro: [],
}

export function sortFieldsFor(slug: GearSlug): SortFieldMeta[] {
  return [...UNIVERSAL_SORT_FIELDS, ...(EXTRA_SORT_FIELDS[slug] ?? [])]
}
