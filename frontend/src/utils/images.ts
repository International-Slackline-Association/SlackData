// Resolves gear images — and gear manuals — from the generated manifests.
//
// Manuals are stored exactly the way images are (a curated tree under public/,
// a manifest derived from it by scripts/build_gear_manifest.py, the same
// "<brand-abbrev>_<name-slug>" key), so they resolve here rather than in a
// parallel module that would duplicate the key builder and the base URL. The
// filename -> row half is utils/manuals.ts.
//
// ── THE ONE-LINE HOSTING SWITCH ──────────────────────────────────────────────
// Locally, images are served from Vite's `public/` at the web root, so the base
// is "". To move to a CDN/object store, upload the `gear-images/` tree under the
// same keys and change IMAGE_BASE_URL to e.g. "https://cdn.slackdata.app".
// Nothing else changes — the manifest keys and file paths stay identical.
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? ''
// ─────────────────────────────────────────────────────────────────────────────

import gearImages from '@/data/gearImages.json'
import gearManuals from '@/data/gearManuals.json'
import brandManuals from '@/data/brandManuals.json'
import brandAbbrev from '@/data/brandAbbrev.json'
import { brandManualEntries, manualEntries, type Manual } from './manuals'
import { getGearType } from '@/config/gearTypes'
import { slugify } from './slugify'

const manifest = gearImages as Record<string, Record<string, string[]>>
const manualManifest = gearManuals as Record<string, Record<string, string[]>>
const brandManualManifest = brandManuals as Record<string, Record<string, string[]>>
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

// The brand abbreviation alone — the key a range-wide manual is filed under.
// Several brand names share one abbrev ("Balance Community", "BalanceCommunity",
// "Balance Community: Slackline Outfitters"), which is why the manual is filed
// once and every spelling of the maker finds it.
export function brandKey(brandName: string): string {
  return abbrevMap[brandName] ?? slugify(brandName)
}

// The documents a brand publishes for a whole product class — their webbing
// manual, not this webbing's manual. [] if none.
export function brandManualsFor(gearType: string, brandName: string): Manual[] {
  const key = brandKey(brandName)
  const files = brandManualManifest[gearType]?.[key] ?? []
  const label = getGearType(gearType)?.label.toLowerCase() ?? gearType
  return brandManualEntries(
    files,
    key,
    `${IMAGE_BASE_URL}/gear-manuals/${gearType}/brand`,
    `Applies to all ${brandName} ${label}`,
  )
}

// Every document we hold for an item, in manifest order, or [] if none: the
// item's own first, then whatever its maker publishes for the whole range.
// That order is what the inline embed reads, so a product with a manual of its
// own shows it, and one with none still shows the range-wide document rather
// than nothing.
export function manualsFor(gearType: string, brandName: string, name: string): Manual[] {
  const key = imageKey(brandName, name)
  const files = manualManifest[gearType]?.[key] ?? []
  return [
    ...manualEntries(files, key, `${IMAGE_BASE_URL}/gear-manuals/${gearType}`),
    ...brandManualsFor(gearType, brandName),
  ]
}
