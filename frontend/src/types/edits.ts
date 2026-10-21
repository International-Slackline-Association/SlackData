// Mirrors slack_data/api/routers/edit_router.py (FieldSpec, Stored, EditResult)
// and the 404/409 details it and the gear routes send. Read those first.

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'integer'
  | 'date'
  | 'boolean'
  | 'choice'
  | 'choices'
  | 'list'
  | 'curve'
  /** A leash's ring options: leash ring ids, each with how many (`options` lists the rings). */
  | 'rings'

/** One editable field, as the model describes it — the form is built from these. */
export interface FieldSpec {
  name: string
  kind: FieldKind
  options: string[] | null
  required: boolean
  /** Only an admin changes it (who makes a product, who else sells it). A
   *  manufacturer picks `brand` only when adding a product, among their own. */
  admin_only?: boolean
}

/** A seed entry as the store holds it, and the rev an edit must name (D27). */
export interface Stored {
  collection: string
  key: string
  entry: Record<string, unknown>
  rev: number
}

export interface EditResult extends Stored {
  /** The change log records written; empty when nothing changed. */
  records: string[]
  /** On a revert: fields that changed again since, left as they are. */
  refused: Record<string, unknown>
}

/** The 409 an edit gets when the item changed since it was opened. */
export interface EditConflict {
  message: string
  conflict: string
  current: Record<string, unknown> | null
  rev: number | null
}

/** Why a gear id answers 404: merged into another. */
export interface Unlisted {
  message: string
  merged_into?: number
}
