// People and the change log — slack_data/api/routers/people_router.py.
//
// Like submissions, these reach stores other than the catalogue, so they work
// on the live site while the catalogue is read-only.

import type { AdminSummary, BlockedSummary, ChangeRecordPublic, Me, RoleChange } from '@/types'
import { getAuthed, patchJson, postJson, request } from './client'

export function fetchMe(token: string): Promise<Me> {
  return getAuthed<Me>('/me', token)
}

/** Acknowledge the "your name is shown with your changes" notice, saving the
 *  name typed into it. Idempotent. */
export function acknowledgeNotice(token: string, name: string): Promise<Me> {
  return postJson<Me>('/me/notice', { name }, token)
}

/** Change the name shown with your changes — on every change you made. Once
 *  a name is set, it can be changed once, for life. */
export function changeName(token: string, name: string): Promise<Me> {
  return patchJson<Me>('/me/name', { name }, token)
}

export function fetchAdmins(token: string): Promise<AdminSummary[]> {
  return getAuthed<AdminSummary[]>('/admin/admins', token)
}

/** Grant or revoke a role. A logged change, visible in the public change log. */
export function changeRole(token: string, change: RoleChange): Promise<AdminSummary> {
  return postJson<AdminSummary>('/admin/roles', change, token)
}

/** Accounts blocked from editing (D22). Admins only. */
export function fetchBlocked(token: string): Promise<BlockedSummary[]> {
  return getAuthed<BlockedSummary[]>('/admin/people/blocked', token)
}

/** Block or unblock an account — a logged change; the reason is public. */
export function setBlocked(token: string, isaId: string, block: boolean, why: string): Promise<BlockedSummary> {
  return postJson<BlockedSummary>(`/admin/people/${encodeURIComponent(isaId)}/${block ? 'block' : 'unblock'}`, { why }, token)
}

/** Which part of the log: everything, one thing's History, one person's
 *  contributions, or the safety changes. One filter at a time. */
export interface ChangesQuery {
  limit?: number
  before?: string
  target_type?: string
  target_id?: string
  actor?: string
  flag?: 'safety'
}

/** Public — no sign-in. Newest first. */
export function fetchChanges(query: ChangesQuery | number = {}): Promise<ChangeRecordPublic[]> {
  const params = typeof query === 'number' ? { limit: query } : query
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries({ limit: 50, ...params })) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  return request<ChangeRecordPublic[]>(`/changes?${search}`)
}
