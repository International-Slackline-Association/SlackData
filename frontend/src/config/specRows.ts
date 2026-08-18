// Spec-table row definitions for the detail page, per gear type.
//
// Contract: `gear_detail.cy.ts` reads [data-cy="spec-row"][data-field="<field>"]
// and (where a unit is declared) asserts the unit text is inside the row. The
// `field` values mirror slack_data/models/*.py, plus two synthetic composites
// (`width_range` on weblocks/grips) that fold width_min + width_max into one row.
//
// Row visibility rule: a row renders iff `value(item)` is non-empty. Required
// model fields therefore always render; nullable ones drop out on their own.
// Booleans are never null, so they always render as Yes/No — DESIGN.md's
// "omit when false" is superseded by the spec, which asserts the row exists for
// the first item with a non-null value (which may well be `false`).

import type { GearSlug } from '@/types'
import { formatValue, type AnyItem } from '@/utils/format'
import { displayPoints } from '@/utils/stretch'

// How the value is drawn. 'text' is the default; the others get bespoke markup
// in SpecTable (color-name chips, the stretch curve table).
export type SpecRender = 'text' | 'chips' | 'stretch'

// Formats an item's price in the viewer's display currency. Supplied by the
// caller (from CurrencyContext) rather than imported, because a row's value is
// otherwise a pure function of the item — and money isn't: the same item reads
// "€89" or "≈ $96" depending on who's looking.
export type PriceFormatter = (
  item: AnyItem,
) => { text: string; original: string | null } | null

export interface SpecRowDef {
  field: string
  label: string
  unit?: string
  render?: SpecRender
  // Display value; '' means "omit this row".
  value: (item: AnyItem, money?: PriceFormatter) => string
  // Small gray line beneath the value in a compare cell — the as-sold price.
  secondary?: (item: AnyItem, money?: PriceFormatter) => string
  // Declared for the compare table but suppressed on the detail page, where the
  // price already sits in the header block above the spec grid.
  compareOnly?: boolean
}

// The shared Price row, first in every gear type's table. This is what puts
// price on the compare page at all: compare renders SPEC_ROWS, so before this
// existed you could compare two weblocks on weight and breaking strength but
// not on what they cost.
function priceRow(label = 'Price'): SpecRowDef {
  return {
    field: 'price',
    label,
    compareOnly: true,
    value: (item, money) => {
      if (item.price == null) return ''
      // No formatter (a caller that doesn't do money) → fall back to the raw
      // as-sold figure rather than rendering nothing.
      const parts = money?.(item)
      return parts ? parts.text : `${item.price} ${item.currency ?? ''}`.trim()
    },
    secondary: (item, money) => money?.(item)?.original ?? '',
  }
}

// Plain field lookup, unit appended.
function plain(field: string, label: string, unit?: string): SpecRowDef {
  return { field, label, unit, value: item => formatValue(item[field], unit) }
}

// Boolean → Yes / No (never omitted; booleans are non-null in every model).
function yesNo(field: string, label: string): SpecRowDef {
  return { field, label, value: item => (item[field] ? 'Yes' : 'No') }
}

// width_min + width_max → "25–35 mm", or "25 mm" when there's no max.
const widthRange: SpecRowDef = {
  field: 'width_range',
  label: 'Width Range',
  unit: 'mm',
  value: item => {
    const min = item.width_min
    const max = item.width_max
    if (min == null) return ''
    return max == null ? `${min} mm` : `${min}–${max} mm`
  },
}

// Stretch renders one of two ways, decided in SpecTable by point count:
//   ≥ 3 points → a two-row load/stretch table (a curve worth reading as one)
//   1–2 points → this inline text, e.g. "5% @ 10 kN · 10% @ 20 kN" (a table of
//                one or two columns is all chrome and no signal)
// `value` is that inline text either way: it drives the non-empty row-visibility
// check above and is what the short-curve path actually renders.
export const STRETCH_TABLE_MIN_POINTS = 3

const stretchRow: SpecRowDef = {
  field: 'stretch',
  label: 'Stretch',
  render: 'stretch',
  value: item => displayPoints(item.stretch).map(p => `${p.percent}% @ ${p.kn} kN`).join(' · '),
}

export const SPEC_ROWS: Record<GearSlug, SpecRowDef[]> = {
  webbings: [
    priceRow('Price per meter'),
    plain('material', 'Material'),
    plain('webbing_construction', 'Construction'),
    plain('width', 'Width', 'mm'),
    plain('thickness', 'Thickness', 'mm'),
    plain('weight', 'Weight', 'g/m'),
    plain('breaking_strength', 'Breaking Strength', 'kN'),
    stretchRow,
    // classification is NOT a spec row — it renders as a colored bubble beside
    // the product name (see ClassificationBubble).
    { ...plain('colors', 'Colors'), render: 'chips' },
  ],
  weblocks: [
    priceRow(),
    plain('style', 'Style'),
    plain('material', 'Material'),
    widthRange,
    plain('weight', 'Weight', 'g'),
    plain('breaking_strength', 'Breaking Strength', 'kN'),
    plain('front_pin', 'Front Pin'),
    plain('attachment_point', 'Attachment Point'),
    { ...plain('colors', 'Colors'), render: 'chips' },
  ],
  leashrings: [
    priceRow(),
    plain('material', 'Material'),
    plain('inner_diameter', 'Inner Diameter', 'mm'),
    plain('outer_diameter', 'Outer Diameter', 'mm'),
    plain('weight', 'Weight', 'g'),
    plain('breaking_strength', 'Breaking Strength', 'kN'),
  ],
  grips: [
    priceRow(),
    plain('material', 'Material'),
    widthRange,
    plain('weight', 'Weight', 'g'),
    plain('wll', 'WLL', 'kN'),
    plain('mbs', 'MBS', 'kN'),
    plain('common_slipping_threshold', 'Slipping Threshold', 'kN'),
    plain('connection_type', 'Connection Type'),
  ],
  rollers: [
    priceRow(),
    plain('material', 'Frame Material'),
    plain('roller_material', 'Roller Material'),
    plain('slider_type', 'Slider Type'),
    plain('lock_type', 'Lock Type'),
    plain('bearing_material', 'Bearing Material'),
    plain('width', 'Width Range'), // raw string, already a formatted range
    plain('weight', 'Weight', 'g'),
    plain('breaking_strength', 'Breaking Strength', 'kN'),
    { ...plain('colors', 'Colors'), render: 'chips' },
  ],
  treepros: [
    priceRow(),
    plain('weight', 'Weight', 'g'),
    plain('width', 'Width', 'cm'),
    plain('length', 'Length', 'cm'),
    plain('thickness', 'Thickness', 'mm'),
    yesNo('has_sling_attachment', 'Sling Attachment'),
  ],
  starterkits: [
    priceRow(),
    plain('webbing_length', 'Webbing Length', 'm'),
    plain('webbing_width', 'Webbing Width', 'mm'),
    plain('weight', 'Weight', 'g'),
    plain('tensioning_type', 'Tensioning'),
    yesNo('includes_treepro', 'Includes Tree Pro'),
  ],
  tricklinekits: [
    priceRow(),
    plain('webbing_length', 'Webbing Length', 'm'),
    plain('webbing_width', 'Webbing Width', 'mm'),
    plain('weight', 'Weight', 'g'),
    plain('tensioning_type', 'Tensioning'),
    yesNo('includes_treepro', 'Includes Tree Pro'),
  ],
  // upcoming types have no data yet
  bungees: [],
  leashringpro: [],
}
