// Grouping a brand's inventory into per-gear-type sections for the detail page.
//
// Split out of BrandDetailPage because the part worth testing here is pure and
// invisible in a screenshot: which items land in which section, and in what
// order. The alphabetical rule matters — the raw API order is id order, which
// reads as random when scanning a brand's catalogue for one product. See
// DESIGN.md § Manufacturers Page → Detail page gear sections.
//
// Deliberately dependency-free (only erased `import type`s), so `npm run
// test:unit` can load it under node --experimental-strip-types without the `@/`
// alias or a bundler. The collapse behaviour it feeds is DOM state and lives in
// cypress/e2e/manufacturers.cy.ts.

// Structurally the minimum this module needs; the real callers pass
// GearTypeMeta and AnyItem/GearItem.
interface NamedItem {
  name?: unknown
  brand_name?: unknown
}

interface Slugged {
  slug: string
}

export interface BrandSection<TMeta, TItem> {
  type: TMeta
  items: TItem[]
}

// Alphabetical by name, ascending — the same comparison the listing's default
// sort uses (utils/sort.ts), so a brand's gear reads identically in both places.
export function compareByName(a: NamedItem, b: NamedItem): number {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort(compareByName)
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
