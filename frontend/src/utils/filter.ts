// Client-side filtering for the listing, plus derivation of pill options from
// the loaded dataset (so every pill matches >=1 item — no phantom values).
//
// Semantics (see filters.cy.ts):
//   - Pills: OR within a group, AND across groups. An item with a null value in
//     an actively-filtered field is excluded.
//   - Ranges: [min, max] inclusive. When any bound is set, items with a
//     null/blank value are excluded (null-last philosophy).

import type { AnyItem } from '@/utils/format'
import type { FilterGroupMeta } from '@/config/filterGroups'

// Sentinel value for "this item has no value in this field". Pill groups
// normally derive their options from the data and EXCLUDE nulls on both sides:
// a null value produces no option, and an item with a null in an actively
// filtered field is dropped. That is right for material or connection type,
// where absence means "we don't know". It is wrong for `isa_warning`, where
// absence is the answer people actually want to filter on — "show me the gear
// with no ISA warning against it". Groups opt in via `includeNone` in the
// filter config; nothing else offers the option, so nothing else changes
// behaviour. Lowercase so it can never collide with an enum value
// (ISAWarning's members are Recall / Warning / Notice / No Warning).
export const NO_VALUE_PILL = 'none'

export interface PillOption {
  value: string // raw value used in the URL + for matching (String(item[field]))
  label: string // display text (booleans render Yes/No)
}

export interface RangeBounds {
  min?: number
  max?: number
}

// Distinct, present-in-data options for a pill group. `kind` only affects
// ordering + display, never which values appear.
// Title-case a raw value for display (pair → Pair, "tree pro" → "Tree Pro").
// Only the label changes; the option `value` stays the raw string used for
// URL encoding + matching.
function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// "Other" is the catch-all bucket on every enum in slack_data/models — it reads
// as a fallback, so it belongs at the end of the list rather than wherever the
// alphabet puts it.
function rank(value: string): number {
  return value.toLowerCase() === 'other' ? 1 : 0
}

export function derivePillOptions(items: AnyItem[], meta: FilterGroupMeta): PillOption[] {
  const { group: field, capitalize = false, order, includeNone = false } = meta
  const kind = meta.pillKind ?? 'enum'
  const seen = new Set<string>()
  let anyMissing = false
  for (const item of items) {
    const v = item[field]
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
      anyMissing = true
      continue
    }
    // Multi-valued fields (e.g. roller `material` is list[MetalMaterial]) get one
    // pill per distinct element, not one pill for the whole array — otherwise the
    // comma in "Aluminum,Steel" collides with the comma-delimited URL encoding.
    if (Array.isArray(v)) {
      for (const el of v) if (el != null && el !== '') seen.add(String(el))
    } else {
      seen.add(String(v))
    }
  }
  const values = [...seen]
  if (kind === 'int') {
    values.sort((a, b) => Number(a) - Number(b))
  } else if (kind === 'bool') {
    values.sort((a, b) => (a === 'true' ? 0 : 1) - (b === 'true' ? 0 : 1)) // Yes before No
  } else if (order) {
    // Explicit domain order (e.g. classification A+ → Not for Highline). Values
    // outside the list sort after it, alphabetically.
    const idx = (v: string) => {
      const i = order.indexOf(v)
      return i === -1 ? order.length : i
    }
    values.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
  } else {
    // Alphabetical, except catch-all buckets ("Other", "Unknown") always sink
    // to the bottom of the list.
    values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }
  const options = values.map(value => ({
    value,
    label:
      kind === 'bool'
        ? value === 'true' ? 'Yes' : 'No'
        : capitalize ? titleCase(value) : value,
  }))

  // "None" leads the group — it is the reassuring answer, and on isa_warning it
  // is also by far the largest bucket. Offered only when the loaded data
  // actually contains items without a value, so a type where every item is
  // warned doesn't show a pill that matches nothing.
  if (includeNone && anyMissing) {
    options.unshift({ value: NO_VALUE_PILL, label: 'None' })
  }
  return options
}

function passesPills(item: AnyItem, activePills: Record<string, string[]>): boolean {
  for (const field in activePills) {
    const values = activePills[field]
    if (!values || values.length === 0) continue
    const iv = item[field]
    // Missing value: passes only when the group offers, and the viewer picked,
    // the explicit "None" pill (see NO_VALUE_PILL).
    if (iv == null || iv === '') return values.includes(NO_VALUE_PILL)
    // Array field: match if the item's list shares any selected value.
    if (Array.isArray(iv)) {
      if (!iv.some(el => values.includes(String(el)))) return false
    } else if (!values.includes(String(iv))) {
      return false
    }
  }
  return true
}

function passesRanges(item: AnyItem, activeRanges: Record<string, RangeBounds>): boolean {
  for (const field in activeRanges) {
    const { min, max } = activeRanges[field]
    if (min == null && max == null) continue
    const raw = item[field]
    const n = raw == null || raw === '' ? null : Number(raw)
    if (n == null || Number.isNaN(n)) return false // bound set, no value → excluded
    if (min != null && n < min) return false
    if (max != null && n > max) return false
  }
  return true
}

export function applyFilters(
  items: AnyItem[],
  activePills: Record<string, string[]>,
  activeRanges: Record<string, RangeBounds>,
): AnyItem[] {
  return items.filter(
    item => passesPills(item, activePills) && passesRanges(item, activeRanges),
  )
}
