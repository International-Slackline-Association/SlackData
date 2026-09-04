// Brand filter — "show me what Spider and Slack Inov sell".
//
// The group is a pill group like any other, with one thing that is its own:
// its values are the item's MAKER plus every brand co-listing it
// (the `gear_sellers` list on the gear row). The seeded catalogue carries
// those, and co_listings.cy.ts asserts the group finds a seller's items; the
// derivation rules themselves — maker first, deduped, blanks dropped — are
// pinned in tests/unit/sellers.test.ts and tests/unit/brandFilter.test.ts,
// where any shape can be constructed.
//
// See DESIGN.md § Left Filter Sidebar → "Brand is the second group".

import { GEAR_TYPES } from '../support/gear_types'

const GROUP = '[data-cy="filter-group"][data-group="brand"]'

// Every brand that makes OR sells at least one item of this type, from the API
// itself — so the expected pill set is the source of truth, not a hard-coded
// list that rots the next time a product is added. `gear_sellers` is the
// co-listing half: Spider Slacklines sells Slack Inov webbings it did not make,
// and picking Spider has to find them.
function brandsOf(item: Record<string, unknown>): string[] {
  const sellers = Array.isArray(item.gear_sellers) ? (item.gear_sellers as string[]) : []
  return [String(item.brand_name), ...sellers]
}

const sells = (item: Record<string, unknown>, brand: string) => brandsOf(item).includes(brand)

function brandsIn(items: Record<string, unknown>[]): string[] {
  return [...new Set(items.flatMap(brandsOf))].sort((a, b) => a.localeCompare(b))
}

// The brand with the most items of this type — makes or sells, the same
// question the filter asks. Used where a test then narrows FURTHER (brand AND
// material): the alphabetically-first brand has one webbing, so any second
// filter empties the grid and the test would be asserting over the empty state
// instead of over the intersection.
function biggestBrand(items: Record<string, unknown>[]): string {
  const counts = new Map<string, number>()
  for (const i of items) {
    for (const b of brandsOf(i)) counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// How the URL actually encodes a brand: URLSearchParams writes a space as `+`,
// not %20, so encodeURIComponent would not match what the address bar holds.
const asParam = (brand: string) => new URLSearchParams({ brand }).toString()

describe('Brand filter — every gear type', () => {
  GEAR_TYPES.forEach(({ slug, label }) => {
    it(`${label}: has a Brand group, and it is the last one in the sidebar`, () => {
      cy.visit(`/${slug}`)
      cy.get(GROUP).should('exist').and('contain.text', 'Brand')
      // Last of ALL of them — on webbings that means below the stretch widget
      // too, which the sidebar appends after the configured groups.
      cy.get('[data-cy="filter-group"]').last().should('have.attr', 'data-group', 'brand')
      cy.get('[data-cy="filter-group"]').eq(0).should('have.attr', 'data-group', 'price')
    })
  })
})

describe('Brand filter — webbings', () => {
  const SLUG = 'webbings'
  const API = 'webbing'
  let items: Record<string, unknown>[]
  let brands: string[]

  before(() => {
    cy.fetchAllItems(API).then(all => {
      items = all as Record<string, unknown>[]
      brands = brandsIn(items)
    })
  })

  beforeEach(() => {
    cy.visit(`/${SLUG}`)
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })

  it('offers one pill per brand in the data, alphabetically', () => {
    // The group folds past 12, so read the full set with the fold open.
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP)
      .find('[data-cy="filter-pill"]')
      .then($pills => {
        const shown = [...$pills].map(el => el.getAttribute('data-value'))
        expect(shown).to.deep.equal(brands)
      })
  })

  it('picking a brand shows only that brand’s gear', () => {
    cy.get(GROUP).find('[data-cy="pill-search"]').type('spider')
    cy.get(GROUP).find('[data-cy="filter-pill"]').first().invoke('attr', 'data-value').then(brand => {
      cy.get(GROUP).find('[data-cy="filter-pill"]').first().click()
      const matching = items.filter(i => sells(i, String(brand)))
      cy.get('[data-cy="gear-card"]').should('have.length', matching.length)
      // The card names the MAKER, not the brand picked — a co-listed item is
      // Spider's to sell and Slack Inov's to have made, and the specs are the
      // maker's. So the assertion is that every card is one of the items this
      // brand makes or sells, not that every card says this brand.
      const makers = new Set(matching.map(i => String(i.brand_name)))
      cy.get('[data-cy="gear-card-brand"]').each($el => {
        expect([...makers]).to.include($el.text().trim())
      })
      cy.get('[data-cy="item-count"]').should('contain.text', String(matching.length))
    })
  })

  it('two brands OR together', () => {
    const [a, b] = [brands[0], brands[1]]
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${a}"]`).click()
    cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${b}"]`).click()
    const expected = items.filter(i => sells(i, a) || sells(i, b)).length
    cy.get('[data-cy="gear-card"]').should('have.length', expected)
  })

  it('writes the selection to the URL, and a deep link restores it', () => {
    const brand = brands[0]
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${brand}"]`).click()
    cy.location('search').should('include', asParam(brand))

    cy.visit(`/${SLUG}?${asParam(brand)}`)
    cy.get(GROUP)
      .find(`[data-cy="filter-pill"][data-value="${brand}"]`)
      .should('have.attr', 'data-active', 'true')
    const expected = items.filter(i => sells(i, brand)).length
    cy.get('[data-cy="gear-card"]').should('have.length', expected)
  })

  it('ANDs with another group', () => {
    const brand = biggestBrand(items)
    const own = items.filter(i => sells(i, brand)).length
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${brand}"]`).click()
    // Wait for the brand filter to land before adding the second one — clicking
    // into a grid that is still the full catalogue would test nothing.
    cy.get('[data-cy="gear-card"]').should('have.length', own)

    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').first().click()
    cy.get('[data-cy="gear-card"]').should('have.length.at.most', own)
    // Makers of what this brand makes or sells — see the note above: a
    // co-listed card carries the maker's name, not the picked brand's.
    const makers = new Set(items.filter(i => sells(i, brand)).map(i => String(i.brand_name)))
    cy.get('[data-cy="gear-card-brand"]').each($el => {
      expect([...makers]).to.include($el.text().trim())
    })
  })

  it('clear all drops the brand filter', () => {
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find('[data-cy="filter-pill"]').first().click()
    cy.get('[data-cy="filter-sidebar"] [data-cy="clear-filters"]').click()
    cy.location('search').should('not.include', 'brand=')
    cy.get('[data-cy="gear-card"]').should('have.length', items.length)
  })

  // ── The fold ───────────────────────────────────────────────────────────────

  it('folds a long brand list, and expands on demand', () => {
    cy.get(GROUP).find('[data-cy="filter-pill"]').should('have.length', 12)
    cy.get(GROUP).find('[data-cy="pill-more"]').should('contain.text', String(brands.length))
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find('[data-cy="filter-pill"]').should('have.length', brands.length)
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find('[data-cy="filter-pill"]').should('have.length', 12)
  })

  it('searches the brand list', () => {
    cy.get(GROUP).find('[data-cy="pill-search"]').type('spider')
    cy.get(GROUP).find('[data-cy="filter-pill"]').each($el => {
      expect($el.attr('data-value')?.toLowerCase()).to.contain('spider')
    })
    cy.get(GROUP).find('[data-cy="filter-pill"]').should('have.length.greaterThan', 0)
  })

  it('keeps a selected brand visible when the search no longer matches it', () => {
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find('[data-cy="filter-pill"]').last().invoke('attr', 'data-value').then(brand => {
      cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${brand}"]`).click()
      cy.get(GROUP).find('[data-cy="pill-search"]').type('zzzzz')
      cy.get(GROUP)
        .find(`[data-cy="filter-pill"][data-value="${brand}"]`)
        .should('be.visible')
        .and('have.attr', 'data-active', 'true')
    })
  })

  // ── The facet ──────────────────────────────────────────────────────────────

  it('the brand list follows the other filters', () => {
    // Narrow by material, then check the brand pills are exactly the brands
    // that still have a webbing in the grid — not the whole 45.
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').first().invoke('attr', 'data-value').then(material => {
        const matching = items.filter(i => String(i.material).includes(String(material)))
        const expected = brandsIn(matching)
        cy.get('[data-cy="filter-group"][data-group="material"]')
          .find('[data-cy="filter-pill"]').first().click()
        // Wait for the narrowing to land in the grid first: the fold below is
        // decided from the brand list as it stands, and reading it while the
        // page still holds the whole catalogue asks the wrong question.
        cy.get('[data-cy="gear-card"]').should('have.length', matching.length)
        // The fold only exists past 12 brands, and narrowing can take the list
        // under that — so open it if it is there, and don't demand it. `.find()`
        // on the command itself would retry for five seconds and fail instead.
        //
        // The click has to re-query, too: a `cy.wrap`ped element is frozen, so
        // the click under it keeps aiming at a snapshot. When the sidebar
        // re-rendered between the read and the click, that button was in a tree
        // no longer in the page and Cypress failed with "they disappeared from
        // the page" rather than retrying. Reading existence off the live body
        // and clicking through a fresh `cy.get` keeps the chain retryable.
        cy.get('body').then($body => {
          if ($body.find(`${GROUP} [data-cy="pill-more"]`).length) {
            cy.get(GROUP).find('[data-cy="pill-more"]').click()
          }
        })
        // `should`, not `then`: the brand list is derived from the narrowed
        // grid, so a one-shot read can catch it a render before it settles.
        cy.get(GROUP).find('[data-cy="filter-pill"]').should($pills => {
          expect([...$pills].map(el => el.getAttribute('data-value'))).to.deep.equal(expected)
        })
      })
  })

  it('does not narrow itself — picking one brand leaves the others pickable', () => {
    const brand = biggestBrand(items)
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find('[data-cy="filter-pill"]').its('length').then(before => {
      cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${brand}"]`).click()
      cy.get('[data-cy="gear-card"]').should('have.length', items.filter(i => sells(i, brand)).length)
      cy.get(GROUP).find('[data-cy="filter-pill"]').should('have.length', before)
    })
  })

  it('keeps a selected brand pickable after another filter narrows it away', () => {
    // Search for a term that cannot match the selected brand's gear: the brand
    // drops out of the facet, but its pill must survive so it can be undone.
    const brand = biggestBrand(items)
    cy.get(GROUP).find('[data-cy="pill-more"]').click()
    cy.get(GROUP).find(`[data-cy="filter-pill"][data-value="${brand}"]`).click()
    cy.get('[data-cy="search-input"]').type('zzzzzzzz')
    cy.get('[data-cy="empty-state"]').should('exist')
    cy.get(GROUP)
      .find(`[data-cy="filter-pill"][data-value="${brand}"]`)
      .should('have.attr', 'data-active', 'true')
      .click()
    cy.location('search').should('not.include', 'brand=')
  })

  it('a short pill group gets neither a search box nor a fold', () => {
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="pill-search"]').should('not.exist')
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="pill-more"]').should('not.exist')
  })
})
