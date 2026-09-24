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
// asserts geometrically). "Also sold by" sits in that column too, between the
// banner and the cert block — under the price it belongs to, and never above
// the banner. Stacks to a single column below `sm`.

import { Link } from 'react-router-dom'
import type { GearTypeMeta } from '@/config/gearTypes'
import {
  ISA_APPROVED_GEAR_URL,
  ISA_CERTIFICATION_ANCHOR,
  ISA_STANDARDS_URL,
} from '@/config/isaLinks'
import { useCurrency } from '@/context/CurrencyContext'
import { useOriginState } from '@/context/OriginContext'
import { useIsaWarnings } from '@/hooks/useIsaWarnings'
import { type AnyItem } from '@/utils/format'
import { imageUrls } from '@/utils/images'
import BrandLink from '@/components/brand/BrandLink'
import AlsoSoldBy from './AlsoSoldBy'
import CardImageCarousel from './CardImageCarousel'
import IsaApprovedBadge from './IsaApprovedBadge'
import IsaStatusLabel from './IsaStatusLabel'
import { isaWarningStatus } from './IsaWarningBadge'
import IsaWarningPanel from './IsaWarningPanel'
import HistoricBadge from './HistoricBadge'
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
  // Only used when `nameHref` is set, i.e. in the listing's Detailed view: the
  // panel's title links to the standalone page, which then knows the way back.
  const originState = useOriginState()
  const images = imageUrls(meta.slug, String(item.brand_name), String(item.name))
  const isaWarning = isaWarningStatus(meta.hasISAWarning ? item.isa_warning : null)
  // The full ISA entries behind that status word — description, what to do,
  // date, sources. Shared index, fetched once (see useIsaWarnings).
  const isaWarnings = useIsaWarnings(meta.apiPath, item.id as number)
  const isaCertified = meta.hasISA && item.isa_certified === true
  // The maker's own "not for highlining", researched from their page — never
  // derived from strength. Only a `true` is drawn: `false` (marketed for
  // highlining) and `null` (not checked, or the page is silent) say nothing.
  const notForHighline = item.manufacturer_not_for_highline === true
  const notForHighlineSource =
    typeof item.manufacturer_not_for_highline_source === 'string' &&
    item.manufacturer_not_for_highline_source !== ''
      ? item.manufacturer_not_for_highline_source
      : null
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
          {/* Header row: brand / name / price on the left, the ISA stamp on the
              right. The stamp links to the ISA's approved-gear list — the ISA's
              own record of the certificate, which is where the details belong
              (we no longer repeat them here). Its alt/title name the primary
              certificate, `isa_certificate`: the plain Webbing certificate
              where there is one, else the Sewn Loop one (set by the loader). */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div
                data-cy="detail-brand"
                className="text-xs font-medium uppercase tracking-wide text-gray-500"
              >
                <BrandLink name={item.brand_name} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2.5">
                {nameHref ? (
                  <Link
                    data-cy="detail-name"
                    to={nameHref}
                    state={originState}
                    className={`${nameClass} hover:text-teal-primary`}
                  >
                    {String(item.name)}
                  </Link>
                ) : (
                  <h1 data-cy="detail-name" className={nameClass}>
                    {String(item.name)}
                  </h1>
                )}
                {/* No showNotCertified here, unlike the card: the certification
                    block further down already says "Not ISA Certified" in full, and
                    two statements of the same fact within one screen is one too
                    many. The card has no such block, which is why it gets the pill. */}
                <IsaStatusLabel certified={isaCertified} isaClass={item.isa_class} />
                {/* Same pill as the listing card, inline here since there's no
                    image corner to pin it to. */}
                <HistoricBadge active={item.active} />
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
            </div>
            {isaCertified && (
              <a
                data-cy="isa-stamp-link"
                href={ISA_APPROVED_GEAR_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={`ISA Approved${item.isa_certificate ? ` (${String(item.isa_certificate)})` : ''} — view on the ISA's approved-gear list`}
                className="shrink-0 rounded-md transition-opacity hover:opacity-80"
              >
                <IsaApprovedBadge
                  size="detail"
                  certificate={item.isa_certificate as string | null | undefined}
                  isaClass={item.isa_class as string | null | undefined}
                />
              </a>
            )}
          </div>

          {/* Severity-coloured, from the same table as the card bubble — a
              recall must not be delivered in the same amber as a notice. */}
          {isaWarning !== null && (
            <IsaWarningPanel status={isaWarning} warnings={isaWarnings} />
          )}

          {/* Directly under the price, because that is the question it answers:
              this is what the thing costs HERE, and here is who else sells it.
              Below the split — where it first sat — it was separated from the
              price by the whole spec grid and read as an afterthought.

              It goes AFTER the ISA warning banner and not before it. The banner
              is deliberately pinned next to the product name (see the layout
              note at the top of this file, asserted geometrically by
              isa_certification.cy.ts), and a list of shops must never push a
              recall further from the name of the thing recalled. */}
          <AlsoSoldBy sellers={item.gear_sellers as string[] | null} />

          {meta.hasISA && (
            <div data-cy="isa-certification-block" className="mt-5">
              {isaCertified ? (
                <>
                  {/* The stamp itself is up in the header row. What a certificate covers is the ISA's to say, not ours, so
                      the note points there — and at /safety for how we record
                      it. On certified items only: an uncertified one has no
                      certificate to explain. */}
                  <p data-cy="isa-certification-note" className="text-xs text-gray-500">
                    Certified to an ISA gear standard.{' '}
                    <a
                      data-cy="isa-certification-note-standards"
                      href={ISA_STANDARDS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-teal-primary hover:underline"
                    >
                      What the standards cover
                    </a>
                    {' · '}
                    <Link
                      data-cy="isa-certification-note-safety"
                      to={`/safety#${ISA_CERTIFICATION_ANCHOR}`}
                      className="font-medium text-teal-primary hover:underline"
                    >
                      How we record certification
                    </Link>
                  </p>
                </>
              ) : (
                <span data-cy="isa-not-certified-text" className="text-sm text-gray-400">
                  Not ISA Certified
                </span>
              )}
            </div>
          )}

          {/* Directly under the certification block, and on the page only —
              never on the card. It is the manufacturer's statement, so it is
              worded as theirs and links to where they made it. Rendered on
              every type (the field is on all eight), including kits and tree
              protectors, which have no certification block above it. */}
          {notForHighline && (
            <p
              data-cy="manufacturer-not-for-highline"
              className={`${meta.hasISA ? 'mt-2' : 'mt-5'} text-sm font-medium text-gray-900`}
            >
              {notForHighlineSource ? (
                <a
                  data-cy="manufacturer-not-for-highline-source"
                  href={notForHighlineSource}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Manufacturer states not for highlining ↗
                </a>
              ) : (
                'Manufacturer states not for highlining'
              )}
            </p>
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
