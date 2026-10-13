// People and the change log — slack_data/api/routers/people_router.py.
//
// Like submissions, these reach stores other than the catalogue, so they work
// on the live site while the catalogue is read-only.

import type { AdminSummary, ChangeRecordPublic, Me, RoleChange } from '@/types'
import { getAuthed, postJson, request } from './client'

export function fetchMe(token: string): Promise<Me> {
  return getAuthed<Me>('/me', token)
}

/** Acknowledge the "your name is shown with your changes" notice. Idempotent. */
export function acknowledgeNotice(token: string): Promise<Me> {
  return postJson<Me>('/me/notice', {}, token)
}

export function fetchAdmins(token: string): Promise<AdminSummary[]> {
  return getAuthed<AdminSummary[]>('/admin/admins', token)
}

/** Grant or revoke a role. A logged change, visible in the public change log. */
export function changeRole(token: string, change: RoleChange): Promise<AdminSummary> {
  return postJson<AdminSummary>('/admin/roles', change, token)
}

/** Public — no sign-in. Newest first. */
export function fetchChanges(limit = 50): Promise<ChangeRecordPublic[]> {
  return request<ChangeRecordPublic[]>(`/changes?limit=${limit}`)
}
