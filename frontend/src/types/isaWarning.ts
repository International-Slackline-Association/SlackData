// ISA gear warning — mirrors ISAGearWarningPublic in
// slack_data/models/isa_gear_warnings.py exactly.
//
// One row per (ISA entry x matched gear item): an entry covering three products
// yields three rows, and a product with three warnings against it is pointed at
// by three rows. `gear_type` + `gear_id` is the link — there is no FK, because
// a warning can land on any of five tables.

import type { ISAWarning } from './enums'

export interface IsaGearWarning {
  id: number
  source_id: string // the ISA's own entry number; not unique here
  status: ISAWarning
  gear_type: string
  gear_id: number
  date: string | null      // raw source string, dd.mm.yy
  date_iso: string | null  // parsed, or null when the source value was malformed
  product_type: string | null
  manufacturer: string | null
  model: string | null
  in_production: boolean | null
  description: string | null
  solution: string | null
  product_image: string | null
  links: string[] | null
  // How the match onto our catalogue was adjudicated: exact | likely | partial
  // | ambiguous. Anything less than certain is surfaced to the reader.
  confidence: string | null
  note: string | null
}
