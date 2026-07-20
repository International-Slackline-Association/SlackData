// One manufacturer's full inventory — the "View Gear" destination.
//
// Grouped into a section per gear type, each rendering the normal GearCard grid,
// so every card on this page belongs to this brand by construction (that is what
// manufacturers.cy.ts asserts: >= 1 gear-card, and every gear-card-brand equal
// to the brand name).
//
// Membership is decided on `brand_name`, the gear item's computed field, which
// resolves through the Brand relationship — so it always equals the Brand row's
// own `name` and can't drift from what the directory counted.

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import GearGrid from '@/components/gear/GearGrid'
import { GEAR_TYPES } from '@/config/gearTypes'
import { useBrandDirectory } from '@/hooks/useBrandDirectory'
import type { AnyItem } from '@/utils/format'
import NotFoundPage from './NotFoundPage'

export default function BrandDetailPage() {
  const { id } = useParams()
  const { brands, gearBySlug, loading } = useBrandDirectory()

  const brand = useMemo(
    () => brands.find(b => String(b.id) === String(id)),
    [brands, id],
  )

  const sections = useMemo(() => {
    if (!brand) return []
    return GEAR_TYPES.map(type => ({
      type,
      items: ((gearBySlug[type.slug] ?? []) as unknown as AnyItem[]).filter(
        item => String(item.brand_name) === brand.name,
      ),
    })).filter(s => s.items.length > 0)
  }, [brand, gearBySlug])

  if (loading) {
    return (
      <div data-cy="brand-detail-page">
        <div data-cy="loading-skeleton" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      <h1 data-cy="brand-detail-name" className="mt-3 text-2xl font-bold text-gray-900">
        {brand.name}
      </h1>
      <p className="mb-8 mt-1 text-sm text-gray-500">
        {brand.total} {brand.total === 1 ? 'item' : 'items'}
      </p>

      {sections.length === 0 ? (
        <div data-cy="empty-state" className="py-16 text-center text-gray-500">
          No gear listed for this manufacturer yet.
        </div>
      ) : (
        sections.map(({ type, items }) => (
          <section key={type.slug} data-cy="brand-gear-section" data-slug={type.slug} className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#00897B' }} />
              {type.label}
              <span className="font-normal text-gray-400">({items.length})</span>
            </h2>
            <GearGrid items={items} meta={type} />
          </section>
        ))
      )}
    </div>
  )
}
