// Live editing for admins — LIVE_EDITING_PHASE_3.md § 5.6.
//
// Against the real API in store mode (CATALOG_SOURCE=store, as CI starts it):
// the edits land in the catalogue store and the next page load serves them.
// Every test edits only an item it created itself, so no other spec's numbers
// move; the dev admin token stands in for an ISA sign-in, as in account.cy.ts.

const DEV_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${DEV_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

function signedIn() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, DEV_TOKEN)
    },
  }
}

function signedOut() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.removeItem(TOKEN_KEY)
    },
  }
}

/** A fresh grip, created through the API; yields its id. */
function newGrip(name: string) {
  return cy
    .request({
      method: 'POST',
      url: `${api()}/edit/grips`,
      headers: AUTH,
      body: { fields: { name, brand: 'Gibbon', material: 'Aluminum', width_min: 25 } },
    })
    .then(response => Number(response.body.key))
}

const unique = (label: string) => `${label} ${Date.now()}`

describe('Live editing', () => {
  before(() => {
    // The first-sign-in notice would cover the page (account.cy.ts).
    cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
  })

  it('shows History to everyone, and the editing actions once signed in', () => {
    newGrip(unique('Visible Grip')).then(id => {
      cy.visit(`/grips/${id}`)
      cy.getByData('item-history').should('be.visible')
      cy.getByData('item-edit').should('not.exist')
      cy.getByData('item-edit-sign-in').should('be.visible')

      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('item-edit').should('be.visible')
      cy.getByData('item-hide').should('not.exist')
      cy.getByData('item-merge').should('be.visible')
      // The create is the first entry in its History.
      cy.getByData('change-row').first().should('have.attr', 'data-action', 'item.create')
    })
  })

  it('edits a field, previews it, and serves it on the next load', () => {
    const name = unique('Renamed Grip')
    newGrip(unique('Grip To Edit')).then(id => {
      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('item-edit').click()
      cy.getByData('entry-editor').should('be.visible')
      cy.getByData('edit-save').should('be.disabled')
      cy.getByData('edit-field-name').clear().type(name)
      cy.getByData('edit-preview-row').should('have.length', 1).and('contain', name)
      cy.getByData('edit-why').type('the maker renamed it')
      cy.getByData('edit-save').click()
      cy.getByData('entry-editor').should('not.exist')
      cy.getByData('detail-name').should('contain', name)
      cy.getByData('change-row').first().should('have.attr', 'data-action', 'item.edit').and('contain', 'the maker renamed it')

      // Served to a visitor who is not signed in, too.
      cy.visit(`/grips/${id}`, signedOut())
      cy.getByData('detail-name').should('contain', name)
    })
  })

  it('edits a release date with a date picker, not as Unix milliseconds', () => {
    newGrip(unique('Dated Grip')).then(id => {
      // Stored the way SlackDB stored dates: midnight in UTC+2, 22:00 UTC the day before.
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH }).then(({ body }) =>
        cy.request({
          method: 'PATCH',
          url: `${api()}/edit/grips/${id}`,
          headers: AUTH,
          body: { rev: body.rev, changes: { release_date: 1512079200000 } },
        }),
      )
      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('item-edit').click()
      cy.getByData('edit-field-release_date')
        .should('have.attr', 'type', 'date')
        .and('have.value', '2017-12-01')
      // Untouched, it is no change: the stored 22:00 is not "edited" to midnight.
      cy.getByData('edit-save').should('be.disabled')

      cy.getByData('edit-field-release_date').clear().type('2018-03-15')
      cy.getByData('edit-preview-row').should('have.length', 1).and('contain', '2017-12-01').and('contain', '2018-03-15')
      cy.getByData('edit-save').click()
      cy.getByData('entry-editor').should('not.exist')
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH })
        .its('body.entry.release_date')
        .should('eq', Date.UTC(2018, 2, 15))
      // History reads as dates too.
      cy.getByData('change-row').first().should('contain', '2017-12-01').and('contain', '2018-03-15')
    })
  })

  it('refuses a stale save, shows what moved, and re-applies on the newest version', () => {
    newGrip(unique('Contested Grip')).then(id => {
      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('item-edit').click()
      cy.getByData('edit-field-mbs').type('30')
      // Someone else saves first.
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH }).then(({ body }) =>
        cy.request({ method: 'PATCH', url: `${api()}/edit/grips/${id}`, headers: AUTH, body: { rev: body.rev, changes: { wll: 9 } } }),
      )
      cy.getByData('edit-save').click()
      cy.getByData('edit-conflict').should('be.visible').and('contain', 'Wll')
      cy.getByData('edit-reapply').click()
      cy.getByData('edit-save').click()
      cy.getByData('entry-editor').should('not.exist')
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH }).its('body.entry').should('include', { mbs: 30, wll: 9 })
    })
  })

  it('names the field the API refused', () => {
    newGrip(unique('Grip With A Typo')).then(id => {
      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('item-edit').click()
      cy.getByData('edit-field-mbs').type('forty')
      cy.getByData('edit-field-error-mbs').should('contain', 'a number')
      cy.getByData('edit-save').should('be.disabled')
    })
  })

  it('reverts an edit from the History', () => {
    newGrip(unique('Grip To Revert')).then(id => {
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH }).then(({ body }) =>
        cy.request({ method: 'PATCH', url: `${api()}/edit/grips/${id}`, headers: AUTH, body: { rev: body.rev, changes: { mbs: 99 } } }),
      )
      cy.visit(`/grips/${id}`, signedIn())
      cy.getByData('change-row').first().find('[data-cy="change-safety"]').should('be.visible')
      cy.getByData('change-revert').first().click()
      cy.getByData('revert-dialog').within(() => cy.getByData('dialog-confirm').click())
      cy.getByData('revert-dialog').should('not.exist')
      cy.getByData('change-row').first().should('have.attr', 'data-action', 'item.revert')
      cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH }).its('body.entry').should('not.have.property', 'mbs')
    })
  })

  it('merges a duplicate, and its old link lands on the survivor', () => {
    newGrip(unique('Grip Survivor')).then(survivor => {
      newGrip(unique('Grip Duplicate')).then(duplicate => {
        cy.visit(`/grips/${duplicate}`, signedIn())
        cy.getByData('item-merge').click()
        cy.getByData('merge-into').type(String(survivor))
        cy.getByData('merge-survivor').should('contain', 'Grip Survivor')
        cy.getByData('dialog-why').type('short')
        cy.getByData('dialog-confirm').should('be.disabled')
        cy.getByData('dialog-why').type(' — the same grip, created twice by this test')
        cy.getByData('dialog-confirm').click()
        cy.location('pathname').should('eq', `/grips/${survivor}`)

        cy.visit(`/grips/${duplicate}`, signedOut())
        cy.location('pathname').should('eq', `/grips/${survivor}`)
        cy.getByData('merged-notice').should('contain', `#${duplicate}`)
      })
    })
  })

  it('adds a product from the listing', () => {
    const name = unique('Grip From The Form')
    cy.visit('/grips')
    cy.getByData('add-item').should('not.exist')
    cy.visit('/grips', signedIn())
    cy.getByData('add-item').click()
    cy.getByData('edit-field-name').type(name)
    cy.getByData('edit-field-brand').select('Gibbon')
    cy.getByData('edit-field-material').select('Aluminum')
    cy.getByData('edit-field-width_min').type('25')
    cy.getByData('edit-save').click()
    cy.location('pathname').should('match', /^\/grips\/\d+$/)
    cy.getByData('detail-name').should('contain', name)
  })
})

export {}
