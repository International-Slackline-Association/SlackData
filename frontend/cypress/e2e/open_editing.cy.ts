// Editing for every ISA account — live editing phase 6 (LIVE_EDITING_PHASE_6.md).
//
// End to end against the real API in store mode, as ordinary accounts (the
// dev `dev-person-token:<name>`, which the API refuses hosted):
//
// - an anonymous visitor's Edit signs them in and opens the editor (P6-E);
// - an ordinary account edits, labelled "editor", with no Revert or Merge;
// - at the rate cap the save is refused with when to try again, and the form
//   keeps what was typed (P6-F);
// - an admin blocks an account from its contributions page; the account is
//   told why and loses its edit buttons (P6-D).
//
// Every run makes its own product and its own people, so nothing another spec
// reads moves.

export {}

const ADMIN_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

const run = Date.now()
const EDITOR = `dev-person-token:Editor${run}`
const CAPPED = `dev-person-token:Capped${run}`
const VANDAL = `dev-person-token:Vandal${run}`

let itemId: number

function told(token: string, name: string) {
  // The first-sign-in notice: acknowledged, as the API requires before a save (P6-B).
  return cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: { Authorization: `Bearer ${token}` }, body: { name } })
}

function as(token: string) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, token)
    },
  }
}

describe('Open editing', () => {
  before(() => {
    told(ADMIN_TOKEN, 'Local Admin')
    told(EDITOR, 'Ed Itor')
    told(CAPPED, 'Cap Ped')
    told(VANDAL, 'Van Dal')
    cy.request({ method: 'POST', url: `${api()}/edit/grips`, headers: AUTH, body: { fields: { name: `Open Grip ${run}`, brand: 'Gibbon', material: 'Aluminum', width_min: 25 } } }).then(
      ({ body }) => {
        itemId = Number(body.key)
      },
    )
  })

  it('an anonymous Edit signs in and opens the editor', () => {
    cy.visit(`/grips/${itemId}`, {
      onBeforeLoad(win) {
        cy.stub(win, 'prompt').returns(EDITOR)
      },
    })
    cy.getByData('item-edit').should('not.exist')
    cy.getByData('item-edit-sign-in').click()
    cy.getByData('entry-editor').should('be.visible')
    cy.location('search').should('not.contain', 'edit=1')
  })

  it('an ordinary account edits, labelled editor, without revert or merge', () => {
    cy.visit(`/grips/${itemId}`, as(EDITOR))
    cy.getByData('item-merge').should('not.exist')
    cy.getByData('item-edit').click()
    cy.getByData('edit-field-notes').type('Checked against the box')
    cy.getByData('edit-save').click()
    cy.getByData('entry-editor').should('not.exist')
    cy.getByData('change-row').first().should('contain', 'editor').and('contain', 'Ed Itor')
    cy.getByData('change-revert').should('not.exist')
  })

  it('at the cap, the save is refused with when to try again, and the form keeps its text', () => {
    // Twenty saves in the hour, through the API — then the twenty-first, on the page.
    for (let n = 0; n < 20; n++) {
      cy.request({ url: `${api()}/edit/grips/${itemId}`, headers: { Authorization: `Bearer ${CAPPED}` } }).then(({ body }) =>
        cy.request({
          method: 'PATCH',
          url: `${api()}/edit/grips/${itemId}`,
          headers: { Authorization: `Bearer ${CAPPED}` },
          body: { rev: body.rev, changes: { notes: `save ${n}` } },
        }),
      )
    }
    cy.visit(`/grips/${itemId}`, as(CAPPED))
    cy.getByData('item-edit').click()
    cy.getByData('edit-field-notes').clear().type('one too many')
    cy.getByData('edit-save').click()
    cy.getByData('edit-error').should('contain', 'saved 20 changes in the last hour').and('contain', 'save again at')
    cy.getByData('edit-field-notes').should('have.value', 'one too many')
  })

  it('an admin blocks an account from its page; it is told why and cannot edit', () => {
    cy.request({ url: `${api()}/me`, headers: { Authorization: `Bearer ${VANDAL}` } }).then(({ body }) => {
      const isaId = body.isa_id as string
      cy.visit(`/people/${isaId}`, as(ADMIN_TOKEN))
      cy.getByData('person-block').click()
      cy.getByData('block-why').type('Overwrote twenty specs with nonsense')
      cy.getByData('block-confirm').click()
      cy.getByData('person-blocked').should('contain', 'Overwrote twenty specs')

      cy.visit('/admin', as(ADMIN_TOKEN))
      cy.contains('[data-cy="blocked-person"]', isaId).should('contain', 'Overwrote twenty specs')

      cy.visit(`/grips/${itemId}`, as(VANDAL))
      cy.getByData('blocked-notice').should('contain', 'Overwrote twenty specs')
      cy.getByData('item-history').should('be.visible')
      cy.getByData('item-edit').should('not.exist')

      // Lift it again, from the same page.
      cy.visit(`/people/${isaId}`, as(ADMIN_TOKEN))
      cy.getByData('block-why').type('Apologised')
      cy.getByData('block-confirm').click()
      cy.getByData('person-block').should('be.visible')
    })
  })
})
