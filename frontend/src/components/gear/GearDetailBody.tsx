// The full spec sheet for one item, shared by two callers:
//   1. GearDetailPage      — the standalone /:slug/:id route
//   2. GearDetailedList    — one panel per item in the listing's Detailed view
//
// Both render byte-identical content, so the two can never drift; the only
// differences are wiring, expressed as props:
//   nameHref     — when set, the product name links to the detail page (listing
//                  panels need the click target; the detail page IS that page,
//                  so it renders a plain <h1>)
//   showActions  — Save / Alert / Compare pill row, listing panels only
//
// The Compare pill is wired exactly as GearCard's is, from the same three props
// (compareSelected / compareDisabled / onToggleCompare) threaded down by the
// listing page. Both views therefore drive one selection list owned above them,
// so a pick survives a Cards ⇄ Detailed switch. The standalone detail page
// passes none of them and never sets showActions, so the row doesn't render
// there at all.
//
// Layout: image left, everything identifying/spec'd right — so the spec grid
// wraps around the title rather than sitting in a separate block far below it.
// The ISA banner and certification block stay INSIDE the right column, above
// the specs: that keeps a safety warning next to the product name (and
// preserves the name → banner → cert → specs order isa_certification.cy.ts
// asserts geometrically). Stacks to a single column below `sm`.

import { Link } from 'react-router-dom'
import type { GearTypeMeta } from '@/config/gearTypes'
import { useCurrency } from '@/context/CurrencyContext'
import { useIsaWarnings } from '@/hooks/useIsaWarnings'
import { type AnyItem } from '@/utils/format'
import { imageUrls } from '@/utils/images'
import CardImageCarousel from './CardImageCarousel'
import ClassificationBubble from './ClassificationBubble'
import IsaApprovedBadge from './IsaApprovedBadge'
import { isaWarningStatus } from './IsaWarningBadge'
import IsaWarningPanel from './IsaWarningPanel'
import LegacyBadge from './LegacyBadge'
import SpecTable from './SpecTable'

// Kept byte-identical to GearCard's pair so the same button can't look like two
// different controls depending on which view you're in.
const pillBtnBase =
  'inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs transition-colors'
const pillBtn =
  `${pillBtnBase} border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600`
// Selected compare button: teal fill, matching the active filter-pill treatment.
const pillBtnActive =
  `${pillBtnBase} border-teal-primary bg-teal-primary font-medium text-white`

export default function GearDetailBody({
  item,
  meta,
  nameHref,
  showActions = false,
  compareSelected = false,
  compareDisabled = false,
  onToggleCompare,
}: {
  item: AnyItem
  meta: GearTypeMeta
  nameHref?: string
  showActions?: boolean
  compareSelected?: boolean
  compareDisabled?: boolean
  onToggleCompare?: (id: number) => void
}) {
  const price = useCurrency().priceText(item, meta.slug)
  const images = imageUrls(meta.slug, String(item.brand_name), String(item.name))
  const isaWarning = isaWarningStatus(meta.hasISAWarning ? item.isa_warning : null)
  // The full ISA entries behind that status word — description, what to do,
  // date, sources. Shared index, fetched once (see useIsaWarnings).
  const isaWarnings = useIsaWarnings(meta.apiPath, item.id as number)

  const nameClass = 'text-2xl font-bold text-gray-900'

  return (
    <>
      <div className="grid gap-8 sm:grid-cols-[minmax(0,20rem)_1fr]">
        {/* `group` drives the carousel arrows, matching the listing cards. */}
        <div
          data-cy="detail-image-area"
          className="group relative flex h-52 items-center justify-center self-start overflow-hidden rounded-lg bg-gray-50 sm:h-72"
        >
          <CardImageCarousel urls={images} alt={String(item.name)} imgDataCy="detail-img" />
        </div>

        <div className="min-w-0">
          <div
            data-cy="detail-brand"
            className="text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            {String(item.brand_name)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            {nameHref ? (
              <Link
                data-cy="detail-name"
                to={nameHref}
                className={`${nameClass} hover:text-teal-primary`}
              >
                {String(item.name)}
              </Link>
            ) : (
              <h1 data-cy="detail-name" className={nameClass}>
                {String(item.name)}
              </h1>
            )}
            <ClassificationBubble
              value={item.classification}
              certified={meta.hasISA && item.isa_certified === true}
              breakingStrength={item.breaking_strength}
            />
            {/* Same pill as the listing card, inline here since there's no
                image corner to pin it to. */}
            <LegacyBadge active={item.active} />
          </div>
          {price && (
            <div className="mt-2">
              <div
                data-cy="detail-price"
                data-approx={price.approx ? 'true' : 'false'}
                className="text-xl font-bold"
                style={{ color: '#E8770A' }}
              >
                {price.text}
              </div>
              {/* What the manufacturer actually charges, kept visible so a
                  converted figure is never mistaken for the sticker price. */}
              {price.original && (
                <div data-cy="detail-price-original" className="text-xs text-gray-500">
                  {price.original} as sold
                </div>
              )}
            </div>
          )}

          {/* Severity-coloured, from the same table as the card bubble — a
              recall must not be delivered in the same amber as a notice. */}
          {isaWarning !== null && (
            <IsaWarningPanel status={isaWarning} warnings={isaWarnings} />
          )}

          {meta.hasISA && (
            <div data-cy="isa-certification-block" className="mt-5">
              {item.isa_certified === true ? (
                <IsaApprovedBadge className="scale-125 origin-left" />
              ) : (
                <span data-cy="isa-not-certified-text" className="text-sm text-gray-400">
                  Not ISA Certified
                </span>
              )}
            </div>
          )}

          <SpecTable item={item} slug={meta.slug} />
        </div>
      </div>

      {item.description ? (
        <p data-cy="detail-description" className="mt-6 leading-relaxed text-gray-600">
          {String(item.description)}
        </p>
      ) : null}

      {/* Only rendered when it has something in it — an empty row would still
          push its mt-6 of dead space under the specs. */}
      {(item.product_url || showActions) && (
      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {item.product_url ? (
          <a
            data-cy="view-product-btn"
            href={String(item.product_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium text-white"
            style={{ backgroundColor: '#00897B' }}
          >
            View product →
          </a>
        ) : null}

        {/* Save and Alert lived here too and were equally inert. Removed for the
            same reason as on the card — and this panel already carries the real
            "View product" link above, so Compare is all that is left to offer. */}
        {showActions && (
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
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
        )}
      </div>
      )}
    </>
  )
}
