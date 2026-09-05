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
import { WEBLOCK_STYLES } from '@/types/enums'
import { BRAND_GROUP } from './brandGroup'

export { BRAND_GROUP }

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
  // The item field the filter READS, when it isn't `group`. Two groups use it,
  // both keeping a URL key that reads the way the sidebar does while comparing
  // a value the listing derives:
  //   price → price_display, because comparing raw amounts across fourteen
  //           currencies is meaningless (DESIGN.md § Currency & Prices);
  //   brand → brands, the maker plus every brand co-listing the item
  //           (utils/sellers.ts), because "who sells it" is the question.
  valueField?: string
  // Range groups only: the unit follows the viewer's display currency rather
  // than being a fixed string like "mm". Price is the only such group.
  currencyUnit?: boolean
  pillKind?: PillKind  // pills only; defaults to 'enum'
  // pills only; a group whose option list can grow long enough to need a search
  // box + a fold (see foldPillOptions). Brand is the only one.
  searchable?: boolean
  capitalize?: boolean // pills only; title-case the display labels (e.g. pair→Pair)
  // pills only; canonical value order for fields whose domain order is meaningful
  // rather than alphabetical. Values not listed here sort after, alphabetically.
  // No group uses it today (classification, the one ranked domain, is no longer a
  // filter) — kept for the next ranked enum.
  order?: readonly string[]
  // pills only; offer an explicit "None" pill for items with no value in this
  // field, instead of silently excluding them. Only isa_warning uses it: an
  // absent warning is a real answer people filter on ("show me the gear with
  // nothing against it"), unlike an absent material, which just means unknown.
  includeNone?: boolean
}

// Severity order for the ISA Warning pills — None, then worst to mildest.
// Alphabetical would read "Notice · Recall · Warning", which buries the recall
// in the middle. Values are omitted when no item of that type carries them, so
// a gear type with no recalls simply has no Recall pill (see derivePillOptions).
export const ISA_WARNING_ORDER = ['none', 'Recall', 'Warning', 'Notice'] as const

export const FILTER_GROUPS: Record<GearSlug, FilterGroupMeta[]> = {
  webbings: [
    // Price leads every sidebar — it's the filter people reach for first, and
    // the only one meaningful for all 8 gear types.
    { group: 'price', label: 'Price per meter', type: 'range',
      valueField: 'price_display', currencyUnit: true },
    { group: 'material',          label: 'Material Type',     type: 'pill', pillKind: 'enum' },
    { group: 'width',             label: 'Width',             type: 'range', unit: 'mm' },
    // No Classification group: the ISA class is only meaningful on an
    // ISA-certified webbing, so it reads as a badge on those items rather than
    // as a filter axis across the whole catalogue (filter by ISA Certified
    // instead).
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum',
      order: ISA_WARNING_ORDER, includeNone: true },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g/m' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
    // + the Stretch widget (StretchFilter), appended in the sidebar for webbings
    // Brand comes LAST — and on webbings the sidebar puts it below the stretch
    // widget as well (see FilterSidebar): it is the longest group there is and
    // the least specific, so it sits under the spec filters people scroll for
    // rather than pushing them beneath a wall of brand pills.
    BRAND_GROUP,
  ],

  weblocks: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'style',             label: 'Style',             type: 'pill', pillKind: 'enum',
      order: WEBLOCK_STYLES },
    { group: 'material',          label: 'Material',          type: 'pill', pillKind: 'enum' },
    { group: 'width_min',         label: 'Min Width',         type: 'range', unit: 'mm' },
    { group: 'front_pin',         label: 'Front Pin',         type: 'pill', pillKind: 'enum' },
    { group: 'attachment_point',  label: 'Attachment Point',  type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum',
      order: ISA_WARNING_ORDER, includeNone: true },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  leashrings: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'material',          label: 'Material',          type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum',
      order: ISA_WARNING_ORDER, includeNone: true },
    { group: 'inner_diameter',    label: 'Inner Diameter',    type: 'range', unit: 'mm' },
    { group: 'outer_diameter',    label: 'Outer Diameter',    type: 'range', unit: 'mm' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  grips: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'material',                  label: 'Material',           type: 'pill', pillKind: 'enum' },
    { group: 'width_min',                 label: 'Min Width',          type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'connection_type',           label: 'Connection Type',    type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',             label: 'ISA Certified',      type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',               label: 'ISA Warning',        type: 'pill', pillKind: 'enum',
      order: ISA_WARNING_ORDER, includeNone: true },
    { group: 'weight',                    label: 'Weight',             type: 'range', unit: 'g' },
    { group: 'wll',                       label: 'WLL',                type: 'range', unit: 'kN' },
    { group: 'mbs',                       label: 'MBS',                type: 'range', unit: 'kN' },
    { group: 'common_slipping_threshold', label: 'Slipping Threshold', type: 'range', unit: 'kN' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  rollers: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'material',          label: 'Frame Material',    type: 'pill', pillKind: 'enum' },
    { group: 'roller_material',   label: 'Roller Material',   type: 'pill', pillKind: 'enum' },
    { group: 'slider_type',       label: 'Slider Type',       type: 'pill', pillKind: 'enum' },
    { group: 'lock_type',         label: 'Lock Type',         type: 'pill', pillKind: 'enum' },
    { group: 'bearing_material',  label: 'Bearing Material',  type: 'pill', pillKind: 'enum' },
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill', pillKind: 'enum',
      order: ISA_WARNING_ORDER, includeNone: true },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  treepros: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'has_sling_attachment', label: 'Sling Attachment', type: 'pill', pillKind: 'bool' },
    { group: 'price_unit',           label: 'Sold As',          type: 'pill', pillKind: 'enum', capitalize: true },
    { group: 'weight',               label: 'Weight',           type: 'range', unit: 'g' },
    { group: 'width',                label: 'Width',            type: 'range', unit: 'cm' },
    { group: 'length',               label: 'Length',           type: 'range', unit: 'cm' },
    { group: 'thickness',            label: 'Thickness',        type: 'range', unit: 'mm' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  starterkits: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill', pillKind: 'enum' },
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', pillKind: 'int', unit: 'm' },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill', pillKind: 'bool' },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    { group: 'weight',           label: 'Kit Weight',        type: 'range', unit: 'g' },
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  tricklinekits: [
    { group: 'price', label: 'Price', type: 'range', valueField: 'price_display', currencyUnit: true },
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill', pillKind: 'enum' },
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', pillKind: 'int', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', pillKind: 'int', unit: 'm' },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill', pillKind: 'bool' },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill', pillKind: 'bool' },
    // Kit Weight is intentionally NOT filterable for trickline kits: only 2 of 9
    // carry weight data, so a slider would be misleading.
    // Brand comes LAST: it is the longest group in the sidebar (45 brands on
    // webbings, even folded) and the least specific, so it sits below the spec
    // filters people scroll for rather than pushing them under a wall of pills.
    BRAND_GROUP,
  ],

  // Upcoming types have no data / no listing yet.
  bungees: [],
  leashringpro: [],
}

export function filterGroupsFor(slug: GearSlug): FilterGroupMeta[] {
  return FILTER_GROUPS[slug] ?? []
}
