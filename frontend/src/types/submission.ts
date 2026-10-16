// Submission types — mirroring slack_data/models/submissions.py exactly.
//
// Per CLAUDE.md's frontend↔backend contract rule, these are written from the
// Python schemas, not from DESIGN.md or the plan. Note the naming: the plan
// sketched the stored item in camelCase, but the implementation is snake_case
// like every other schema in this repo, and these types follow the code.

// 'manufacturer' is an authenticated brand updating its own gear, through
// POST /manufacturer/gear. 'correction' and 'new_item' came from the public box,
// switched off in live editing phase 6 (D56); triage still holds some.
export type SubmissionKind = 'correction' | 'new_item' | 'manufacturer'
// `applied` is "handled": the change was made on the site. `approved` is a
// manufacturer's update applied live with photo links still to add.
export type SubmissionStatus = 'pending' | 'approved' | 'applied' | 'rejected'

/** A stored record. Admin-only; there is no public read route. */
export interface Submission {
  submission_id: string
  kind: SubmissionKind
  gear_type: string
  gear_id: number | null
  gear_name: string | null
  gear_brand: string | null
  changes: Record<string, string>
  note: string | null
  source_url: string | null
  /** Links to photos, from the manufacturer API only. Never null — empty when
   *  there are none. Recorded, not fetched: an admin opens each and adds the
   *  photo on the item's page (Photos and manuals). */
  image_urls: string[]
  submitter_email: string | null
  /** Null for the public box. A manufacturer submission carries
   *  `brand-client:<cognito app client id>`. */
  submitted_by: string | null
  /** The brand a manufacturer submission speaks for. Null otherwise. */
  brand_id: number | null
  /** One POST of N products writes N rows sharing this id, so triage can group
   *  them back into the call the manufacturer actually made. */
  batch_id: string | null
  /** The manufacturer's own part number. Matches nothing in the catalogue yet —
   *  recorded so it can be promoted into the root *.json. */
  manufacturer_sku: string | null
  status: SubmissionStatus
  created_at: string
  reviewed_at: string | null
  review_note: string | null
  /** Unix seconds — DynamoDB TTL. */
  /** Unix seconds — DynamoDB TTL. **null while approved**: a correction we
   *  have agreed with but not shipped must not age out with work outstanding. */
  expires_at: number | null
}

/** The admin PATCH body. Deliberately cannot carry `changes`. */
export interface SubmissionReview {
  status: Exclude<SubmissionStatus, 'pending'>
  review_note?: string | null
}
