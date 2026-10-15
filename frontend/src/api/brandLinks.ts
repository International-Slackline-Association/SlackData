// "I represent this brand", and a brand's API keys (phase 5) —
// slack_data/api/routers/brand_requests_router.py and brand_keys_router.py.

import type { BrandKey, BrandRequest, BrandRequestAdmin } from '@/types/brandLinks'
import { getAuthed, postJson } from './client'

export function requestBrand(catalogId: number, note: string | null, token: string) {
  return postJson<BrandRequest>('/me/brand-requests', { catalog_id: catalogId, note }, token)
}

export function fetchMyRequests(token: string) {
  return getAuthed<BrandRequest[]>('/me/brand-requests', token)
}

export function fetchPendingRequests(token: string) {
  return getAuthed<BrandRequestAdmin[]>('/admin/brand-requests', token)
}

export function decideRequest(requestId: string, decision: 'approve' | 'decline', note: string | null, token: string) {
  return postJson<BrandRequest>(`/admin/brand-requests/${requestId}/${decision}`, { note }, token)
}

export function fetchKeys(catalogId: number, token: string) {
  return getAuthed<BrandKey[]>(`/me/brands/${catalogId}/keys`, token)
}

export function createKey(catalogId: number, note: string | null, token: string) {
  return postJson<BrandKey>(`/me/brands/${catalogId}/keys`, { note }, token)
}

export function changeKey(catalogId: number, clientId: string, action: 'regenerate' | 'revoke', token: string) {
  return postJson<BrandKey>(`/me/brands/${catalogId}/keys/${clientId}/${action}`, {}, token)
}
