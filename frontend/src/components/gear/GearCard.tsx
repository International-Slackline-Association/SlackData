// A single gear card. Anatomy (top→bottom) per DESIGN.md and gear_cards.cy.ts:
//   image · top-right overlay: ISA warning bubble (recall/warning/notice) ·
//     classification bubble (ISA-certified, or sub-22 kN "Not for Highline") ·
//     ISA stamp (if certified)
//   brand (small caps) · product name (link) · inline specs · price (amber)
// No gear-type badge: every listing is single-type, so it would be redundant.
// (Revisit when manufacturer pages mix types — see DESIGN.md card anatomy.)
//   Save / Alert / Compare buttons.
//
// The card root carries data-{field} attributes (numeric fields) so sort/filter
// tests can read raw values. Save/Alert are non-functional stubs; Compare toggles
// the item into the sticky compare bar (state owned by GearListingPage).

import { Link } from 'react-router-dom'
import type { GearTypeMeta } from '@/config/gearTypes'
import { CARD_DATA_FIELDS, INLINE_SPECS } from '@/config/gearFields'
import { useCurrency } from '@/context/CurrencyContext'
import { dataAttrs, formatValue, type AnyItem } from '@/utils/format'
import { imageUrls } from '@/utils/images'
import BrandLink from '@/components/brand/BrandLink'
import CardImageCarousel from './CardImageCarousel'
import ClassificationBubble from './ClassificationBubble'
import IsaApprovedBadge from './IsaApprovedBadge'
import IsaWarningBadge from './IsaWarningBadge'
import LegacyBadge from './LegacyBadge'

// flex-1 + min-h-10: three equal-width buttons spanning the card, at a size a
// thumb can actually hit. DESIGN.md § Card Anatomy always specified equal-width
// full-width buttons; they had been rendered as small left-aligned pills.
const pillBtnBase =
  'flex min-h-10 flex-1 items-center justify-center rounded-full border px-3 text-xs transition-colors'
const pillBtn =
  `${pillBtnBase} border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600`
// Selected compare button: teal fill, matching the active filter-pill treatment.
const pillBtnActive =
  `${pillBtnBase} border-teal-primary bg-teal-primary font-medium text-white`

export default function GearCard({
  item,
  meta,
  compareSelected = false,
  compareDisabled = false,
  onToggleCompare,
}: {
  item: AnyItem
  meta: GearTypeMeta
  compareSelected?: boolean
  // The compare cap is full and this card isn't one of the selected — its button
  // is disabled so a 5th can't be added.
  compareDisabled?: boolean
  onToggleCompare?: (id: number) => void
}) {
  const { slug, hasISA } = meta
  // The card shows the converted figure only — the as-sold original lives on
  // the detail page and in the compare cell, where there's room for it.
  const price = useCurrency().priceText(item, slug)
  const specs = INLINE_SPECS[slug] ?? []
  const isaCertified = hasISA && item.isa_certified === true

  // Every image we hold for this product — the card browses the whole set.
  const images = imageUrls(slug, String(item.brand_name), String(item.name))

  // Roughly half the catalogue has no product_url (57/100 webbings, 36/100
  // weblocks; kits and grips are near-complete). The link is simply absent on
  // those cards rather than rendered dead — Compare then takes the row on its
  // own, which is the same treatment the detail page gives a missing link.
  const productUrl = typeof item.product_url === 'string' && item.product_url !== ''
    ? item.product_url
    : null

  // A spec is either a plain field + unit, or a composite that folds several
  // fields into one segment (weblock width range). Empty segments drop out, so
  // a missing value never leaves a dangling " · " separator.
  const specParts = specs
    .map(s => (s.value ? s.value(item) : formatValue(item[s.field], s.unit)))
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
      className="relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Whole-card link. A stretched overlay rather than wrapping the card in an
          <a>: the card contains its own controls (carousel arrows and dots,
          Compare, the outbound product link), and nesting those inside an anchor
          is invalid HTML. Everything interactive is lifted to z-10 above this;
          the decorative badge stacks are pointer-events-none so the dead space
          around them still navigates. aria-hidden + tabIndex -1 because the name
          link below is the same destination — the overlay is a mouse
          affordance, and duplicating it in the tab order and the a11y tree
          would make every card announce itself twice. */}
      <Link
        data-cy="gear-card-link"
        to={`/${slug}/${item.id}`}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 z-[1]"
      />
      {/* `group` drives the carousel arrows, which stay hidden until hover/focus
          so a resting grid isn't peppered with chevrons. */}
      <div
        data-cy="gear-card-image-area"
        data-image-count={images.length}
        // overflow-hidden: the image fits the band by height and the blurred
        // backdrop is scaled past its edges — both must be clipped to the band.
        className="group relative flex h-40 items-center justify-center overflow-hidden bg-gray-50"
      >
        {/* Top-right stack: any ISA warning first, then the highline class (the
            fastest read on an unwarned webbing card), the ISA stamp under it. The bubble appears on
            certified webbings and on sub-22 kN "Not for Highline" ones (see
            ClassificationBubble); the stamp only on certified. Same bubble
            component as the detail page, so the colors can't drift apart. */}
        {/* Top-left: lifecycle status. Legacy = no longer sold; nothing renders
            for active/unknown gear. Mirrors the manufacturer card's Inactive pill. */}
        <LegacyBadge active={item.active} className="pointer-events-none absolute left-2 top-2 z-10" />
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
          {/* Severity first, above the class: a recalled Type A webbing must not
              read as "Type A" before it reads as "RECALL". */}
          <IsaWarningBadge value={meta.hasISAWarning ? item.isa_warning : null} />
          <ClassificationBubble
            value={item.classification}
            certified={isaCertified}
            breakingStrength={item.breaking_strength}
          />
          {isaCertified && <IsaApprovedBadge />}
        </div>
        <CardImageCarousel urls={images} alt={String(item.name)} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div
          data-cy="gear-card-brand"
          className="text-[11px] font-medium uppercase tracking-wide text-gray-500"
        >
          <BrandLink name={item.brand_name} />
        </div>

        <Link
          data-cy="gear-card-name"
          to={`/${slug}/${item.id}`}
          // relative z-10: the real, focusable link, kept above the overlay.
          className="relative z-10 font-bold leading-snug text-gray-900 hover:text-teal-primary"
        >
          {String(item.name)}
        </Link>

        <div data-cy="gear-card-specs" className="text-xs text-gray-500">
          {specParts.join(' · ')}
        </div>

        <div className="mt-auto pt-2">
          {price && (
            <span
              data-cy="gear-card-price"
              data-approx={price.approx ? 'true' : 'false'}
              className="font-bold"
              style={{ color: '#E8770A' }}
            >
              {price.text}
            </span>
          )}
        </div>

        {/* Two real actions. Save and Alert used to sit here and did nothing at
            all — no handler, no state, nowhere for the intent to go — so they
            were removed rather than left as furniture. The product link takes
            their place: it is the one thing a reader actually wants from a card
            they have decided on, and it is the only outbound action the
            catalogue can honestly offer today. */}
        <div className="relative z-10 flex gap-2 pt-2">
          {productUrl && (
            <a
              data-cy="btn-product"
              href={productUrl}
              // The card links out to a manufacturer's site: new tab, and
              // noopener so the opened page can't reach back through window.opener.
              target="_blank"
              rel="noopener noreferrer"
              className={pillBtn}
            >
              View product ↗
            </a>
          )}
          <button
            data-cy="btn-compare"
            type="button"
            data-active={compareSelected ? 'true' : 'false'}
            disabled={compareDisabled}
            onClick={() => onToggleCompare?.(Number(item.id))}
            className={compareSelected ? pillBtnActive : pillBtn}
          >
            Compare
          </button>
        </div>
      </div>
    </article>
  )
}
