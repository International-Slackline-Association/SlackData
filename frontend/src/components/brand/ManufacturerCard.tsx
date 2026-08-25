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
// The directory is grid-only (the Cards/List toggle was removed in favour of a
// sort control), so there is a single layout.

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

export default function ManufacturerCard({ brand }: { brand: BrandWithCounts }) {
  const countAttrs = Object.fromEntries(
    GEAR_TYPES.map(t => [`data-count-${t.slug}`, String(brand.counts[t.slug] ?? 0)]),
  )

  // Inventory pills show only what the brand actually stocks — a wall of "0"
  // pills is noise. The zeroes still live on the root as data attributes.
  const stocked = GEAR_TYPES.filter(t => (brand.counts[t.slug] ?? 0) > 0)

  return (
    <article
      data-cy="manufacturers-card"
      {...countAttrs}
      // Brand.active is a plain bool, so this is "confirmed inactive" vs
      // "everything else" — it cannot distinguish verified-trading from never
      // reviewed, which is why only the negative case is ever labelled. An
      // inactive card is dimmed rather than hidden: its gear is still real and
      // still worth browsing, it just can't be bought new.
      data-active={String(brand.active)}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
        brand.active ? '' : 'opacity-75'
      }`}
    >
      {/* Image area — the gear card's, with the flag where the classification
          bubble sits. */}
      <div
        data-cy="manufacturer-image-area"
        className="relative flex h-40 shrink-0 items-center justify-center bg-gray-50"
      >
        {/* Top-LEFT: the status pill, in the same slot the gear card uses for its
            category badge — so the two card types read the same way. Top-RIGHT is
            the flag, mirroring the gear card's classification bubble. */}
        {!brand.active && (
          <span
            data-cy="manufacturer-inactive"
            title="No longer trading"
            className="absolute left-2 top-2 z-10 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm"
          >
            Inactive
          </span>
        )}
        <div className="absolute right-2 top-2 z-10">
          <CountryFlag country={brand.country} />
        </div>
        <Logo brandName={brand.name} />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Stretched link: the after:inset-0 overlay makes the entire card a
              click target for the detail page, while group-hover highlights the
              name from anywhere on the card. The website button below sits at
              z-10 so it stays clickable above this overlay. */}
          <Link
            to={`/manufacturers/${brand.id}`}
            className="rounded-sm outline-none after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-teal-primary"
          >
            {/* Above the overlay, which is anchored to the CARD (the nearest
                positioned ancestor) and so paints over this heading — its own
                link text — as readily as over the rest of the card. Unlifted,
                the name is unselectable and hit-tests as the bare <a>. */}
            <h2
              data-cy="manufacturer-name"
              className="relative z-10 font-bold text-gray-900 group-hover:text-teal-primary"
            >
              {brand.name}
            </h2>
          </Link>
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

        <div data-cy="manufacturer-gear-counts" className="mt-2 flex flex-wrap gap-1.5">
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

        <div className="flex-1" />

        {brand.website ? (
          <a
            data-cy="btn-website"
            href={brand.website}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 mt-3 rounded-full border border-teal-primary px-4 py-1.5 text-center text-xs font-medium text-teal-primary transition-colors hover:bg-teal-light"
          >
            Visit Website
          </a>
        ) : (
          <span
            data-cy="btn-website-disabled"
            className="mt-3 cursor-not-allowed rounded-full border border-gray-200 px-4 py-1.5 text-center text-xs font-medium text-gray-300"
          >
            No Website
          </span>
        )}
      </div>
    </article>
  )
}
