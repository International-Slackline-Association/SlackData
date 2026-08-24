// Submission types — mirroring slack_data/models/submissions.py exactly.
//
// Per CLAUDE.md's frontend↔backend contract rule, these are written from the
// Python schemas, not from DESIGN.md or the plan. Note the naming: the plan
// sketched the stored item in camelCase, but the implementation is snake_case
// like every other schema in this repo, and these types follow the code.

// 'manufacturer' is an authenticated brand updating its own gear, through
// POST /manufacturer/gear. The public box cannot claim it — models/submissions.py
// rejects the kind on SubmissionCreate — which is what makes it worth a badge.
export type SubmissionKind = 'correction' | 'new_item' | 'manufacturer'
// `applied` is the loop-closer: approving says the report is right, applying
// says the JSON was edited and the API redeployed. Without the distinction an
// approved record reads as done while the wrong value is still on the site.
export type SubmissionStatus = 'pending' | 'approved' | 'applied' | 'rejected'

// Caps, mirrored from models/submissions.py so the form can stop a submission
// the API would reject anyway. The server still enforces all of them — these
// exist to give a better error than a 422, never to be the only check.
export const MAX_CHANGES = 20
export const MAX_VALUE_LENGTH = 200
export const MAX_NOTE_LENGTH = 2000
export const MAX_URL_LENGTH = 500

/** The public POST body. */
export interface SubmissionCreate {
  kind: SubmissionKind
  gear_type: string
  gear_id?: number | null
  gear_name?: string | null
  /** Sent because gear ids are NOT stable — see models/submissions.py. */
  gear_brand?: string | null
  /** field name -> proposed value, as strings. Values are prose, not coerced. */
  changes: Record<string, string>
  note?: string | null
  source_url?: string | null
  submitter_email?: string | null
  /** Honeypot. Always sent empty by a human; see SubmissionDialog. */
  website?: string | null
  captcha_token?: string | null
}

/** What a successful POST returns — an id and nothing else, by design. */
export interface SubmissionReceipt {
  submission_id: string
  status: SubmissionStatus
}

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
