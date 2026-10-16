// ISA certificates and warnings, for admins — live editing phase 7
// (LIVE_EDITING_PHASE_7.md).
//
// End to end against the real API in store mode: an admin records a warning
// the ISA has not listed yet, matches it to a product picked from the
// catalogue, sees it on the product page, finds it again from there, and
// retires it — each step a safety record in the public log. Every run makes
// its own product and its own warning, so the ISA's real entries, which other
// specs read, never move.

export {}

const ADMIN_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

const run = Date.now()
const GRIP = `Isa Grip ${run}`
const MODEL = `Model ${run}`
let gripId: number

function asAdmin() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, ADMIN_TOKEN)
    },
  }
}

function ourEntry() {
  return cy.contains('[data-cy="isa-entry"]', MODEL)
}

describe('ISA certificates and warnings', () => {
  before(() => {
    cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
    cy.request({
      method: 'POST',
      url: `${api()}/edit/grips`,
      headers: AUTH,
      body: { fields: { name: GRIP, brand: 'Gibbon', material: 'Aluminum', width_min: 25 } },
    }).then(({ body }) => {
      gripId = Number(body.key)
    })
  })

  it('lists each kind, unmatched first, from /admin', () => {
    cy.visit('/admin', asAdmin())
    cy.getByData('admin-isa-link').click()
    cy.getByData('isa-admin-page').should('be.visible')
    cy.getByData('isa-entry').first().should('have.attr', 'data-matched', 'false')
    cy.getByData('isa-tab').filter('[data-kind="warnings"]').click()
    cy.location('search').should('contain', 'kind=warnings')
    cy.getByData('isa-entry').should('have.length.greaterThan', 10)
  })

  it('records a warning, matches it to a product, and the product shows it', () => {
    cy.visit('/admin/isa?kind=warnings', asAdmin())
    cy.getByData('isa-add').click()
    cy.getByData('edit-field-status').select('Warning')
    cy.getByData('edit-field-manufacturer').type('Gibbon')
    cy.getByData('edit-field-model').type(MODEL)
    cy.getByData('edit-field-description').type('Test: the pin can work loose.')
    cy.getByData('edit-save').click()
    cy.getByData('entry-editor').should('not.exist')

    ourEntry().within(() => {
      cy.getByData('isa-unmatched').should('exist')
      cy.getByData('isa-match-edit').click()
    })
    cy.getByData('isa-match-dialog').within(() => {
      cy.getByData('isa-target-type').select('grips')
      cy.getByData('isa-target-search').type(String(run))
      cy.contains('[data-cy="isa-target-result"]', GRIP).click()
      cy.getByData('isa-target-chosen').should('contain', GRIP)
      cy.getByData('dialog-why').type('Matched by hand')
      cy.getByData('dialog-confirm').click()
    })
    cy.getByData('isa-match-dialog').should('not.exist')
    ourEntry().find('[data-cy="isa-match"]').should('contain', GRIP)

    cy.visit(`/grips/${gripId}`)
    cy.getByData('isa-warning-description').should('contain', 'the pin can work loose')
  })

  it('is found from the product, and its history is safety records', () => {
    cy.visit(`/grips/${gripId}`, asAdmin())
    cy.getByData('item-isa').click()
    cy.getByData('isa-gear-filter').should('contain', `grips #${gripId}`)
    cy.getByData('isa-entry').should('have.length', 1)
    ourEntry().within(() => {
      cy.getByData('isa-history').click()
      cy.getByData('change-row').should('have.length', 2)
      cy.getByData('change-safety').should('contain', 'ISA')
    })
  })

  it('retires it with a reason, and the product no longer shows it', () => {
    cy.visit('/admin/isa?kind=warnings', asAdmin())
    ourEntry().find('[data-cy="isa-retire"]').click()
    cy.getByData('isa-retire-dialog').within(() => {
      cy.getByData('dialog-confirm').should('be.disabled')
      cy.getByData('dialog-why').type('Recorded for a test')
      cy.getByData('dialog-confirm').click()
    })
    ourEntry().should('not.exist')
    cy.visit(`/grips/${gripId}`)
    cy.getByData('item-history').should('be.visible')
    cy.getByData('isa-warning-description').should('not.exist')
  })
})
