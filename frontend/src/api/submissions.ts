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
  return postJson<SubmissionReceipt>('/submissions/', body)
}

/** Admin. Oldest first — the server orders it; do not re-sort here. */
export function fetchSubmissions(
  token: string,
  status: SubmissionStatus = 'pending',
  limit = 50,
): Promise<Submission[]> {
  return getAuthed<Submission[]>(`/submissions/?status=${status}&limit=${limit}`, token)
}

/** Admin. Records the outcome; changes nothing in the catalogue. */
export function reviewSubmission(
  token: string,
  submissionId: string,
  review: SubmissionReview,
): Promise<Submission> {
  return patchJson<Submission>(`/submissions/${submissionId}`, review, token)
}
