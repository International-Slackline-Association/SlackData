// Co-listings: the brands that sell a product they did not make.
//
// `brand_name` on a gear row says who MAKES the thing. It is not the whole
// answer to "show me Spider's webbings": Spider Slacklines and Slack Inov
// co-list most of each other's range, each on their own site, and a shopper
// picking a brand wants what they can buy from that brand — not what came off
// its own loom. So an item's brands are its maker plus every name in its
// `gear_sellers` list.
//
// The list rides on the item itself (a `gear_sellers` column on every gear
// model — see CLAUDE.md § Co-listings), so there is nothing to fetch, index or
// keep in step here: one function over one field.
//
// The maker leads the list. It is the statement the card makes and the one the
// specs belong to; a reseller is an addition to it, never a replacement.

/** Every brand that makes or sells this item — maker first, then its sellers. */
export function brandsFor(item: { brand_name?: unknown; gear_sellers?: unknown }): string[] {
  const maker = String(item.brand_name ?? '').trim()
  const brands = maker ? [maker] : []
  // Defensive about the shape rather than the source: this runs over whatever
  // the API returned, and a name that is blank or repeated could only render as
  // a duplicate or an empty pill.
  const sellers = Array.isArray(item.gear_sellers) ? item.gear_sellers : []
  for (const seller of sellers) {
    const name = String(seller ?? '').trim()
    if (name && !brands.includes(name)) brands.push(name)
  }
  return brands
}
