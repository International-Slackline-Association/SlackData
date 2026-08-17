// Per-gear-type field configuration for the card.
//
//  - CARD_DATA_FIELDS: numeric fields emitted as data-{field} attributes on each
//    card, so sort/filter tests can read raw values without parsing display text.
//    This is the union of the range-filter fields and the numeric sort fields for
//    each type (see filters.cy.ts / search_sort.cy.ts). Source of truth for the
//    field names is slack_data/models/*.py.
//
//    Price is four attributes, not one, because the raw number is not comparable
//    across items — it's in whichever of fourteen currencies the seller charges:
//      price         — the as-sold amount, exactly as stored
//      currency      — what that amount is in (the one non-numeric member here)
//      price_base    — normalized to the rate table's base AND to one item (a
//                      pair price is halved); what SORT compares
//      price_display — the same price in the viewer's currency; what the price
//                      FILTER compares, and so what its bounds are checked against
//    The last two are attached by GearListingPage (see money.ts).
//  - INLINE_SPECS: the few specs shown in the card's inline specs row.

import type { GearSlug } from '@/types'

export const CARD_DATA_FIELDS: Record<GearSlug, string[]> = {
  webbings:      ['price', 'price_base', 'price_display', 'currency', 'weight', 'width', 'breaking_strength'],
  weblocks:      ['price', 'price_base', 'price_display', 'currency', 'weight', 'width_min', 'breaking_strength'],
  leashrings:    ['price', 'price_base', 'price_display', 'currency', 'weight', 'inner_diameter', 'outer_diameter', 'breaking_strength'],
  grips:         ['price', 'price_base', 'price_display', 'currency', 'weight', 'width_min', 'wll', 'mbs', 'common_slipping_threshold'],
  rollers:       ['price', 'price_base', 'price_display', 'currency', 'weight', 'breaking_strength'],
  // `price_unit` joins the price attributes on tree protectors: it is what
  // separates the as-sold price from price_base, which is per protector.
  treepros:      ['price', 'price_unit', 'price_base', 'price_display', 'currency', 'weight', 'width', 'length', 'thickness'],
  starterkits:   ['price', 'price_base', 'price_display', 'currency', 'weight', 'webbing_length', 'webbing_width'],
  tricklinekits: ['price', 'price_base', 'price_display', 'currency', 'weight', 'webbing_length', 'webbing_width'],
  // upcoming types have no data / cards yet
  bungees:       [],
  leashringpro:  [],
}

export interface InlineSpec {
  field: string
  unit?: string
}

export const INLINE_SPECS: Record<GearSlug, InlineSpec[]> = {
  webbings:      [{ field: 'material' }, { field: 'width', unit: 'mm' }, { field: 'weight', unit: 'g/m' }, { field: 'breaking_strength', unit: 'kN' }],
  weblocks:      [{ field: 'material' }, { field: 'width_min', unit: 'mm' }, { field: 'breaking_strength', unit: 'kN' }],
  leashrings:    [{ field: 'material' }, { field: 'inner_diameter', unit: 'mm' }, { field: 'breaking_strength', unit: 'kN' }],
  grips:         [{ field: 'material' }, { field: 'mbs', unit: 'kN' }],
  rollers:       [{ field: 'material' }, { field: 'breaking_strength', unit: 'kN' }],
  treepros:      [{ field: 'width', unit: 'cm' }, { field: 'length', unit: 'cm' }],
  starterkits:   [{ field: 'webbing_length', unit: 'm' }, { field: 'webbing_width', unit: 'mm' }, { field: 'tensioning_type' }],
  tricklinekits: [{ field: 'webbing_length', unit: 'm' }, { field: 'webbing_width', unit: 'mm' }, { field: 'tensioning_type' }],
  bungees:       [],
  leashringpro:  [],
}
