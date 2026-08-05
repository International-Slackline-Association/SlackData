// Per-gear-type filter group configuration for the left sidebar.
//
// Mirrors the FILTER_GROUPS map in cypress/e2e/filters.cy.ts, which was verified
// against slack_data/models/*.py + utilities/. RENDER FROM THIS CONFIG, not from
// model field presence: treepro has an isa_warning model field but no ISA filter
// group here, and kits have isa_certified but no isa_warning — matching the spec.
//
//   'pill'  — enum / boolean / discrete-int field → multi-select toggle buttons
//   'range' — numeric field → a min + max input pair with a unit label
//
// `data-group` MUST equal the Python field name (width_min, breaking_strength,
// isa_certified, …); the tests select groups by it.
//
// Webbing `stretch` is NOT here — it's a bespoke widget (StretchFilter) handled
// separately, because it's a JSON curve of {kn, percent} pairs, not a scalar.

import type { GearSlug } from '@/types'
import { CLASSIFICATIONS, WEBLOCK_STYLES } from '@/types/enums'

export type FilterType = 'pill' | 'range'

// How a pill group's values are derived + displayed. Values themselves are
// always pulled from the loaded dataset (no phantom options), but the kind
// controls display: booleans render Yes/No, ints/enums render their raw value.
export type PillKind = 'enum' | 'int' | 'bool'

export interface FilterGroupMeta {
  group: string        // == Python field name, and the data-group attribute
  label: string        // human label shown in the sidebar (asserted by tests)
  type: FilterType
  unit?: string        // shown next to range inputs / int pills (mm, kN, g, …)
  pillKind?: PillKind  // pills only; defaults to 'enum'
  capitalize?: boolean // pills only; title-case the display labels (e.g. pair→Pair)
  // pills only; canonical value order for fields whose domain order is meaningful
  // rather than alphabetical. Values not listed here sort after, alphabetically.
  order?: readonly string[]
}

export const FILTER_GROUPS: Record<GearSlug, FilterGroupMeta[]> = {
  webbings: [
    { group: 'material',          label: 'Material Type',     type: 'pill', pillKind: 'enum' },
    { group: 'width',             label: 'Width',             type: 'range', unit: 'mm' },
    // Best-to-worst, mirroring _CLASSIFICATION_RANK in models/webbing.py — NOT
    // alphabetical, which would sort "A" before "A+".
    { group: 'classification',    label: 'Classification',    type: 'pill', pillKind: 'enum',
      order: CLASSIFICATIONS },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g/m' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
    // + the Stretch widget (StretchFilter), appended in the sidebar for webbings
  ],

  weblocks: [
    { group: 'style',             label: 'Style',             type: 'pill', pillKind: 'enum',
      order: WEBLOCK_STYLES },
    { group: 'material',          label: 'Material',          type: 'pill', pillKind: 'enum' },
    { group: 'width_min',         label: 'Min Width',         type: 'range', unit: 'mm' },
    { group: 'front_pin',         label: 'Front Pin',         type: 'pill', pillKind: 'enum' },
    { group: 'attachment_point',  label: 'Attachment Point',  type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  leashrings: [
    { group: 'material',          label: 'Material',          type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum' },
    { group: 'inner_diameter',    label: 'Inner Diameter',    type: 'range', unit: 'mm' },
    { group: 'outer_diameter',    label: 'Outer Diameter',    type: 'range', unit: 'mm' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  grips: [
    { group: 'material',                  label: 'Material',           type: 'pill', pillKind: 'enum' },
    { group: 'width_min',                 label: 'Min Width',          type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'connection_type',           label: 'Connection Type',    type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',             label: 'ISA Certified',      type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',               label: 'ISA Warning',        type: 'pill', pillKind: 'enum' },
    { group: 'weight',                    label: 'Weight',             type: 'range', unit: 'g' },
    { group: 'wll',                       label: 'WLL',                type: 'range', unit: 'kN' },
    { group: 'mbs',                       label: 'MBS',                type: 'range', unit: 'kN' },
    { group: 'common_slipping_threshold', label: 'Slipping Threshold', type: 'range', unit: 'kN' },
  ],

  rollers: [
    { group: 'material',          label: 'Frame Material',    type: 'pill', pillKind: 'enum' },
    { group: 'roller_material',   label: 'Roller Material',   type: 'pill', pillKind: 'enum' },
    { group: 'slider_type',       label: 'Slider Type',       type: 'pill', pillKind: 'enum' },
    { group: 'lock_type',         label: 'Lock Type',         type: 'pill', pillKind: 'enum' },
    { group: 'bearing_material',  label: 'Bearing Material',  type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  treepros: [
    { group: 'has_sling_attachment', label: 'Sling Attachment', type: 'pill', pillKind: 'bool' },
    { group: 'price_unit',           label: 'Sold As',          type: 'pill', pillKind: 'enum', capitalize: true },
    { group: 'weight',               label: 'Weight',           type: 'range', unit: 'g' },
    { group: 'width',                label: 'Width',            type: 'range', unit: 'cm' },
    { group: 'length',               label: 'Length',           type: 'range', unit: 'cm' },
    { group: 'thickness',            label: 'Thickness',        type: 'range', unit: 'mm' },
  ],

  starterkits: [
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill', pillKind: 'enum' },
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', pillKind: 'int', unit: 'm' },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill', pillKind: 'bool' },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'weight',           label: 'Kit Weight',        type: 'range', unit: 'g' },
  ],

  tricklinekits: [
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill', pillKind: 'enum' },
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', pillKind: 'int', unit: 'm' },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill', pillKind: 'bool' },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    // Kit Weight is intentionally NOT filterable for trickline kits: only 2 of 9
    // carry weight data, so a slider would be misleading.
  ],

  // Upcoming types have no data / no listing yet.
  bungees: [],
  leashringpro: [],
}

export function filterGroupsFor(slug: GearSlug): FilterGroupMeta[] {
  return FILTER_GROUPS[slug] ?? []
}
