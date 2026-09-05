// "Also sold by" — the shops other than the manufacturer that carry this item.
//
// Most of the Slack Inov range is co-listed with Spider Slacklines: one
// product, two shops, two product pages. The catalogue records that as a list
// of brand NAMES on the gear row itself (`gear_sellers`, CLAUDE.md §
// Co-listings), and this is the only place a reader sees it.
//
// Two rules, both about not overstating what we know:
//
//  1. **The maker is not in this list.** The block above already names them and
//     links to their product page; repeating them here would read as though the
//     manufacturer were one reseller among several. The seed pass refuses a
//     maker listed among its own sellers, so this is a statement about the data
//     rather than a filter applied here.
//  2. **A name is the whole claim.** We hold no per-shop price, product page or
//     stock status — a co-listing was recorded from the two companies' own
//     statement that they carry each other's range, not from a per-product
//     scrape — so this says "Spider Slacklines also sells this" and stops
//     there. Each name links to that brand's page, which is where their site
//     is. Inventing a price or a link here would be a claim about a real shop
//     that nobody checked.
//
// **Where it sits:** in the detail page's right column, directly under the
// price and above the ISA certification block — here is what this costs, and
// here is who else sells it. It stays *below* the ISA warning banner: the
// banner is pinned next to the product name on purpose, and a list of shops
// must never push a recall further from the name of the thing recalled.

import BrandLink from '@/components/brand/BrandLink'

export default function AlsoSoldBy({ sellers }: { sellers: string[] | null | undefined }) {
  // Nothing to say rather than an empty heading — most of the catalogue has no
  // co-listing at all, and a bare "Also sold by" with no rows under it reads as
  // a loading failure.
  if (!sellers || sellers.length === 0) return null

  return (
    <section data-cy="also-sold-by" className="mt-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Also sold by
      </h2>
      <ul className="text-gray-700">
        {sellers.map(name => (
          <li
            key={name}
            data-cy="seller-listing"
            data-brand={name}
            className="border-b border-gray-100 py-2.5 text-sm font-medium text-gray-900 last:border-b-0"
          >
            <span data-cy="seller-name">
              <BrandLink name={name} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
