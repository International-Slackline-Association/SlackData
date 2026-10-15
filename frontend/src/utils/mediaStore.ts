// Which photos, manuals and logos the catalogue holds — fetched from the API
// once per page load (GET /media/manifest, LIVE_EDITING_PHASE_4.md P4-C), where
// it used to be JSON built into the bundle. So a photo added on the site shows
// on the next page load, with no deploy.
//
// One module-level copy, read synchronously by the lookups in utils/images.ts
// and utils/manufacturerImages.ts, so their callers stay plain function calls.
// A component that shows media calls `useMedia()` once: that starts the fetch
// and re-renders it when the manifest arrives (or is refreshed after an edit).
// Until then every lookup answers "none", which renders as it always has for a
// product without photos — the "No image" placeholder, no manuals block.

import { useEffect, useSyncExternalStore } from 'react'
import { fetchMediaManifest } from '@/api/media'
import type { MediaManifest } from '@/types/media'

const EMPTY: MediaManifest = { base: '', photos: {}, manuals: {}, brandManuals: {}, logos: {} }

let current: MediaManifest = EMPTY
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

export function mediaManifest(): MediaManifest {
  return current
}

/** Fetch the manifest (once; `refresh` fetches again, after a media edit). A
 *  failure leaves what was there and lets the next caller try again. */
export function loadMedia(refresh = false): Promise<void> {
  if (pending && !refresh) return pending
  pending = fetchMediaManifest()
    .then(manifest => {
      current = manifest
      listeners.forEach(listener => listener())
    })
    .catch(() => {
      pending = null
    })
  return pending
}

/** The URL a media key is served at. */
export function mediaUrl(key: string): string {
  return `${current.base}/${key}`
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The manifest, re-rendering the caller when it arrives or changes. */
export function useMedia(): MediaManifest {
  useEffect(() => {
    void loadMedia()
  }, [])
  return useSyncExternalStore(subscribe, mediaManifest, mediaManifest)
}
