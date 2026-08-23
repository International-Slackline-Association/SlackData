// Grouping a brand's inventory into per-gear-type sections for the detail page.
//
// Split out of BrandDetailPage because the part worth testing here is pure and
// invisible in a screenshot: which items land in which section, and in what
// order. The alphabetical rule matters — the raw API order is id order, which
// reads as random when scanning a brand's catalogue for one product. See
// DESIGN.md § Manufacturers Page → Detail page gear sections.
//
// Deliberately dependency-free (only ./compare, which is held to the same bar),
// so `npm run test:unit` can load it under node --experimental-strip-types
// without the `@/` alias or a bundler. The collapse behaviour it feeds is DOM
// state and lives in cypress/e2e/manufacturers.cy.ts.

// `compareByName` / `sortByName` live in ./compare and are re-exported here so
// the existing callers (and tests/unit/brandSections.test.ts) keep their import
// path. The relative specifier matters: this module is loaded by
// `npm run test:unit` under node --experimental-strip-types, where `@/` does
// not resolve.
export { compareByName, sortByName } from './compare.ts'
import { sortByName } from './compare.ts'
import type { NamedItem } from './compare.ts'

interface Slugged {
  slug: string
}

export interface BrandSection<TMeta, TItem> {
  type: TMeta
  items: TItem[]
}

/**
 * One section per gear type the brand actually stocks, in `types` order, each
 * sorted A→Z by name.
 *
 * Membership is decided on `brand_name` — the gear item's computed field, which
 * resolves through the Brand relationship, so it always equals the Brand row's
 * own `name` and can't drift from what the directory counted.
 */
export function buildBrandSections<TMeta extends Slugged, TItem extends NamedItem>(
  types: readonly TMeta[],
  gearBySlug: Partial<Record<string, TItem[]>>,
  brandName: string,
): BrandSection<TMeta, TItem>[] {
  return types
    .map(type => ({
      type,
      items: sortByName((gearBySlug[type.slug] ?? []).filter(
        item => String(item.brand_name) === brandName,
      )),
    }))
    .filter(section => section.items.length > 0)
}
