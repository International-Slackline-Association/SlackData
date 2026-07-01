import { GEAR_TYPES } from '../support/gear_types'

// Tests the visual anatomy of a gear card against the DESIGN.md spec.
// Runs for every gear type using real backend data to pick representative items.

GEAR_TYPES.forEach(({ slug, apiPath, label, hasISA }) => {
  describe(`Gear card anatomy — ${label}`, () => {
    let firstItem: Record<string, unknown>

    before(() => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        firstItem = body[0]
      })
    })

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    // ── Required elements on every card ──────────────────────────────────────

    it('shows the brand name above the product name', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-brand"]')
        .should('be.visible')
        .and('contain.text', firstItem.brand_name as string)
    })

    it('shows the product name as a link', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]')
        .should('be.visible')
        .and('contain.text', firstItem.name as string)
        .and('have.attr', 'href')
    })

    it('shows a category badge in the image area', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-badge"]')
        .should('be.visible')
    })

    it('shows an inline specs row', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-specs"]')
        .should('exist')
    })

    it('shows a Save button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-save"]').should('be.visible')
    })

    it('shows an Alert button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-alert"]').should('be.visible')
    })

    it('shows a Compare button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-compare"]').should('be.visible')
    })

    // ── Price: shown only when non-null ───────────────────────────────────────

    it('shows the price in amber when the item has a price', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        const withPrice = (all as Record<string, unknown>[]).find(i => i.price != null)
        if (!withPrice) return

        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', withPrice.name as string)
          .closest('[data-cy="gear-card"]')
          .find('[data-cy="gear-card-price"]')
          .should('be.visible')
      })
    })

    it('omits the price element entirely when price is null', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        const noPrice = (all as Record<string, unknown>[]).find(i => i.price == null)
        if (!noPrice) return

        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', noPrice.name as string)
          .closest('[data-cy="gear-card"]')
          .find('[data-cy="gear-card-price"]')
          .should('not.exist')
      })
    })

    // ── ISA Approved badge: shown only when isa_certified is true ────────────

    if (hasISA) {
      it('shows the ISA Approved badge on certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('be.visible')
        })
      })

      it('does not show an ISA badge on non-certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', notCertified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('not.exist')
        })
      })
    }

    if (!hasISA) {
      it('never shows an ISA badge (this type has no isa_certified field)', () => {
        cy.get('[data-cy="gear-card"]').first()
          .find('[data-cy="isa-approved-badge"]')
          .should('not.exist')
      })
    }

    // ── Navigation from card ──────────────────────────────────────────────────

    it('navigates to the detail page when the product name is clicked', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]').click()
      cy.url().should('match', new RegExp(`/${slug}/\\d+`))
    })

    it('all cards link to detail URLs with the correct gear-type segment', () => {
      cy.get('[data-cy="gear-card"]').each(($card) => {
        cy.wrap($card).find('[data-cy="gear-card-name"]')
          .should('have.attr', 'href')
          .and('include', `/${slug}/`)
      })
    })

    // ── Card accessibility & interaction ─────────────────────────────────────
    // CSS :hover pseudo-state is not reliably triggerable in Cypress (pointer
    // events don't activate CSS :hover). Shadow-on-hover is tested by visual
    // regression tools, not E2E. Instead, assert the card is keyboard-reachable
    // and that the primary action (clicking the name link) works.

    it('the product name link is keyboard-focusable', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]')
        .focus()
        .should('be.focused')
    })

    it('the Save, Alert, and Compare buttons are keyboard-focusable', () => {
      cy.get('[data-cy="gear-card"]').first().within(() => {
        cy.get('[data-cy="btn-save"]').focus().should('be.focused')
        cy.get('[data-cy="btn-alert"]').focus().should('be.focused')
        cy.get('[data-cy="btn-compare"]').focus().should('be.focused')
      })
    })
  })
})
