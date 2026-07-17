// A single gear card. Anatomy (top→bottom) per DESIGN.md and gear_cards.cy.ts:
//   ISA stamp (if certified) · image
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
import { primaryImage } from '@/utils/images'
import IsaApprovedBadge from './IsaApprovedBadge'

const pillBtn =
  'rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors'

export default function GearCard({ item, meta }: { item: AnyItem; meta: GearTypeMeta }) {
  const { slug, hasISA } = meta
  const price = formatPrice(item.price, item.currency)
  const specs = INLINE_SPECS[slug] ?? []
  const isaCertified = hasISA && item.isa_certified === true

  const imgSrc = primaryImage(slug, String(item.brand_name), String(item.name))

  const specParts = specs
    .map(s => formatValue(item[s.field], s.unit))
    .filter(v => v !== '')

  return (
    <article
      data-cy="gear-card"
      {...dataAttrs(item, CARD_DATA_FIELDS[slug] ?? [])}
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        data-cy="gear-card-image-area"
        className="relative flex h-40 items-center justify-center bg-gray-50"
      >
        {isaCertified && (
          <div className="absolute right-2 top-2">
            <IsaApprovedBadge />
          </div>
        )}
        {imgSrc ? (
          <img
            data-cy="gear-card-img"
            src={imgSrc}
            alt={String(item.name)}
            loading="lazy"
            className="h-full w-full object-contain p-3"
            onError={e => {
              // Manifest key didn't resolve to a real file — fall back to placeholder.
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.removeAttribute('hidden')
            }}
          />
        ) : null}
        <span hidden={!!imgSrc} className="text-xs text-gray-300">No image</span>
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
