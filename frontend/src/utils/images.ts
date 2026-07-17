// Resolves gear images from the generated manifest.
//
// ── THE ONE-LINE HOSTING SWITCH ──────────────────────────────────────────────
// Locally, images are served from Vite's `public/` at the web root, so the base
// is "". To move to a CDN/object store, upload the `gear-images/` tree under the
// same keys and change IMAGE_BASE_URL to e.g. "https://cdn.slackdata.app".
// Nothing else changes — the manifest keys and file paths stay identical.
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? ''
// ─────────────────────────────────────────────────────────────────────────────

import gearImages from '@/data/gearImages.json'
import brandAbbrev from '@/data/brandAbbrev.json'
import { slugify } from './slugify'

const manifest = gearImages as Record<string, Record<string, string[]>>
const abbrevMap = brandAbbrev as Record<string, string>

// The manifest/file key for an item: "<brand-abbrev>_<name-slug>".
// Falls back to a slug of the raw brand if the brand isn't in the abbrev table.
export function imageKey(brandName: string, name: string): string {
  const abbrev = abbrevMap[brandName] ?? slugify(brandName)
  return `${abbrev}_${slugify(name)}`
}

// All image URLs for an item (first is the primary), or [] if none exist.
export function imageUrls(gearType: string, brandName: string, name: string): string[] {
  const files = manifest[gearType]?.[imageKey(brandName, name)] ?? []
  return files.map(f => `${IMAGE_BASE_URL}/gear-images/${gearType}/${f}`)
}

// Convenience: the primary image URL, or null.
export function primaryImage(gearType: string, brandName: string, name: string): string | null {
  return imageUrls(gearType, brandName, name)[0] ?? null
}
