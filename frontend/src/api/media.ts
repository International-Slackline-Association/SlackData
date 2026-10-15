// Media — slack_data/api/routers/media_router.py and the media routes of
// edit_router.py (LIVE_EDITING_PHASE_4.md).
//
// An upload never passes through the API (hazard 1): the API hands out a form
// per file, the browser posts the file straight to quarantine (S3 hosted, the
// API's own stand-in locally), and the media edit then names the upload ids.

import type { EditResult } from '@/types/edits'
import type { ManualRef, MediaManifest, PhotoRef, UploadPurpose, UploadTarget } from '@/types/media'
import { postJson, putJson, request } from './client'

export function fetchMediaManifest(): Promise<MediaManifest> {
  return request<MediaManifest>('/media/manifest')
}

export interface UploadRequest {
  purpose: UploadPurpose
  content_type: string
  size: number
}

export function requestUploads(files: UploadRequest[], token: string): Promise<UploadTarget[]> {
  return postJson<UploadTarget[]>('/edit/media/uploads', { files }, token)
}

/** Post one file to its form. S3 answers 204; a refusal is an XML body we do
 *  not parse — its status is what matters (403: the policy refused it). */
export async function postUpload(target: UploadTarget, file: Blob): Promise<void> {
  const form = new FormData()
  for (const [name, value] of Object.entries(target.fields)) form.append(name, value)
  form.append('file', file)
  const response = await fetch(target.url, { method: 'POST', body: form })
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? 'The upload was refused — the file is too large or not the type it said it was.'
        : `The upload failed (${response.status}).`,
    )
  }
}

export function putItemMedia(
  slug: string,
  id: number | string,
  body: { rev: number; photos?: PhotoRef[]; manuals?: ManualRef[]; why: string | null },
  token: string,
): Promise<EditResult> {
  return putJson<EditResult>(`/edit/${slug}/${id}/media`, body, token)
}

export function putBrandMedia(
  catalogId: number | string,
  body: {
    rev: number
    logo?: { upload: string | null }
    manuals?: Record<string, ManualRef[]>
    why: string | null
  },
  token: string,
): Promise<EditResult> {
  return putJson<EditResult>(`/edit/brand/${catalogId}/media`, body, token)
}
