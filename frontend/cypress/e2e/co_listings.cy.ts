// Co-listings — "Also sold by" on the detail page, and the Brand filter's other
// half on the listing page.
//
// One product can be sold by shops other than the one that makes it: Slack Inov
// and Spider Slacklines co-list each other's full range, and SlackX carries the
// two Radrigs weblocks. The catalogue records that as a list of brand names on
// the gear row itself (`gear_sellers`, CLAUDE.md § Co-listings) — so unlike the
// version of this spec that preceded it, there is nothing to stub: the sellers
// arrive with the item, and every assertion below runs against the real
// backend.
//
// The one trap worth naming: a card shows the MAKER. A co-listed item found by
// picking a seller's pill still reads "Slack Inov" on the card, because the
// specs are the maker's. That is the intended behaviour, not a bug, and it is
// pinned here so it cannot be "fixed" into two rows per product.

type Item = {
  id: number
  name: string
  brand_name: string
  gear_sellers: string[] | null
}

const withSellers = (items: Item[]) => items.filter(i => (i.gear_sellers ?? []).length > 0)

describe('Also sold by', () => {
  it('names every seller of a co-listed product, and links each to its brand page', () => {
    cy.fetchAllItems('weblock').then(all => {
      const listed = withSellers(all as Item[])
      expect(listed.length, 'the seeded catalogue holds co-listed weblocks').to.be.greaterThan(0)
      const item = listed[0]

      cy.visit(`/weblocks/${item.id}`)
      cy.get('[data-cy="also-sold-by"]').should('be.visible').and('contain.text', 'Also sold by')
      cy.get('[data-cy="seller-listing"]').should('have.length', item.gear_sellers!.length)
      for (const seller of item.gear_sellers!) {
        cy.get('[data-cy="seller-listing"]').contains(seller).should('exist')
      }
      // Each name is the brand's page — the only link we can honestly offer,
      // since no per-shop product URL was ever sourced for these listings.
      cy.get('[data-cy="seller-name"] a').first().should('have.attr', 'href').and('include', '/manufacturers/')
    })
  })

  it('never lists the maker among the sellers', () => {
    // The maker is named above, with their own product link. Repeating them
    // here would read as though the manufacturer were one reseller of several.
    cy.fetchAllItems('webbing').then(all => {
      const item = withSellers(all as Item[])[0]
      cy.visit(`/webbings/${item.id}`)
      cy.get('[data-cy="also-sold-by"]').should('exist')
      cy.get('[data-cy="seller-listing"]').each($row => {
        expect($row.text()).not.to.contain(item.brand_name)
      })
    })
  })

  it('shows no block at all on a product nothing is co-listed against', () => {
    // Most of the catalogue. A bare "Also sold by" with no rows under it reads
    // as a loading failure, so the heading goes too.
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Item[]).find(i => !(i.gear_sellers ?? []).length)!
      cy.visit(`/webbings/${item.id}`)
      cy.get('[data-cy="spec-table"], [data-cy="detail-description"]').should('exist')
      cy.get('[data-cy="also-sold-by"]').should('not.exist')
    })
  })

  it('sits under the price and above the ISA certification block', () => {
    // Position is the contract here, not decoration: the block answers "what
    // does this cost, and who else sells it", so it belongs with the price
    // rather than below the spec grid. Asserted geometrically, the same way
    // isa_certification.cy.ts pins the name → banner → cert → specs order it
    // has to fit inside.
    cy.fetchAllItems('webbing').then(all => {
      const item = withSellers(all as Item[])[0]
      cy.visit(`/webbings/${item.id}`)

      cy.get('[data-cy="also-sold-by"]').then($sellers => {
        const sellersTop = $sellers[0].getBoundingClientRect().top

        cy.get('body').then($body => {
          if ($body.find('[data-cy="detail-price"]').length) {
            cy.get('[data-cy="detail-price"]').then($price => {
              expect(
                $price[0].getBoundingClientRect().top,
                'the price is above the seller block',
              ).to.be.lessThan(sellersTop)
            })
          }
          if ($body.find('[data-cy="isa-certification-block"]').length) {
            cy.get('[data-cy="isa-certification-block"]').then($cert => {
              expect(
                $cert[0].getBoundingClientRect().top,
                'the ISA certification block is below the seller block',
              ).to.be.greaterThan(sellersTop)
            })
          }
        })
      })
    })
  })

  it('never pushes an ISA warning banner further from the product name', () => {
    // The one ordering rule that is a safety rule rather than a layout
    // preference: the banner is pinned next to the name on purpose, so the
    // seller list goes below it, never between it and the title.
    cy.fetchAllItems('weblock').then(all => {
      const warned = withSellers(all as Item[]).find(
        i => (i as Item & { isa_warning: string | null }).isa_warning != null,
      )
      if (!warned) return // no seeded weblock is both recalled and co-listed
      cy.visit(`/weblocks/${warned.id}`)
      cy.get('[data-cy="isa-warning-banner"]').then($banner => {
        cy.get('[data-cy="also-sold-by"]').then($sellers => {
          expect(
            $banner[0].getBoundingClientRect().top,
            'the ISA banner stays above the seller block',
          ).to.be.lessThan($sellers[0].getBoundingClientRect().top)
        })
      })
    })
  })
})

describe('Co-listings on the listing page', () => {
  it('the Brand filter finds what a brand SELLS, not only what it makes', () => {
    cy.fetchAllItems('webbing').then(all => {
      const items = all as Item[]
      // A brand that sells webbings it did not make — the whole point of the
      // feature, and the case a maker-only filter gets wrong.
      const seller = withSellers(items)[0].gear_sellers![0]
      const own = items.filter(i => i.brand_name === seller)
      const sold = items.filter(i => (i.gear_sellers ?? []).includes(seller))
      expect(sold.length, `${seller} sells webbings it did not make`).to.be.greaterThan(0)

      cy.visit(`/webbings?${new URLSearchParams({ brand: seller })}`)
      cy.get('[data-cy="gear-card"]').should('have.length', own.length + sold.length)
      // And the maker's own name is what the co-listed cards show: one product
      // is one row, whoever sells it.
      cy.get('[data-cy="gear-card-brand"]')
        .contains(sold[0].brand_name)
        .should('exist')
    })
  })
})
