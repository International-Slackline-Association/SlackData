// One manufacturer card. Anatomy per DESIGN.md "Manufacturers Page":
//   brand name · slackline-focused badge · country / year founded (small gray)
//   gear inventory pills (one per type the brand actually stocks) · View Gear
//
// The card root carries data-count-{slug} for ALL eight available gear types
// (explicit 0 when the brand has none) — manufacturers.cy.ts reads every one of
// them off the root and compares against counts it computes from the API.
//
// `layout` only changes how the card arranges itself; both variants render the
// same single element, so the card count never depends on the view mode.

import { Link } from 'react-router-dom'
import { GEAR_TYPES } from '@/config/gearTypes'
import type { BrandWithCounts } from '@/hooks/useBrandDirectory'

export default function ManufacturerCard({
  brand,
  layout,
}: {
  brand: BrandWithCounts
  layout: 'grid' | 'list'
}) {
  // data-count-{slug} for every available type, including the zeroes.
  const countAttrs = Object.fromEntries(
    GEAR_TYPES.map(t => [`data-count-${t.slug}`, String(brand.counts[t.slug] ?? 0)]),
  )

  // Inventory pills show only what the brand actually has — a wall of "0" pills
  // is noise. The zeroes still live on the root as data attributes.
  const stocked = GEAR_TYPES.filter(t => (brand.counts[t.slug] ?? 0) > 0)

  const isList = layout === 'list'

  return (
    <article
      data-cy="manufacturers-card"
      {...countAttrs}
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        isList ? 'flex flex-wrap items-center gap-x-4 gap-y-3' : 'flex flex-col'
      }`}
    >
      <div className={isList ? 'min-w-[12rem] flex-1' : ''}>
        <div className="flex items-center gap-2">
          <h2 data-cy="manufacturer-name" className="font-bold text-gray-900">
            {brand.name}
          </h2>
          {brand.slackline_focused && (
            <span
              data-cy="slackline-focused-badge"
              title="Slackline-focused manufacturer"
              className="rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-primary"
            >
              Slackline
            </span>
          )}
        </div>

        {/* Both are null for every brand today (get_brand() only sets a name),
            so this line usually renders nothing at all. */}
        {(brand.country || brand.year_founded) && (
          <div className="mt-0.5 text-xs text-gray-500">
            {[brand.country, brand.year_founded].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      <div
        data-cy="manufacturer-gear-counts"
        className={`flex flex-wrap gap-1.5 ${isList ? '' : 'mt-3'}`}
      >
        {stocked.length === 0 ? (
          <span className="text-xs text-gray-400">No gear listed</span>
        ) : (
          stocked.map(t => (
            <span
              key={t.slug}
              data-cy="gear-count-pill"
              data-slug={t.slug}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
            >
              {t.label}: {brand.counts[t.slug]}
            </span>
          ))
        )}
      </div>

      <Link
        data-cy="btn-view-gear"
        to={`/manufacturers/${brand.id}`}
        className={`rounded-full border border-teal-primary px-4 py-1.5 text-center text-xs font-medium text-teal-primary transition-colors hover:bg-teal-light ${
          isList ? '' : 'mt-4'
        }`}
      >
        View Gear
      </Link>
    </article>
  )
}
