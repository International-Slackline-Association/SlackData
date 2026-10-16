// Submissions data access — the admin triage. The public suggestion box was
// switched off in live editing phase 6 (D56): anyone with an ISA account edits.
//
// Unlike every other module in this folder, these do not talk to the catalogue.
// They reach a separate store (DynamoDB hosted, SQLite locally), which is why
// they keep working on the live site while the catalogue is read-only. See
// slack_data/api/routing.py § WRITABLE_ROUTERS.

import type { Submission, SubmissionReview, SubmissionStatus } from '@/types'
import { getAuthed, patchJson } from './client'

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
