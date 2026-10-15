// Manufacturer accounts — live editing phase 5 (LIVE_EDITING_PHASE_5.md).
//
// End to end against the real API in store mode: a person asks to represent a
// brand, an admin approves, and the person then edits that brand's gear —
// and only that brand's — and manages its API keys. Every run makes its own
// brand and its own person, so nothing another spec reads moves.

export {}

const ADMIN_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

const run = Date.now()
const BRAND = `Maker ${run}`
const PERSON = `dev-person-token:Maker${run}`

function as(token: string) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, token)
    },
  }
}

let catalogId: number
let ownItem: number

describe('Manufacturer accounts', () => {
  before(() => {
    // The first-sign-in notice would cover the page (account.cy.ts).
    for (const token of [ADMIN_TOKEN, PERSON]) {
      cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: { Authorization: `Bearer ${token}` }, body: { name: token === ADMIN_TOKEN ? 'Local Admin' : 'Maker Person' } })
    }
    cy.request({ method: 'POST', url: `${api()}/edit/brand`, headers: AUTH, body: { name: BRAND, fields: { country: 'DE' } } }).then(
      ({ body }) => {
        catalogId = body.entry.catalog_id
      },
    )
    // A brand has a page once it has a product.
    cy.request({
      method: 'POST',
      url: `${api()}/edit/grips`,
      headers: AUTH,
      body: { fields: { name: `Own Grip ${run}`, brand: BRAND, material: 'Aluminum', width_min: 25 } },
    }).then(({ body }) => {
      ownItem = Number(body.key)
    })
  })

  it('asks to represent a brand; an admin approves', () => {
    cy.visit(`/manufacturers/${catalogId}`, as(PERSON))
    cy.getByData('edit-brand').should('not.exist')
    cy.getByData('represent-brand').click()
    cy.getByData('represent-note').type('Head of product')
    cy.getByData('dialog-confirm').click()
    cy.getByData('represent-pending').should('contain', BRAND)

    cy.visit('/admin', as(ADMIN_TOKEN))
    cy.contains('[data-cy="brand-request"]', BRAND).within(() => {
      cy.contains('Head of product')
      cy.getByData('brand-request-note').type('Confirmed by phone')
      cy.getByData('brand-request-approve').click()
    })
    cy.contains('[data-cy="brand-request"]', BRAND).should('not.exist')
  })

  it("edits their own brand's product, labelled as its manufacturer", () => {
    cy.visit(`/grips/${ownItem}`, as(PERSON))
    cy.getByData('item-merge').should('not.exist')
    cy.getByData('item-edit').click()
    cy.getByData('entry-editor').should('be.visible')
    cy.getByData('edit-field-brand').should('not.exist')
    cy.getByData('edit-field-notes').type('From the maker')
    cy.getByData('edit-save').click()
    cy.getByData('entry-editor').should('not.exist')
    cy.getByData('change-row').first().should('contain', `manufacturer for ${BRAND}`)
  })

  it("sees no editing on another brand's product", () => {
    cy.request(`${api()}/grip/?limit=5`).then(({ body }) => {
      const other = (body as { id: number; brand_name: string }[]).find(g => g.brand_name !== BRAND)!
      cy.visit(`/grips/${other.id}`, as(PERSON))
      cy.getByData('item-history').should('be.visible')
      cy.getByData('item-edit').should('not.exist')
    })
  })

  it("manages the brand's API keys", () => {
    cy.visit('/account/brands', as(PERSON))
    cy.contains('[data-cy="account-brand"]', BRAND).within(() => {
      cy.getByData('brand-key-note').type('Our ERP')
      cy.getByData('brand-key-create').click()
      cy.getByData('brand-key').should('have.length', 1).and('have.attr', 'data-active', 'true')
      cy.getByData('brand-key-value').invoke('text').should('match', /^[0-9a-f]+:.+/)
    })
    cy.on('window:confirm', () => true)
    cy.contains('[data-cy="account-brand"]', BRAND).within(() => {
      cy.getByData('brand-key-revoke').click()
      cy.getByData('brand-key').should('have.attr', 'data-active', 'false')
    })
  })
})
