// Resolves manufacturer logos from the generated manifest.
//
// The manifest (src/data/manufacturerImages.json) is written by
// scripts/fetch_manufacturer_assets.py and maps a CANONICAL brand name to the
// stored filename. Files are named by the canonical brand slug, so a lookup is a
// pure function of the brand name — no per-brand special-casing.
//
// Same hosting switch as gear images: point VITE_IMAGE_BASE_URL at a CDN and
// upload manufacturer-images/ under the same keys; nothing else changes.
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? ''

import manufacturerImages from '@/data/manufacturerImages.json'

const manifest = manufacturerImages as Record<string, string>

// The logo URL for a brand, or null when we hold no logo for it. Callers render
// a placeholder on null rather than collapsing the image area, so cards in a row
// keep a uniform height.
export function manufacturerLogo(brandName: string): string | null {
  const file = manifest[brandName]
  return file ? `${IMAGE_BASE_URL}/manufacturer-images/${file}` : null
}
