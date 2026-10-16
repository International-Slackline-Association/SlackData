// ISA certificates and warnings — slack_data/api/routers/edit_router.py,
// `/edit/isa/...`. Admins only (live editing phase 7).

import type { EditResult, FieldSpec, IsaEntry, IsaKind, IsaMatchIn } from '@/types'
import { getAuthed, patchJson, postJson } from './client'

export function fetchIsaEntries(kind: IsaKind, token: string): Promise<IsaEntry[]> {
  return getAuthed<IsaEntry[]>(`/edit/isa/${kind}`, token)
}

export function fetchIsaEntry(kind: IsaKind, key: string, token: string): Promise<IsaEntry> {
  return getAuthed<IsaEntry>(`/edit/isa/${kind}/${encodeURIComponent(key)}`, token)
}

export function fetchIsaFields(kind: IsaKind, token: string): Promise<FieldSpec[]> {
  return getAuthed<FieldSpec[]>(`/edit/isa/${kind}/fields`, token)
}

export function editIsa(
  kind: IsaKind,
  key: string,
  body: { rev: number; changes?: Record<string, unknown>; match?: IsaMatchIn; why: string | null },
  token: string,
): Promise<EditResult> {
  return patchJson<EditResult>(`/edit/isa/${kind}/${encodeURIComponent(key)}`, body, token)
}

export function createIsa(
  kind: IsaKind,
  fields: Record<string, unknown>,
  why: string | null,
  token: string,
): Promise<EditResult> {
  return postJson<EditResult>(`/edit/isa/${kind}`, { fields, why }, token)
}

export function retireIsa(kind: IsaKind, key: string, rev: number, why: string, token: string): Promise<EditResult> {
  return postJson<EditResult>(`/edit/isa/${kind}/${encodeURIComponent(key)}/retire`, { rev, why }, token)
}
