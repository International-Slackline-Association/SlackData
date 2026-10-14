// Live editing — slack_data/api/routers/edit_router.py. Admins only in phase 3.
//
// Every write names the `rev` it read; a stale one is refused with a 409 whose
// detail carries the current entry (types/edits.ts EditConflict), so the form
// can show what moved and keep what was typed.

import type { EditResult, FieldSpec, Stored } from '@/types/edits'
import { getAuthed, patchJson, postJson } from './client'

export function fetchFields(slug: string, token: string): Promise<FieldSpec[]> {
  return getAuthed<FieldSpec[]>(`/edit/${slug}/fields`, token)
}

export function fetchStored(slug: string, id: number | string, token: string): Promise<Stored> {
  return getAuthed<Stored>(`/edit/${slug}/${id}`, token)
}

export function editItem(
  slug: string,
  id: number | string,
  rev: number,
  changes: Record<string, unknown>,
  why: string | null,
  token: string,
): Promise<EditResult> {
  return patchJson<EditResult>(`/edit/${slug}/${id}`, { rev, changes, why }, token)
}

export function createItem(
  slug: string,
  fields: Record<string, unknown>,
  why: string | null,
  token: string,
): Promise<EditResult> {
  return postJson<EditResult>(`/edit/${slug}`, { fields, why }, token)
}

export function hideItem(slug: string, id: number | string, rev: number, why: string, token: string) {
  return postJson<EditResult>(`/edit/${slug}/${id}/hide`, { rev, why }, token)
}

export function unhideItem(slug: string, id: number | string, rev: number, why: string | null, token: string) {
  return postJson<EditResult>(`/edit/${slug}/${id}/unhide`, { rev, why }, token)
}

export function mergeItem(
  slug: string,
  id: number | string,
  rev: number,
  into: number,
  why: string,
  token: string,
) {
  return postJson<EditResult>(`/edit/${slug}/${id}/merge`, { rev, into, why }, token)
}

export function revertChange(recordId: string, why: string | null, token: string) {
  return postJson<EditResult>(`/edit/revert/${recordId}`, { why }, token)
}

export function fetchBrandFields(token: string): Promise<FieldSpec[]> {
  return getAuthed<FieldSpec[]>('/edit/brand/fields', token)
}

export function fetchStoredBrand(catalogId: number | string, token: string): Promise<Stored> {
  return getAuthed<Stored>(`/edit/brand/${catalogId}`, token)
}

export function editBrand(
  catalogId: number | string,
  rev: number,
  changes: Record<string, unknown>,
  why: string | null,
  token: string,
) {
  return patchJson<EditResult>(`/edit/brand/${catalogId}`, { rev, changes, why }, token)
}

export function createBrand(name: string, fields: Record<string, unknown>, why: string | null, token: string) {
  return postJson<EditResult>('/edit/brand', { name, fields, why }, token)
}
