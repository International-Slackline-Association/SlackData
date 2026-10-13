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
import { SELLER_RANGE_MANUALS } from '@/config/sellerManuals'
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

function rowImageUrls(gearType: string, row: Record<string, unknown>): string[] {
  return imageUrls(gearType, String(row.brand_name), String(row.name))
}

// Image URLs for a listing item. A collapsed group (utils/groups.ts) has no
// image key of its own — its name is the group's and its brand a list of shops —
// so it shows every member's photos, shop by shop in vendor-table order. On the
// listing that is the whole group whatever the filters (`_groupRows`, set by
// withGroupRows), even when only one shop matched and the card is a plain row.
export function itemImageUrls(gearType: string, item: Record<string, unknown>): string[] {
  const members = (item._groupRows ?? item._members) as Record<string, unknown>[] | undefined
  if (Array.isArray(members)) {
    return [...new Set(members.flatMap(m => rowImageUrls(gearType, m)))]
  }
  return rowImageUrls(gearType, item)
}

// Image URLs for the detail page. A group opened at one member (`_current`, set
// by groupFor) shows that member's own photos, so picking a shop in the vendor
// table switches the carousel to that shop's. A member with none, or a group
// with no member opened (the listing's Detailed view), shows the whole group's.
export function detailImageUrls(gearType: string, item: Record<string, unknown>): string[] {
  const members = item._members as Record<string, unknown>[] | undefined
  if (Array.isArray(members)) {
    const current = members.find(m => Number(m.id) === Number(item._current))
    const own = current ? rowImageUrls(gearType, current) : []
    if (own.length) return own
  }
  return itemImageUrls(gearType, item)
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
// manual, not this webbing's manual. [] if none. `seller` captions it for a
// product the brand sells rather than makes (SELLER_RANGE_MANUALS).
export function brandManualsFor(gearType: string, brandName: string, seller = false): Manual[] {
  const key = brandKey(brandName)
  const files = brandManualManifest[gearType]?.[key] ?? []
  const label = getGearType(gearType)?.label.toLowerCase() ?? gearType
  return brandManualEntries(
    files,
    key,
    `${IMAGE_BASE_URL}/gear-manuals/${gearType}/brand`,
    seller ? `Applies to all ${label} ${brandName} sells` : `Applies to all ${brandName} ${label}`,
  )
}

// Every document we hold for an item, in manifest order, or [] if none: the
// item's own first, then whatever its maker publishes for the whole range, then
// the range-wide documents of any seller in SELLER_RANGE_MANUALS. That order is
// what the inline embed reads, so a product with a manual of its own shows it,
// and one with none still shows the range-wide document rather than nothing.
export function manualsFor(
  gearType: string,
  brandName: string,
  name: string,
  sellers: readonly string[] = [],
): Manual[] {
  const key = imageKey(brandName, name)
  const files = manualManifest[gearType]?.[key] ?? []
  const makerKey = brandKey(brandName)
  return [
    ...manualEntries(files, key, `${IMAGE_BASE_URL}/gear-manuals/${gearType}`),
    ...brandManualsFor(gearType, brandName),
    ...sellers
      .filter(s => SELLER_RANGE_MANUALS.includes(s) && brandKey(s) !== makerKey)
      .flatMap(s => brandManualsFor(gearType, s, true)),
  ]
}
