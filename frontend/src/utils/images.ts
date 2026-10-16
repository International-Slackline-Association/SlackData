// Resolves gear images — and gear manuals — from the generated manifests.
//
// Media is filed by id, one folder per item: gear-images/<type>/<id>_<slug>/
// holds 1.jpg, 2.jpg …; gear-manuals/<type>/<id>_<slug>/ holds the item's PDFs.
// The manifests (built by scripts/build_gear_manifest.py) are keyed by that id,
// so an item renamed in the catalogue store keeps its photos and documents.
// Manuals resolve here beside images rather than in a parallel module that would
// duplicate the base URL. The filename -> row half is utils/manuals.ts.
//
// ── THE ONE-LINE HOSTING SWITCH ──────────────────────────────────────────────
// Locally, images are served from Vite's `public/` at the web root, so the base
// is "". To move to a CDN/object store, upload the `gear-images/` tree under the
// same paths and change IMAGE_BASE_URL to e.g. "https://cdn.slackdata.app".
// Nothing else changes — the manifest keys and file paths stay identical.
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? ''
// ─────────────────────────────────────────────────────────────────────────────

import gearImages from '@/data/gearImages.json'
import gearManuals from '@/data/gearManuals.json'
import brandManuals from '@/data/brandManuals.json'
import brandIds from '@/data/brandIds.json'
import { brandManualEntries, manualEntries, type Manual } from './manuals'
import { getGearType } from '@/config/gearTypes'
import { SELLER_RANGE_MANUALS } from '@/config/sellerManuals'

// gear type -> item id -> paths under that type's folder
const manifest = gearImages as Record<string, Record<string, string[]>>
const manualManifest = gearManuals as Record<string, Record<string, string[]>>
// gear type -> brand catalog_id -> paths under <type>/brand/
const brandManualManifest = brandManuals as Record<string, Record<string, string[]>>
// brand name, as the API spells it -> catalog_id
const brandIdOf = brandIds as Record<string, number>

// A gear row as the API serves it; the lookups below read its id and brand_name.
export type MediaItem = Record<string, unknown>

// All image URLs for an item (first is the primary), or [] if none exist.
export function imageUrls(gearType: string, item: MediaItem): string[] {
  const files = manifest[gearType]?.[String(item.id)] ?? []
  return files.map(f => `${IMAGE_BASE_URL}/gear-images/${gearType}/${f}`)
}

// Image URLs for a listing item. A collapsed group (utils/groups.ts) is no row
// of its own — its name is the group's and its brand a list of shops — so it
// shows every member's photos, shop by shop in vendor-table order. On the
// listing that is the whole group whatever the filters (`_groupRows`, set by
// withGroupRows), even when only one shop matched and the card is a plain row.
export function itemImageUrls(gearType: string, item: Record<string, unknown>): string[] {
  const members = (item._groupRows ?? item._members) as Record<string, unknown>[] | undefined
  if (Array.isArray(members)) {
    return [...new Set(members.flatMap(m => imageUrls(gearType, m)))]
  }
  return imageUrls(gearType, item)
}

// Image URLs for the detail page. A group opened at one member (`_current`, set
// by groupFor) shows that member's own photos, so picking a shop in the vendor
// table switches the carousel to that shop's. A member with none, or a group
// with no member opened (the listing's Detailed view), shows the whole group's.
export function detailImageUrls(gearType: string, item: Record<string, unknown>): string[] {
  const members = item._members as Record<string, unknown>[] | undefined
  if (Array.isArray(members)) {
    const current = members.find(m => Number(m.id) === Number(item._current))
    const own = current ? imageUrls(gearType, current) : []
    if (own.length) return own
  }
  return itemImageUrls(gearType, item)
}

// Convenience: the primary image URL, or null.
export function primaryImage(gearType: string, item: MediaItem): string | null {
  return imageUrls(gearType, item)[0] ?? null
}

// The documents a brand publishes for a whole product class — their webbing
// manual, not this webbing's manual. [] if none. `seller` captions it for a
// product the brand sells rather than makes (SELLER_RANGE_MANUALS). Items carry
// brand names, not ids, so the name is looked up in brandIds.json.
export function brandManualsFor(gearType: string, brandName: string, seller = false): Manual[] {
  const id = brandIdOf[brandName]
  const files = id === undefined ? [] : (brandManualManifest[gearType]?.[String(id)] ?? [])
  const label = getGearType(gearType)?.label.toLowerCase() ?? gearType
  return brandManualEntries(
    files,
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
  item: MediaItem,
  sellers: readonly string[] = [],
): Manual[] {
  const brandName = String(item.brand_name)
  const files = manualManifest[gearType]?.[String(item.id)] ?? []
  const makerId = brandIdOf[brandName]
  return [
    ...manualEntries(files, `${IMAGE_BASE_URL}/gear-manuals/${gearType}`),
    ...brandManualsFor(gearType, brandName),
    ...sellers
      .filter(s => SELLER_RANGE_MANUALS.includes(s) && brandIdOf[s] !== makerId)
      .flatMap(s => brandManualsFor(gearType, s, true)),
  ]
}
