// Manufacturers directory: search + (data-driven) country filter + brand cards.
//
// Two things worth knowing before editing:
//
// 1. THE COUNTRY FILTER IS DATA-DRIVEN AND USUALLY ABSENT. Brand.country exists
//    in the model but get_brand() only ever sets a name, so every brand's
//    country is null in the current dataset. The group renders only for country
//    values actually present — i.e. not at all today. manufacturers.cy.ts
//    asserts exactly that. Do not "fix" this by hardcoding a country list; there
//    is also no `continent` field anywhere in the schema.
//
// 2. GRID AND LIST RENDER THE SAME CARDS. Only the container's class changes, so
//    [data-cy="manufacturers-card"] can never double-count across view modes
//    (the trap Phase 6.5 hit with the detailed list).

import { useEffect, useMemo, useState } from 'react'
import FilterGroup from '@/components/gear/FilterGroup'
import Sheet from '@/components/layout/Sheet'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import ManufacturerCard from '@/components/brand/ManufacturerCard'
import { useBrandDirectory, type BrandWithCounts } from '@/hooks/useBrandDirectory'

// The directory is grid-only; the toolbar slot the Cards/List toggle used to
// occupy now holds this sort control.
type SortKey = 'gear' | 'name' | 'country' | 'year'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'gear', label: 'Gear count' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'country', label: 'Country' },
  { value: 'year', label: 'Year established' },
]

export default function ManufacturersPage() {
  const { brands, loading } = useBrandDirectory()
  const [sort, setSort] = useState<SortKey>('gear')
  const [query, setQuery] = useState('')
  const [countries, setCountries] = useState<string[]>([])

  // Same rule as the gear listing: below `lg` the country aside has no room, so
  // it moves into a bottom sheet. Mounted one place or the other, never both —
  // [data-cy="manufacturer-filters"] and its pills must stay single-instance.
  const isDesktop = useIsDesktop()
  const [filtersOpen, setFiltersOpen] = useState(false)
  useEffect(() => {
    if (isDesktop) setFiltersOpen(false)
  }, [isDesktop])

  // Only the country values actually present in the data become pills.
  const countryOptions = useMemo(
    () => [...new Set(brands.map(b => b.country).filter((c): c is string => c != null))].sort(),
    [brands],
  )

  const visible = useMemo(() => {
    // Plain lowercase substring match on the name. Deliberately NOT the gear
    // listing's normalize() (which strips punctuation/spaces): the spec asserts
    // every visible card's raw name contains the raw typed term, so a fuzzier
    // match here would surface cards that fail that assertion.
    const term = query.trim().toLowerCase()
    const matched = brands.filter(b => {
      if (term && !b.name.toLowerCase().includes(term)) return false
      if (countries.length && (b.country == null || !countries.includes(b.country))) return false
      return true
    })
    // Name is the tie-break in every mode, so the order is stable and
    // deterministic rather than dependent on API insertion order. Missing values
    // (no country, no founding year) always sort LAST regardless of direction —
    // the same null-last rule the gear listing uses.
    const byName = (a: BrandWithCounts, b: BrandWithCounts) => a.name.localeCompare(b.name)
    const comparators: Record<SortKey, (a: BrandWithCounts, b: BrandWithCounts) => number> = {
      // Deepest catalogue first — the most useful entry point into 56 brands.
      gear: (a, b) => b.total - a.total || byName(a, b),
      name: byName,
      country: (a, b) =>
        (a.country ? 0 : 1) - (b.country ? 0 : 1) ||
        (a.country ?? '').localeCompare(b.country ?? '') ||
        byName(a, b),
      // Oldest first: a founding year is a heritage signal, so ascending reads
      // more naturally than descending here.
      year: (a, b) =>
        (a.year_founded ? 0 : 1) - (b.year_founded ? 0 : 1) ||
        (a.year_founded ?? 0) - (b.year_founded ?? 0) ||
        byName(a, b),
    }
    return matched.sort(comparators[sort])
  }, [brands, query, countries, sort])

  const toggleCountry = (value: string) =>
    setCountries(prev =>
      prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value],
    )

  return (
    <div data-cy="manufacturers-page">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Manufacturers</h1>

      <div className="flex flex-col lg:flex-row lg:gap-8">
        {/* The sidebar only earns its space once there's something to filter by. */}
        {countryOptions.length > 0 && isDesktop && (
          <aside data-cy="manufacturer-filters" className="w-64 shrink-0">
            <FilterGroup group="country" label="Country">
              <div className="flex flex-wrap gap-1.5">
                {countryOptions.map(c => {
                  const active = countries.includes(c)
                  return (
                    <button
                      key={c}
                      data-cy="filter-pill"
                      data-value={c}
                      data-active={active ? 'true' : 'false'}
                      type="button"
                      onClick={() => toggleCountry(c)}
                      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs transition-colors sm:min-h-0 sm:px-2.5 sm:py-1 ${
                        active
                          ? 'border-teal-primary bg-teal-light text-teal-primary'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </FilterGroup>
          </aside>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {/* Mobile entry point to the country filter — rendered only when
                there is a country to filter by, which today there never is (see
                the note at the top of this file). */}
            {countryOptions.length > 0 && !isDesktop && (
              <button
                data-cy="mobile-filter-btn"
                data-count={countries.length}
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={
                  'order-2 flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm ' +
                  (countries.length > 0
                    ? 'border-teal-primary bg-teal-light text-teal-primary'
                    : 'border-gray-300 bg-white text-gray-700')
                }
              >
                Filters
                {countries.length > 0 && (
                  <span className="rounded-full bg-teal-primary px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {countries.length}
                  </span>
                )}
              </button>
            )}
            <input
              data-cy="manufacturer-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search manufacturers…"
              // text-base below sm: iOS Safari zooms the page on focus under 16px.
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-teal-primary focus:outline-none sm:w-64 sm:py-1.5 sm:text-sm"
            />
            <span data-cy="item-count" className="text-sm text-gray-500">
              {visible.length} {visible.length === 1 ? 'manufacturer' : 'manufacturers'}
            </span>

            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:ml-auto">
              Sort by
              <select
                data-cy="manufacturer-sort"
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-700 focus:border-teal-primary focus:outline-none"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <div data-cy="loading-skeleton" className="grid gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div data-cy="empty-state" className="py-16 text-center">
              <p className="text-gray-500">No manufacturers found.</p>
              <button
                data-cy="clear-filters"
                type="button"
                onClick={() => {
                  setQuery('')
                  setCountries([])
                }}
                className="mt-3 font-medium text-teal-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map(brand => (
                <ManufacturerCard key={brand.id} brand={brand} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The mobile home for the country aside. Mounted only while open, so the
          aside and its pills stay single-instance in the DOM. */}
      {filtersOpen && (
        <Sheet title="Filters" onClose={() => setFiltersOpen(false)}>
          <aside data-cy="manufacturer-filters">
            <FilterGroup group="country" label="Country">
              <div className="flex flex-wrap gap-1.5">
                {countryOptions.map(c => {
                  const active = countries.includes(c)
                  return (
                    <button
                      key={c}
                      data-cy="filter-pill"
                      data-value={c}
                      data-active={active ? 'true' : 'false'}
                      type="button"
                      onClick={() => toggleCountry(c)}
                      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs transition-colors ${
                        active
                          ? 'border-teal-primary bg-teal-light text-teal-primary'
                          : 'border-gray-300 bg-white text-gray-600'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </FilterGroup>
          </aside>
        </Sheet>
      )}
    </div>
  )
}
