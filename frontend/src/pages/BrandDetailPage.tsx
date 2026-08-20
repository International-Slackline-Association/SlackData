// One manufacturer's full inventory — the "View Gear" destination.
//
// Grouped into a section per gear type, each rendering the normal GearCard grid,
// so every card on this page belongs to this brand by construction (that is what
// manufacturers.cy.ts asserts: >= 1 gear-card, and every gear-card-brand equal
// to the brand name).
//
// Membership is decided on `brand_name`, the gear item's computed field, which
// resolves through the Brand relationship — so it always equals the Brand row's
// own `name` and can't drift from what the directory counted. The grouping and
// its A→Z ordering live in utils/brandSections.ts, where they are unit-tested.
//
// Each section header is a collapse toggle (DESIGN.md § Detail page gear
// sections). Collapse state is transient component state — a reading aid for a
// long catalogue, not something worth putting in the URL.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import GearGrid from '@/components/gear/GearGrid'
import { GEAR_TYPES } from '@/config/gearTypes'
import { useBrandDirectory } from '@/hooks/useBrandDirectory'
import { buildBrandSections } from '@/utils/brandSections'
import type { AnyItem } from '@/utils/format'
import NotFoundPage from './NotFoundPage'

export default function BrandDetailPage() {
  const { id } = useParams()
  const { brands, gearBySlug, loading } = useBrandDirectory()
  // Slugs the reader has collapsed; absent = expanded, so sections default open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const brand = useMemo(
    () => brands.find(b => String(b.id) === String(id)),
    [brands, id],
  )

  const sections = useMemo(() => {
    if (!brand) return []
    return buildBrandSections(
      GEAR_TYPES,
      gearBySlug as Partial<Record<string, AnyItem[]>>,
      brand.name,
    )
  }, [brand, gearBySlug])

  const toggle = (slug: string) =>
    setCollapsed(prev => ({ ...prev, [slug]: !prev[slug] }))

  if (loading) {
    return (
      <div data-cy="brand-detail-page">
        <div data-cy="loading-skeleton" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      </div>
    )
  }

  if (!brand) return <NotFoundPage />

  return (
    <div data-cy="brand-detail-page">
      <Link
        data-cy="brand-back-link"
        to="/manufacturers"
        className="inline-flex items-center gap-1 text-sm text-teal-primary hover:underline"
      >
        ← Manufacturers
      </Link>

      {brand.website ? (
        <a
          data-cy="brand-detail-name"
          href={brand.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-fit text-2xl font-bold text-gray-900 hover:text-teal-primary hover:underline"
        >
          {brand.name}
        </a>
      ) : (
        <h1 data-cy="brand-detail-name" className="mt-3 text-2xl font-bold text-gray-900">
          {brand.name}
        </h1>
      )}
      <p className="mb-8 mt-1 text-sm text-gray-500">
        {brand.total} {brand.total === 1 ? 'item' : 'items'}
      </p>

      {sections.length === 0 ? (
        <div data-cy="empty-state" className="py-16 text-center text-gray-500">
          No gear listed for this manufacturer yet.
        </div>
      ) : (
        sections.map(({ type, items }) => {
          const isOpen = !collapsed[type.slug]
          return (
            <section
              key={type.slug}
              data-cy="brand-gear-section"
              data-slug={type.slug}
              data-collapsed={String(!isOpen)}
              className="mb-10"
            >
              <h2 className="mb-3">
                <button
                  type="button"
                  data-cy="brand-section-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggle(type.slug)}
                  className="flex cursor-pointer items-center gap-2 rounded text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-primary"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#00897B' }} />
                  <span data-cy="brand-section-label">{type.label}</span>
                  <span className="font-normal text-gray-400">({items.length})</span>
                  {/* One glyph for both states — it rotates rather than swapping,
                      so expanded/collapsed read as the same control moving. */}
                  <svg
                    data-cy="brand-section-chevron"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                  >
                    <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </h2>
              {isOpen && <GearGrid items={items} meta={type} />}
            </section>
          )
        })
      )}
    </div>
  )
}
