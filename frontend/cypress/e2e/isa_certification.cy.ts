import { GEAR_TYPES } from '../support/gear_types'

// ISA Approved badge behaviour.
// Reference: DESIGN.md — the stamp badge (charcoal frame, teal + coral ISA mark,
// white "APPROVED" text with teal checkmark) is the ONLY representation of
// certification. Generic pills or checkmarks are wrong.

const ISA_TYPES  = GEAR_TYPES.filter(t => t.hasISA)
const NO_ISA     = GEAR_TYPES.filter(t => !t.hasISA)

// ── On gear listing cards ─────────────────────────────────────────────────────

describe('ISA Approved badge — gear cards', () => {
  ISA_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows the ISA Approved stamp on certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return // skip if no certified items in dataset

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('be.visible')
        })
      })

      it('does not show the ISA badge on non-certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', notCertified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('not.exist')
        })
      })

      it('positions the ISA badge inside the card image area', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="gear-card-image-area"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('exist')
        })
      })

      it('does not use a plain checkmark or text pill for ISA certification', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .within(() => {
              cy.get('[data-cy="isa-checkmark"]').should('not.exist')
              cy.get('[data-cy="isa-pill"]').should('not.exist')
            })
        })
      })
    })
  })

  NO_ISA.forEach(({ slug, label }) => {
    it(`${label}: never shows any ISA badge (type has no isa_certified field)`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
    })
  })
})

// ── On gear detail pages ──────────────────────────────────────────────────────

describe('ISA certification block — gear detail page', () => {
  ISA_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows the ISA Approved stamp badge for a certified item', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}/${certified.id}`)
          cy.get('[data-cy="isa-certification-block"]').should('be.visible')
          cy.get('[data-cy="isa-approved-badge"]').should('be.visible')
          cy.get('[data-cy="isa-not-certified-text"]').should('not.exist')
        })
      })

      it('shows subdued "Not ISA Certified" text (no badge) for a non-certified item', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.visit(`/${slug}/${notCertified.id}`)
          cy.get('[data-cy="isa-certification-block"]').should('be.visible')
          cy.get('[data-cy="isa-not-certified-text"]').should('be.visible')
          cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
        })
      })

      it('renders the certification block above the spec table', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const item = all[0] as Record<string, unknown>
          cy.visit(`/${slug}/${item.id}`)

          cy.get('[data-cy="isa-certification-block"]').then(($cert) => {
            cy.get('[data-cy="spec-table"]').then(($spec) => {
              const certBottom  = $cert[0].getBoundingClientRect().bottom
              const specTop     = $spec[0].getBoundingClientRect().top
              expect(certBottom).to.be.lte(specTop)
            })
          })
        })
      })
    })
  })

  NO_ISA.forEach(({ slug, apiPath, label }) => {
    it(`${label}: omits the ISA certification block entirely`, () => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        cy.visit(`/${slug}/${body[0].id}`)
        cy.get('[data-cy="isa-certification-block"]').should('not.exist')
        cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
        cy.get('[data-cy="isa-not-certified-text"]').should('not.exist')
      })
    })
  })
})

// ── ISA Warning banner ────────────────────────────────────────────────────────

describe('ISA Warning banner', () => {
  const WARNING_TYPES = GEAR_TYPES.filter(t => t.hasISAWarning)
  const NO_WARNING    = GEAR_TYPES.filter(t => !t.hasISAWarning)

  WARNING_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows an amber warning banner when isa_warning is set', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const withWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning != null)
          if (!withWarning) return

          cy.visit(`/${slug}/${withWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]')
            .should('be.visible')
            .and('contain.text', withWarning.isa_warning as string)
        })
      })

      it('positions the warning banner between the header and the spec table', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const withWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning != null)
          if (!withWarning) return

          cy.visit(`/${slug}/${withWarning.id}`)
          cy.get('[data-cy="detail-name"]').then(($name) => {
            cy.get('[data-cy="isa-warning-banner"]').then(($banner) => {
              cy.get('[data-cy="spec-table"]').then(($spec) => {
                expect($name[0].getBoundingClientRect().bottom)
                  .to.be.lte($banner[0].getBoundingClientRect().top)
                expect($banner[0].getBoundingClientRect().bottom)
                  .to.be.lte($spec[0].getBoundingClientRect().top)
              })
            })
          })
        })
      })

      it('hides the warning banner when isa_warning is null', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const noWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning == null)
          if (!noWarning) return

          cy.visit(`/${slug}/${noWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
        })
      })
    })
  })

  NO_WARNING.forEach(({ slug, apiPath, label }) => {
    it(`${label}: never shows an ISA warning banner`, () => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        cy.visit(`/${slug}/${body[0].id}`)
        cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
      })
    })
  })
})
