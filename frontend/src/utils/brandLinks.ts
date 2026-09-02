// Manufacturer name → brand-page href. See DESIGN.md § Manufacturer names are
// links.
//
// Why a resolution step at all: the gear `*Public` schemas
// (slack_data/models/*.py) expose `brand_name`, a computed field, and NOT the
// `brand_id` FK — so a card holds the brand's name and nothing else. The id
// comes from `/brand`, matched by name. That makes the link fallible in two
// ordinary ways (index not fetched yet; a name with no brand row), and both
// must degrade to the plain text that was there before rather than to a link
// that 404s.

export interface BrandRef {
  id: number | string
  name?: unknown
}

export type BrandIndex = Map<string, number>

/** name → Brand.id. Nameless rows are dropped; they could only mis-resolve. */
export function buildBrandIndex(brands: BrandRef[]): BrandIndex {
  const index: BrandIndex = new Map()
  for (const brand of brands) {
    const name = String(brand.name ?? '').trim()
    if (!name) continue
    index.set(name, Number(brand.id))
  }
  return index
}

/**
 * The href for a manufacturer's page, or null when the name must stay plain
 * text: unknown/unresolved brand, or `currentBrandId` says we are already on
 * that brand's page (a link back to the page being read is noise).
 */
export function brandHref(
  index: BrandIndex,
  name: unknown,
  currentBrandId?: number | string | null,
): string | null {
  const key = String(name ?? '').trim()
  if (!key) return null
  const id = index.get(key)
  if (id === undefined) return null
  if (currentBrandId != null && String(currentBrandId) === String(id)) return null
  return `/manufacturers/${id}`
}
