import { GEAR_TYPES } from '../support/gear_types'

describe('Top navigation', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('shows the SlackData wordmark', () => {
    cy.get('[data-cy="wordmark"]').should('be.visible').and('contain.text', 'SlackData')
  })

  it('shows all 8 gear-type tabs', () => {
    cy.get('[data-cy="nav-tab"]').should('have.length', 8)
  })

  it('shows every expected gear-type label in the nav', () => {
    GEAR_TYPES.forEach(({ label }) => {
      cy.get('[data-cy="nav-tab"]').contains(label).should('be.visible')
    })
  })

  it('shows a Manufacturers link', () => {
    cy.get('[data-cy="manufacturers-link"]').should('be.visible').and('contain.text', 'Manufacturers')
  })

  it('redirects the root URL to /webbings', () => {
    cy.url().should('include', '/webbings')
  })

  it('navigates to the correct URL when each gear-type tab is clicked', () => {
    GEAR_TYPES.forEach(({ slug, label }) => {
      cy.get('[data-cy="nav-tab"]').contains(label).click()
      cy.url().should('include', `/${slug}`)
    })
  })

  it('marks the active tab with data-active="true"', () => {
    cy.visit('/rollers')
    cy.get('[data-cy="nav-tab"][data-type="rollers"]').should('have.attr', 'data-active', 'true')
  })

  it('does not mark inactive tabs as active', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="nav-tab"][data-type="weblocks"]').should('not.have.attr', 'data-active', 'true')
  })

  it('navigates to /manufacturers when the Manufacturers link is clicked', () => {
    cy.get('[data-cy="manufacturers-link"]').click()
    cy.url().should('include', '/manufacturers')
  })

  it('reflects the correct active tab when the URL is loaded directly', () => {
    GEAR_TYPES.forEach(({ slug }) => {
      cy.visit(`/${slug}`)
      cy.get(`[data-cy="nav-tab"][data-type="${slug}"]`).should('have.attr', 'data-active', 'true')
      GEAR_TYPES.filter(t => t.slug !== slug).forEach(other => {
        cy.get(`[data-cy="nav-tab"][data-type="${other.slug}"]`)
          .should('not.have.attr', 'data-active', 'true')
      })
    })
  })

  it('stays on the same page after clicking the already-active tab', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="nav-tab"][data-type="webbings"]').click()
    cy.url().should('include', '/webbings')
  })

  it('shows the nav on every gear listing page', () => {
    GEAR_TYPES.forEach(({ slug }) => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="top-nav"]').should('be.visible')
      cy.get('[data-cy="wordmark"]').should('be.visible')
    })
  })

  it('shows the nav on the manufacturers page', () => {
    cy.visit('/manufacturers')
    cy.get('[data-cy="top-nav"]').should('be.visible')
    cy.get('[data-cy="wordmark"]').should('be.visible')
  })
})
