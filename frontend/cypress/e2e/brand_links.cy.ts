// Every printed manufacturer name links to that manufacturer's page.
// DESIGN.md § Manufacturer names are links.
//
// data-cy contract:
//   brand-link — the <a> around a manufacturer's name, carrying data-brand-id.
//                It sits INSIDE the existing hook (gear-card-brand,
//                detail-brand, compare-col-brand), so anything that reads the
//                brand *text* is unaffected by it becoming a link.
//
// The link is a name→id resolution against /brand (gear rows carry brand_name,
// not brand_id), so every assertion here computes the expected id from the API
// rather than hard-coding one.

const api = () => Cypress.env('apiUrl')

/** name → Brand.id, from the live API. */
function brandIds(): Cypress.Chainable<Map<string, number>> {
  return cy.fetchAllItems('brand').then((rows) => {
    const map = new Map<string, number>()
    for (const b of rows as Record<string, unknown>[]) {
      map.set(String(b.name), Number(b.id))
    }
    return map
  })
}

describe('Manufacturer name links — gear cards', () => {
  let ids: Map<string, number>

  before(() => {
    brandIds().then((m) => { ids = m })
  })

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('the brand line on a card is a link to that brand\'s page', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="gear-card-brand"]')
      .find('[data-cy="brand-link"]')
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        const id = ids.get(text.trim())
        expect(id, `brand id for "${text.trim()}"`).to.be.a('number')
        cy.get('[data-cy="gear-card"]').first()
          .find('[data-cy="brand-link"]')
          .should('have.attr', 'href', `/manufacturers/${id}`)
      })
  })

  it('every card in the grid carries one', () => {
    cy.get('[data-cy="gear-card"]').then(($cards) => {
      cy.get('[data-cy="gear-card"] [data-cy="brand-link"]')
        .should('have.length', $cards.length)
    })
  })

  // The card has a full-card stretched overlay link to the product; the brand
  // link must sit above it, or it is unclickable.
  it('clicking it navigates to the manufacturer page, not the gear page', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="brand-link"]')
      .invoke('attr', 'data-brand-id')
      .then((id) => {
        cy.get('[data-cy="gear-card"]').first()
          .find('[data-cy="brand-link"]').click()
        cy.url().should('include', `/manufacturers/${id}`)
        cy.get('[data-cy="brand-detail-page"]').should('exist')
      })
  })
})

describe('Manufacturer name links — gear detail page', () => {
  let item: Record<string, unknown>
  let ids: Map<string, number>

  before(() => {
    brandIds().then((m) => { ids = m })
    cy.request(`${api()}/webbing/?limit=1`).then(({ body }) => { item = body[0] })
  })

  it('the detail header brand is a link to that brand\'s page', () => {
    cy.visit(`/webbings/${item.id}`)
    cy.get('[data-cy="detail-brand"]')
      .find('[data-cy="brand-link"]')
      .should('contain.text', item.brand_name as string)
      .and('have.attr', 'href', `/manufacturers/${ids.get(String(item.brand_name))}`)
  })

  it('the Detailed view panels carry it too', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').first()
      .find('[data-cy="detail-brand"] [data-cy="brand-link"]')
      .should('be.visible')
      .and('have.attr', 'href')
      .and('match', /^\/manufacturers\/\d+$/)
  })
})

describe('Manufacturer name links — compare table', () => {
  let ids: Map<string, number>
  let items: Record<string, unknown>[]

  before(() => {
    brandIds().then((m) => { ids = m })
    cy.request(`${api()}/webbing/?limit=2`).then(({ body }) => { items = body })
  })

  it('each column header brand is a link to that brand\'s page', () => {
    cy.visit(`/webbings/compare?ids=${items[0].id},${items[1].id}`)
    cy.get('[data-cy="compare-col"]').should('have.length', 2)
    items.forEach((item) => {
      cy.get(`[data-cy="compare-col"][data-id="${item.id}"]`)
        .find('[data-cy="compare-col-brand"] [data-cy="brand-link"]')
        .should('contain.text', item.brand_name as string)
        .and('have.attr', 'href', `/manufacturers/${ids.get(String(item.brand_name))}`)
    })
  })
})

describe('Manufacturer name links — the brand\'s own page', () => {
  // DESIGN.md case 1: on /manufacturers/:id every card names the brand whose
  // page you are already reading, so the name stays plain text there.
  it('does not link a brand back to the page being read', () => {
    cy.fetchAllItems('brand').then((rows) => {
      cy.fetchAllItems('webbing').then((webbings) => {
        const first = (webbings as Record<string, unknown>[])[0]
        const brand = (rows as Record<string, unknown>[])
          .find(b => b.name === first.brand_name)!
        cy.visit(`/manufacturers/${brand.id}`)
        cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
        cy.get('[data-cy="gear-card-brand"]').first()
          .should('contain.text', brand.name as string)
        cy.get('[data-cy="gear-card"] [data-cy="brand-link"]').should('not.exist')
      })
    })
  })
})
