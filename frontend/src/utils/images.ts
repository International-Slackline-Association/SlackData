// Resolves gear photos — and gear manuals — from the media manifest the API
// serves (utils/mediaStore.ts, LIVE_EDITING_PHASE_4.md P4-C).
//
// Media is data on each item, keyed by the item's id, so an item renamed in
// the catalogue store keeps its photos and documents. Every photo comes in two
// sizes (P4-D): the 480 px one shows first, the 1600 px one replaces it once it
// has loaded (CardImageCarousel). Manuals resolve here beside images rather
// than in a parallel module; the entry -> row half is utils/manuals.ts.
//
// Callers that render media call `useMedia()` so they re-render when the
// manifest arrives; these lookups read whatever has arrived so far.

import { brandManualEntries, manualEntries, type Manual } from './manuals'
import { mediaManifest, mediaUrl } from './mediaStore'
import { getGearType } from '@/config/gearTypes'
import { SELLER_RANGE_MANUALS } from '@/config/sellerManuals'

/** One photo, both sizes as URLs. */
export interface Photo {
  small: string
  large: string
}

// A gear row as the API serves it; the lookups below read its id and brand_name.
export type MediaItem = Record<string, unknown>

// Every photo of an item (the first is the primary), or [] if none.
export function imageUrls(gearType: string, item: MediaItem): Photo[] {
  const photos = mediaManifest().photos[gearType]?.[String(item.id)] ?? []
  return photos.map(p => ({ small: mediaUrl(p.small), large: mediaUrl(p.large) }))
}

// Photos for a listing item. A collapsed group (utils/groups.ts) is no row of
// its own — its name is the group's and its brand a list of shops — so it shows
// every member's photos, shop by shop in vendor-table order. On the listing
// that is the whole group whatever the filters (`_groupRows`, set by
// withGroupRows), even when only one shop matched and the card is a plain row.
// The shops that matched lead (`_members`, or the row itself), so a card
// filtered to one brand opens on that brand's photo, not the first shop's.
export function itemImageUrls(gearType: string, item: Record<string, unknown>): Photo[] {
  type Row = Record<string, unknown>
  const members = (item._groupRows ?? item._members) as Row[] | undefined
  if (Array.isArray(members)) {
    const matching = (item._members as Row[] | undefined) ?? [item]
    const ids = new Set(matching.map(m => String(m.id)))
    const ordered = [...matching, ...members.filter(m => !ids.has(String(m.id)))]
    const seen = new Set<string>()
    return ordered.flatMap(m => imageUrls(gearType, m)).filter(p => {
      if (seen.has(p.large)) return false
      seen.add(p.large)
      return true
    })
  }
  return imageUrls(gearType, item)
}

// Photos for the detail page. A group opened at one member (`_current`, set by
// groupFor) shows that member's own photos, so picking a shop in the vendor
// table switches the carousel to that shop's. A member with none, or a group
// with no member opened (the listing's Detailed view), shows the whole group's.
export function detailImageUrls(gearType: string, item: Record<string, unknown>): Photo[] {
  const members = item._members as Record<string, unknown>[] | undefined
  if (Array.isArray(members)) {
    const current = members.find(m => Number(m.id) === Number(item._current))
    const own = current ? imageUrls(gearType, current) : []
    if (own.length) return own
  }
  return itemImageUrls(gearType, item)
}

// Convenience: the primary photo, or null.
export function primaryImage(gearType: string, item: MediaItem): Photo | null {
  return imageUrls(gearType, item)[0] ?? null
}

// The documents a brand publishes for a whole product class — their webbing
// manual, not this webbing's manual. [] if none. `seller` captions it for a
// product the brand sells rather than makes (SELLER_RANGE_MANUALS).
export function brandManualsFor(gearType: string, brandName: string, seller = false): Manual[] {
  const documents = mediaManifest().brandManuals[gearType]?.[brandName] ?? []
  const label = getGearType(gearType)?.label.toLowerCase() ?? gearType
  return brandManualEntries(
    documents,
    mediaUrl,
    seller ? `Applies to all ${label} ${brandName} sells` : `Applies to all ${brandName} ${label}`,
  )
}

// Every document we hold for an item, in order, or [] if none: the item's own
// first, then whatever its maker publishes for the whole range, then the
// range-wide documents of any seller in SELLER_RANGE_MANUALS. That order is
// what the inline embed reads, so a product with a manual of its own shows it,
// and one with none still shows the range-wide document rather than nothing.
export function manualsFor(
  gearType: string,
  item: MediaItem,
  sellers: readonly string[] = [],
): Manual[] {
  const brandName = String(item.brand_name)
  const documents = mediaManifest().manuals[gearType]?.[String(item.id)] ?? []
  return [
    ...manualEntries(documents, mediaUrl),
    ...brandManualsFor(gearType, brandName),
    ...sellers
      .filter(s => SELLER_RANGE_MANUALS.includes(s) && s !== brandName)
      .flatMap(s => brandManualsFor(gearType, s, true)),
  ]
}
