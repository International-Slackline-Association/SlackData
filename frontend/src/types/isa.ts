// ISA certificates and warnings as stored — slack_data/catalogue/isa.py.
// Admin-only (live editing phase 7). The ISA's own fields are kept as the
// seed files spell them, so an entry is a loose record plus its match block.

export type IsaKind = 'certificates' | 'warnings'

/** One target of a match block, as the seed files and the build read it. */
export interface IsaMatchBlock {
  gearType: string | null
  gearIds: number[]
  gearNames: string[]
  confidence: string
  note?: string
  also?: IsaMatchBlock[]
}

export interface IsaEntry {
  key: string
  entry: Record<string, unknown> & { match?: IsaMatchBlock; suggested_match?: IsaSuggestion }
  rev: number
}

/** What the importer could match by name — offered, never applied. */
export interface IsaSuggestion {
  collection: string
  ids: number[]
  name: string
}

/** A match as an admin sets it: products by gear type (collection) and id. */
export interface IsaMatchIn {
  targets: { collection: string; ids: number[] }[]
  confidence: 'exact' | 'likely' | 'partial' | 'ambiguous' | 'none'
  note: string | null
}
