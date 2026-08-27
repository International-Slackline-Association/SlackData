// The /for-manufacturers page — MANUFACTURER_API_PLAN.md § 6, PHASE4_SHIP_PLAN.md § 6.
//
// Not a prose test. Three things here are load-bearing, and each has cost
// somebody something when it was missing:
//
//   - The page is REACHABLE without being sent a link. A brand who notices a
//     wrong spec on their own product has to be able to find this from where
//     they are standing, which is any page on the site.
//   - `/for-manufacturers` resolves as a page, not as a gear-type slug. Same
//     route-ranking trap /safety has: a static segment competing with `:slug`.
//   - It sets the expectation that an update is RECORDED, NOT APPLIED. Every
//     support email this page might prevent is that one, and the plan calls it
//     out as the thing to say up front.
//
// Deliberately does not assert the endpoint reference in detail: the field
// names are pinned to the API's derived list by pytest
// (tests/test_frontend_contract.py, against MANUFACTURER_API.md), which is a
// stronger check than a string match here would be.

const SLUG = 'webbings'
const PATH = '/for-manufacturers'

describe('Manufacturer API documentation', () => {
  describe('finding it', () => {
    it('is linked from the footer of an ordinary gear page', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="footer-manufacturer-link"]').should('be.visible')
      cy.get('[data-cy="footer-manufacturer-link"] a').click()
      cy.location('pathname').should('eq', PATH)
      cy.get('[data-cy="manufacturer-api-page"]').should('exist')
      // Clicking the footer means the viewport is at the bottom of a long
      // listing. Client-side routing keeps that offset, so the docs would open
      // part-way down unless the link puts them back at the top.
      cy.window().its('scrollY').should('eq', 0)
    })

    it('resolves as a page on a deep link, not as a gear type', () => {
      // The failure this guards: `:slug` catching the segment and rendering an
      // empty listing for a gear type called "for-manufacturers".
      cy.visit(PATH)
      cy.get('[data-cy="manufacturer-api-page"]').should('exist')
      cy.get('[data-cy="gear-card"]').should('not.exist')
    })
  })

  describe('what it has to say', () => {
    beforeEach(() => cy.visit(PATH))

    it('says up front that an update is recorded, not applied', () => {
      cy.get('[data-cy="manufacturer-api-callout"]')
        .should('be.visible')
        .and('contain', 'recorded, not applied instantly')
    })

    it('documents the three endpoints a brand actually calls', () => {
      // Discovery first — the identity scheme assumes they call it before
      // sending anything, so it must be on the page and not only in the repo.
      cy.get('[data-cy="manufacturer-api-page"]').within(() => {
        cy.contains('/manufacturer/me').should('exist')
        cy.contains('/manufacturer/gear').should('exist')
        cy.contains('/manufacturer/submissions').should('exist')
      })
    })

    it('explains the two status codes a brand cannot guess', () => {
      // 502 is the one where the wrong instinct (retry) duplicates rows in the
      // admin's queue; 503 is the one they can do nothing about.
      cy.get('[data-cy="manufacturer-api-page"]').within(() => {
        cy.contains('502').should('exist')
        cy.contains('Do not blind-retry').should('exist')
        cy.contains('503').should('exist')
      })
    })

    it('warns about the unit that is not what it looks like', () => {
      // Webbing price is per metre. A brand quoting a spool price here is a
      // wrong number on the site that looks like a correct one.
      cy.contains('per metre, not per item').should('exist')
    })

    it('links the full reference', () => {
      cy.get('[data-cy="manufacturer-api-doc-link"]')
        .should('have.attr', 'href')
        .and('include', 'MANUFACTURER_API.md')
    })
  })
})
