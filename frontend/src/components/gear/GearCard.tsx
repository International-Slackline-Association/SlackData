// A single gear card. Anatomy (top→bottom) per DESIGN.md and gear_cards.cy.ts:
//   image · top-right overlay: classification bubble + ISA stamp (if certified)
//   brand (small caps) · product name (link) · inline specs · price (amber)
// No gear-type badge: every listing is single-type, so it would be redundant.
// (Revisit when manufacturer pages mix types — see DESIGN.md card anatomy.)
//   Save / Alert / Compare buttons.
//
// The card root carries data-{field} attributes (numeric fields) so sort/filter
// tests can read raw values. Save/Alert/Compare are non-functional stubs here
// (Compare is wired in Phase 7).

import { Link } from 'react-router-dom'
import type { GearTypeMeta } from '@/config/gearTypes'
import { CARD_DATA_FIELDS, INLINE_SPECS } from '@/config/gearFields'
import { dataAttrs, formatPrice, formatValue, type AnyItem } from '@/utils/format'
import { imageUrls } from '@/utils/images'
import CardImageCarousel from './CardImageCarousel'
import ClassificationBubble from './ClassificationBubble'
import IsaApprovedBadge from './IsaApprovedBadge'

const pillBtn =
  'rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors'

export default function GearCard({ item, meta }: { item: AnyItem; meta: GearTypeMeta }) {
  const { slug, hasISA } = meta
  const price = formatPrice(item.price, item.currency)
  const specs = INLINE_SPECS[slug] ?? []
  const isaCertified = hasISA && item.isa_certified === true

  // Every image we hold for this product — the card browses the whole set.
  const images = imageUrls(slug, String(item.brand_name), String(item.name))

  const specParts = specs
    .map(s => formatValue(item[s.field], s.unit))
    .filter(v => v !== '')

  // Webbing stretch % at the active kN (set by the listing page). Emitted only
  // when present — an empty attribute would still match the [data-stretch-percent]
  // selector the sort-order test uses.
  const stretchAttr =
    item.stretch_percent != null ? { 'data-stretch-percent': String(item.stretch_percent) } : {}

  return (
    <article
      data-cy="gear-card"
      {...dataAttrs(item, CARD_DATA_FIELDS[slug] ?? [])}
      {...stretchAttr}
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* `group` drives the carousel arrows, which stay hidden until hover/focus
          so a resting grid isn't peppered with chevrons. */}
      <div
        data-cy="gear-card-image-area"
        data-image-count={images.length}
        className="group relative flex h-40 items-center justify-center bg-gray-50"
      >
        {/* Top-right stack: the highline class first (it's the fastest read on a
            webbing card), the ISA stamp under it. Same bubble component as the
            detail page, so the colors can't drift apart. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
          <ClassificationBubble value={item.classification} />
          {isaCertified && <IsaApprovedBadge />}
        </div>
        <CardImageCarousel urls={images} alt={String(item.name)} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div
          data-cy="gear-card-brand"
          className="text-[11px] font-medium uppercase tracking-wide text-gray-500"
        >
          {String(item.brand_name)}
        </div>

        <Link
          data-cy="gear-card-name"
          to={`/${slug}/${item.id}`}
          className="font-bold leading-snug text-gray-900 hover:text-teal-primary"
        >
          {String(item.name)}
        </Link>

        <div data-cy="gear-card-specs" className="text-xs text-gray-500">
          {specParts.join(' · ')}
        </div>

        <div className="mt-auto pt-2">
          {price && (
            <span data-cy="gear-card-price" className="font-bold" style={{ color: '#E8770A' }}>
              {price}
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button data-cy="btn-save" type="button" className={pillBtn}>Save</button>
          <button data-cy="btn-alert" type="button" className={pillBtn}>Alert</button>
          <button data-cy="btn-compare" type="button" className={pillBtn}>Compare</button>
        </div>
      </div>
    </article>
  )
}
