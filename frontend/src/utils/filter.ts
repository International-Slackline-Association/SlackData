// Client-side filtering for the listing, plus derivation of pill options from
// the loaded dataset (so every pill matches >=1 item — no phantom values).
//
// Semantics (see filters.cy.ts):
//   - Pills: OR within a group, AND across groups. An item with a null value in
//     an actively-filtered field is excluded.
//   - Ranges: [min, max] inclusive. When any bound is set, items with a
//     null/blank value are excluded (null-last philosophy).

import type { AnyItem } from '@/utils/format'
import type { PillKind } from '@/config/filterGroups'

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

export function derivePillOptions(
  items: AnyItem[],
  field: string,
  kind: PillKind = 'enum',
  capitalize = false,
  order?: readonly string[],
): PillOption[] {
  const seen = new Set<string>()
  for (const item of items) {
    const v = item[field]
    if (v == null || v === '') continue
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
  return values.map(value => ({
    value,
    label:
      kind === 'bool'
        ? value === 'true' ? 'Yes' : 'No'
        : capitalize ? titleCase(value) : value,
  }))
}

function passesPills(item: AnyItem, activePills: Record<string, string[]>): boolean {
  for (const field in activePills) {
    const values = activePills[field]
    if (!values || values.length === 0) continue
    const iv = item[field]
    if (iv == null || iv === '') return false
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
