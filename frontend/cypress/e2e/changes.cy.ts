// The public change log's pages — Recent Changes, a person's contributions,
// and the feeds (LIVE_EDITING_PHASE_3.md § 5.6, D3, D17, D57).
//
// Real API in store mode. The records are made here, on items created here.

const AUTH = { Authorization: 'Bearer dev-admin-token' }
const api = () => Cypress.env('apiUrl') as string

describe('Recent changes', () => {
  let id: number

  before(() => {
    cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
    cy.request({
      method: 'POST',
      url: `${api()}/edit/grips`,
      headers: AUTH,
      body: { fields: { name: `Logged Grip ${Date.now()}`, brand: 'Gibbon', material: 'Aluminum', width_min: 25 } },
    })
      .then(response => {
        id = Number(response.body.key)
        return cy.request({ url: `${api()}/edit/grips/${id}`, headers: AUTH })
      })
      .then(({ body }) =>
        cy.request({
          method: 'PATCH',
          url: `${api()}/edit/grips/${id}`,
          headers: AUTH,
          body: { rev: body.rev, changes: { mbs: 33 }, why: 'from the changes spec' },
        }),
      )
  })

  it('is public, newest first, and linked from every page', () => {
    cy.visit('/grips')
    cy.getByData('footer-changes-link').click()
    cy.location('pathname').should('eq', '/changes')
    cy.getByData('change-row').first().should('have.attr', 'data-action', 'item.edit').and('contain', 'from the changes spec')
  })

  it('filters to breaking-strength changes', () => {
    cy.visit('/changes')
    cy.getByData('changes-safety').check()
    // Retried as a whole: the list is replaced when the filtered page arrives.
    cy.getByData('change-row').should($rows => {
      expect($rows.length).to.be.greaterThan(0)
      $rows.each((_, row) => expect(row.querySelector('[data-cy="change-safety"]'), row.textContent ?? '').to.exist)
    })
  })

  it('filters by kind', () => {
    cy.visit('/changes')
    cy.getByData('changes-kind').select('create')
    cy.getByData('change-row').should($rows => {
      expect($rows.length).to.be.greaterThan(0)
      $rows.each((_, row) => expect(row.getAttribute('data-action')).to.equal('item.create'))
    })
  })

  it('links each change to the person who made it', () => {
    cy.visit('/changes')
    cy.getByData('change-actor').first().click()
    cy.location('pathname').should('match', /^\/people\//)
    cy.getByData('contributions-name').should('contain', 'Local Admin')
    cy.getByData('change-row').should('have.length.greaterThan', 0)
  })

  it('offers both feeds, and they are Atom', () => {
    cy.visit('/changes')
    cy.getByData('feed-all').should('have.attr', 'href').and('match', /\/changes\/feed\.atom$/)
    cy.getByData('feed-safety')
      .invoke('attr', 'href')
      .then(href => cy.request(String(href)))
      .then(response => {
        expect(response.headers['content-type']).to.match(/application\/atom\+xml/)
        expect(response.body).to.contain('from the changes spec')
      })
  })
})

export {}
