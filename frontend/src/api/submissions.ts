// Submissions data access — the public suggestion box and the admin triage.
//
// Unlike every other module in this folder, these do not talk to the catalogue.
// They reach a separate store (DynamoDB hosted, SQLite locally), which is why
// they keep working on the live site while the catalogue is read-only. See
// slack_data/api/routing.py § WRITABLE_ROUTERS.

import type {
  Submission,
  SubmissionCreate,
  SubmissionReceipt,
  SubmissionReview,
  SubmissionStatus,
} from '@/types'
import { getAuthed, patchJson, postJson } from './client'

/** Public. No token — this is the one open write endpoint on the site. */
export function createSubmission(body: SubmissionCreate): Promise<SubmissionReceipt> {
  // No trailing slash, deliberately: `POST /submissions` is the API Gateway route
  // key the 2/sec throttle is attached to, and a route key cannot end in one.
  // `/submissions/` still reaches this handler — nothing is mounted there now, so
  // Starlette 307s it here — but that costs a round trip and the redirected
  // request lands on $default, unthrottled. So we call the throttled spelling.
  return postJson<SubmissionReceipt>('/submissions', body)
}

/** Admin. Oldest first — the server orders it; do not re-sort here. */
export function fetchSubmissions(
  token: string,
  status: SubmissionStatus = 'pending',
  limit = 50,
): Promise<Submission[]> {
  return getAuthed<Submission[]>(`/submissions?status=${status}&limit=${limit}`, token)
}

/** Admin. Records the outcome; changes nothing in the catalogue. */
export function reviewSubmission(
  token: string,
  submissionId: string,
  review: SubmissionReview,
): Promise<Submission> {
  return patchJson<Submission>(`/submissions/${submissionId}`, review, token)
}
