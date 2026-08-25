// Which fields the "suggest a correction" form offers, per gear type.
//
// Derived from SPEC_ROWS rather than written out again, because SPEC_ROWS is
// already the list of specs a reader can SEE on the detail page — and a reader
// can only notice that a value is wrong if it is on screen. Keeping one list
// means adding a spec row makes it correctable in the same commit.
//
// The names must all exist in CORRECTABLE_FIELDS in
// slack_data/submissions/fields.py, which derives them from the real `*Update`
// models. `tests/test_frontend_contract.py` asserts that they do — a name that
// drifts out of step is a 422 the submitter cannot do anything about.

import type { GearSlug } from '@/types'
import { SPEC_ROWS } from './specRows'

export interface CorrectableField {
  field: string
  label: string
  unit?: string
}

// Spec rows that are not single model fields, and so cannot be corrected as one.
//
//  - width_range folds width_min + width_max into one display row; the two real
//    fields are offered separately below.
//  - stretch is a curve (a list of kN/percent readings). Correcting it through a
//    single-line text input would produce something no admin could apply, so the
//    form leaves it out and the note field carries "the stretch curve is wrong".
const SYNTHETIC = new Set(['width_range', 'stretch'])

// Offered on every type, ahead of the spec-derived rows. These are the fields a
// reader is most likely to find wrong and least likely to see in the spec table:
// the name and brand sit in the page header, not among the specs.
const COMMON: CorrectableField[] = [
  { field: 'name', label: 'Product name' },
  { field: 'brand_name', label: 'Brand' },
  { field: 'product_url', label: 'Product page URL' },
  { field: 'active', label: 'Still in production (true / false)' },
]

// Real fields hidden behind the `width_range` composite.
const WIDTH_RANGE: CorrectableField[] = [
  { field: 'width_min', label: 'Width (min)', unit: 'mm' },
  { field: 'width_max', label: 'Width (max)', unit: 'mm' },
]

function build(slug: GearSlug): CorrectableField[] {
  const rows = SPEC_ROWS[slug] ?? []
  const fromSpecs: CorrectableField[] = []
  let needsWidthRange = false

  for (const row of rows) {
    if (row.field === 'width_range') {
      needsWidthRange = true
      continue
    }
    if (SYNTHETIC.has(row.field)) continue
    fromSpecs.push({ field: row.field, label: row.label, unit: row.unit })
  }

  return [...COMMON, ...fromSpecs, ...(needsWidthRange ? WIDTH_RANGE : [])]
}

const SLUGS = Object.keys(SPEC_ROWS) as GearSlug[]

export const CORRECTABLE_FIELDS: Record<string, CorrectableField[]> = Object.fromEntries(
  SLUGS.map(slug => [slug, build(slug)]),
)

export function correctableFields(slug: string): CorrectableField[] {
  return CORRECTABLE_FIELDS[slug] ?? []
}

export function fieldLabel(slug: string, field: string): string {
  return correctableFields(slug).find(f => f.field === field)?.label ?? field
}
