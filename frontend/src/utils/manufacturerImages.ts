// Resolves manufacturer logos from the media manifest (utils/mediaStore.ts) —
// a brand's `logo`, set on the site or migrated from the repo (P4-J). Keyed by
// the brand name as the API spells it. Callers call `useMedia()` to re-render
// when the manifest arrives.

import { mediaManifest, mediaUrl } from './mediaStore'

// The logo URL for a brand, or null when we hold no logo for it. Callers render
// a placeholder on null rather than collapsing the image area, so cards in a row
// keep a uniform height.
export function manufacturerLogo(brandName: string): string | null {
  const key = mediaManifest().logos[brandName]
  return key ? mediaUrl(key) : null
}
