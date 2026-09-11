// Sort options per gear type. ONLY numeric fields are sortable; enums/booleans
// are filter-only (see search_sort.cy.ts). Name A→Z / Z→A are always present.
// Source of truth for field names/types is slack_data/models/*.py.

import type { GearSlug } from '@/types'

export interface SortFieldMeta {
  field: string
  label: string
  nullLast: boolean // items with null value sort to the bottom in both directions
}

// Present for every gear type. Price sorts on the currency-normalized value
// (see utils/sort.ts) — the order is therefore the same whichever display
// currency is selected, because converting to any target is one global scalar
// multiply.
export const UNIVERSAL_SORT_FIELDS: SortFieldMeta[] = [
  { field: 'price',  label: 'Price',  nullLast: true },
  { field: 'weight', label: 'Weight', nullLast: true },
]

// Tree protectors don't price "one item" — they come singly or in pairs and
// rank on what one protector costs (see DESIGN.md § Units survive conversion),
// so their price row says so. Webbing is priced per meter but says plain
// "Price": the row sits in a menu the search bar competes with for width, and
// the sidebar's price filter already carries the per-meter wording.
const PRICE_LABELS: Partial<Record<GearSlug, string>> = {
  treepros: 'Price per protector',
}

export const EXTRA_SORT_FIELDS: Record<GearSlug, SortFieldMeta[]> = {
  webbings: [
    { field: 'width',             label: 'Width',             nullLast: false },
    { field: 'breaking_strength', label: 'MBS',               nullLast: true },
  ],
  weblocks: [
    { field: 'width_min',         label: 'Min Width',         nullLast: false },
    { field: 'breaking_strength', label: 'MBS',               nullLast: true },
  ],
  leashrings: [
    { field: 'inner_diameter',    label: 'Inner Diameter',    nullLast: true },
    { field: 'outer_diameter',    label: 'Outer Diameter',    nullLast: true },
    { field: 'breaking_strength', label: 'MBS',               nullLast: true },
  ],
  grips: [
    { field: 'width_min',                 label: 'Min Width',          nullLast: false },
    { field: 'wll',                       label: 'WLL',                nullLast: true },
    { field: 'mbs',                       label: 'MBS',                nullLast: true },
    { field: 'common_slipping_threshold', label: 'Slipping Threshold', nullLast: true },
  ],
  rollers: [
    { field: 'breaking_strength', label: 'MBS',               nullLast: true },
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
  const universal = UNIVERSAL_SORT_FIELDS.map(f =>
    f.field === 'price' && PRICE_LABELS[slug] ? { ...f, label: PRICE_LABELS[slug]! } : f,
  )
  return [...universal, ...(EXTRA_SORT_FIELDS[slug] ?? [])]
}

// ── Table view: which spec-row columns are clickable headers ─────────────────
// The table's columns come from SPEC_ROWS (config/specRows.ts), its sorting from
// the list above — two configs keyed by field name, which agree everywhere
// except where a spec row is a COMPOSITE. `width_range` folds width_min +
// width_max into one cell; there is no such column in the data, so the header
// sorts on the bound the Sort dropdown already offers. Anything not resolved
// here renders as a plain, unclickable label — including `stretch`, which needs
// a reference kN to mean anything (see sortItems' `stretch@N`) and so stays the
// dropdown's business.
const SPEC_SORT_ALIAS: Record<string, string> = {
  width_range: 'width_min',
}

// The sortable field behind a spec-row field, or null if that column can't sort.
export function sortFieldForSpec(slug: GearSlug, field: string): string | null {
  // The table's per-kN stretch columns sort on themselves: `stretch@N` is a
  // field sortItems resolves against the curve, not a column in the data, so it
  // is in no per-type list here (see utils/table.ts § stretchColumns).
  if (field.startsWith('stretch@')) return field
  const target = SPEC_SORT_ALIAS[field] ?? field
  return sortFieldsFor(slug).some(f => f.field === target) ? target : null
}
