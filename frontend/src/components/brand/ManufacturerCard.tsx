// One manufacturer card — the gear card's twin (DESIGN.md → Manufacturers Page).
//
// It reuses GearCard's shell verbatim: same radius/border/shadow/hover, and the
// same h-40 centered image area on bg-gray-50 with an absolutely-positioned
// top-right overlay. Only the contents of those slots differ — the product shot
// becomes the brand logo, and the classification/ISA overlay becomes a single
// country flag.
//
// The card root carries data-count-{slug} for ALL eight available gear types
// (explicit 0 when the brand has none): manufacturers.cy.ts reads every one off
// the root and compares against counts computed from the API.
//
// `layout` only changes how the card arranges itself; both variants render the
// same single element, so the card count never depends on the view mode.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GEAR_TYPES } from '@/config/gearTypes'
import type { BrandWithCounts } from '@/hooks/useBrandDirectory'
import { manufacturerLogo } from '@/utils/manufacturerImages'
import { flagUrl } from '@/utils/countryFlags'

function CountryFlag({ country }: { country: string | null }) {
  const src = flagUrl(country)
  // No country, or a country we hold no flag for, renders nothing at all —
  // never a placeholder or "unknown" flag.
  if (!src || !country) return null
  return (
    <img
      data-cy="manufacturer-flag"
      data-country={country}
      src={src}
      alt={country}
      title={country}
      loading="lazy"
      className="h-4 w-6 rounded-sm border border-black/10 object-cover shadow-sm"
    />
  )
}

function Logo({ brandName }: { brandName: string }) {
  const src = manufacturerLogo(brandName)
  const [failed, setFailed] = useState(false)

  // Placeholder keeps the image area's height so cards in a row stay aligned.
  if (!src || failed) {
    return (
      <span data-cy="manufacturer-logo-placeholder" className="text-xs text-gray-300">
        No logo
      </span>
    )
  }

  return (
    <img
      data-cy="manufacturer-logo"
      src={src}
      alt={brandName}
      loading="lazy"
      // object-contain, unlike the gear card's object-cover: logos are artwork
      // with intentional margins, and cropping them cuts off wordmarks.
      className="h-full w-full object-contain p-4"
      onError={() => setFailed(true)}
    />
  )
}

export default function ManufacturerCard({
  brand,
  layout,
}: {
  brand: BrandWithCounts
  layout: 'grid' | 'list'
}) {
  const countAttrs = Object.fromEntries(
    GEAR_TYPES.map(t => [`data-count-${t.slug}`, String(brand.counts[t.slug] ?? 0)]),
  )

  // Inventory pills show only what the brand actually stocks — a wall of "0"
  // pills is noise. The zeroes still live on the root as data attributes.
  const stocked = GEAR_TYPES.filter(t => (brand.counts[t.slug] ?? 0) > 0)
  const isList = layout === 'list'

  return (
    <article
      data-cy="manufacturers-card"
      {...countAttrs}
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
        isList ? 'flex flex-wrap items-center gap-x-5 gap-y-3 p-4' : 'flex flex-col'
      }`}
    >
      {/* Image area — the gear card's, with the flag where the classification
          bubble sits. In list layout it shrinks to a fixed thumbnail so the row
          stays compact, but keeps the same relative/overlay structure. */}
      <div
        data-cy="manufacturer-image-area"
        className={`relative flex shrink-0 items-center justify-center bg-gray-50 ${
          isList ? 'h-16 w-24 rounded-lg' : 'h-40'
        }`}
      >
        <div className="absolute right-2 top-2 z-10">
          <CountryFlag country={brand.country} />
        </div>
        <Logo brandName={brand.name} />
      </div>

      <div className={isList ? 'min-w-[10rem] flex-1' : 'flex flex-1 flex-col gap-1 p-4'}>
        <div className="flex flex-wrap items-center gap-2">
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

        {brand.year_founded && (
          <div data-cy="manufacturer-founded" className="text-xs text-gray-500">
            Est. {brand.year_founded}
          </div>
        )}

        <div
          data-cy="manufacturer-gear-counts"
          className={`flex flex-wrap gap-1.5 ${isList ? 'mt-2' : 'mt-2'}`}
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

        {!isList && <div className="flex-1" />}

        {!isList && (
          <Link
            data-cy="btn-view-gear"
            to={`/manufacturers/${brand.id}`}
            className="mt-3 rounded-full border border-teal-primary px-4 py-1.5 text-center text-xs font-medium text-teal-primary transition-colors hover:bg-teal-light"
          >
            View Gear
          </Link>
        )}
      </div>

      {isList && (
        <Link
          data-cy="btn-view-gear"
          to={`/manufacturers/${brand.id}`}
          className="shrink-0 rounded-full border border-teal-primary px-4 py-1.5 text-center text-xs font-medium text-teal-primary transition-colors hover:bg-teal-light"
        >
          View Gear
        </Link>
      )}
    </article>
  )
}
