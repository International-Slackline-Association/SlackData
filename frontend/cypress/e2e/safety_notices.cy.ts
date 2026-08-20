// Safety disclaimer + data-accuracy note — the two standing notices required
// before launch (LAUNCH_RUNBOOK.md §10, DESIGN.md § Safety & Data Notices).
//
// The point of these tests is not that some text exists somewhere. It is that
// the notices are UNAVOIDABLE and CONSISTENT:
//   - present on every page, including the ones a deep link lands on
//   - not dismissible (no close control to click away)
//   - identical wording across surfaces, because each notice is one component
//   - the /safety route resolves as a page, not as a gear-type slug
//
// Driven by the real backend, like every other spec here — webbings is the
// fixture, and the detail-page assertions resolve a real item id from the API.

const SLUG = 'webbings'
const API = 'webbing'

// The copy lives in SAFETY_AND_ACCURACY.md and is mirrored by the components.
// Asserted as substrings so wording tweaks don't fail on punctuation, but the
// load-bearing clause of each notice is pinned.
const SAFETY_LEAD = 'Check manufacturer specifications before you rig'
const SAFETY_QUALIFIER = 'not a safety authority'
const ACCURACY_TEXT = 'Community-sourced — may be incomplete'

describe('Safety & data-accuracy notices', () => {
  describe('site footer', () => {
    // Every route class: listing, detail, compare, manufacturers, brand detail,
    // the safety page itself, and a 404. A notice that vanishes on one route is
    // the failure mode worth catching.
    it('appears on every route, including deep links and the 404', () => {
      cy.fetchAllItems(API).then((items) => {
        const id = (items[0] as { id: number }).id
        const routes = [
          `/${SLUG}`,
          `/${SLUG}/${id}`,
          `/${SLUG}/compare?ids=${id}`,
          '/manufacturers',
          '/safety',
          '/this-route-does-not-exist',
        ]
        for (const route of routes) {
          cy.visit(route)
          cy.get('[data-cy="site-footer"]', { timeout: 10000 })
            .should('exist')
            .within(() => {
              cy.get('[data-cy="safety-notice-footer"]').should('contain', SAFETY_LEAD)
              cy.get('[data-cy="data-accuracy-footer"]').should('contain', ACCURACY_TEXT)
            })
        }
      })
    })

    it('carries both notices with the safety qualifier and a link to /safety', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="safety-notice-footer"]')
        .should('contain', SAFETY_LEAD)
        .and('contain', SAFETY_QUALIFIER)
        .find('[data-cy="safety-notice-link"]')
        .should('have.attr', 'href', '/safety')
    })

    it('is not dismissible — the footer exposes no button at all', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="site-footer"]').find('button').should('not.exist')
    })

    it('survives a reload, so nothing has been persisted to dismiss it', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="safety-notice-footer"]').should('exist')
      cy.reload()
      cy.get('[data-cy="safety-notice-footer"]').should('exist')
      cy.get('[data-cy="data-accuracy-footer"]').should('exist')
    })
  })

  describe('gear detail page callout', () => {
    let id: number

    before(() => {
      cy.fetchAllItems(API).then((items) => {
        id = (items[0] as { id: number }).id
      })
    })

    it('shows the safety callout below the spec sheet', () => {
      cy.visit(`/${SLUG}/${id}`)
      cy.get('[data-cy="safety-notice-callout"]')
        .should('be.visible')
        .and('contain', SAFETY_LEAD)

      // Below the spec sheet, not above it — the callout follows the numbers.
      cy.get('[data-cy="gear-detail"]').then(($detail) => {
        cy.get('[data-cy="safety-notice-callout"]').then(($callout) => {
          expect($callout.offset()!.top).to.be.greaterThan($detail.offset()!.top)
        })
      })
    })

    it('renders the same wording as the footer copy', () => {
      cy.visit(`/${SLUG}/${id}`)
      cy.get('[data-cy="safety-notice-callout"]')
        .invoke('text')
        .then((calloutText) => {
          cy.get('[data-cy="safety-notice-footer"]')
            .invoke('text')
            .should((footerText) => {
              // One component, two variants — so the text must match exactly.
              expect(calloutText.trim()).to.eq(footerText.trim())
            })
        })
    })

    // The callout must NOT be inside GearDetailBody, which the Detailed listing
    // view reuses — that would repeat it once per visible item.
    it('does not repeat once per item in the listing Detailed view', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="view-detailed"]').click()
      cy.get('[data-cy="safety-notice-callout"]').should('not.exist')
    })
  })

  describe('data-accuracy note on the listing', () => {
    it('sits immediately after the item count', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="data-accuracy-inline"]')
        .should('be.visible')
        .and('contain', ACCURACY_TEXT)
      cy.get('[data-cy="item-count"]')
        .next('[data-cy="data-accuracy-inline"]')
        .should('exist')
    })

    it('stays put while filtering changes the count', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="search-input"]').type('core')
      cy.get('[data-cy="data-accuracy-inline"]').should('contain', ACCURACY_TEXT)
    })
  })

  describe('/safety page', () => {
    it('resolves as a page, not as a gear-type slug', () => {
      cy.visit('/safety')
      cy.get('[data-cy="safety-page"]').should('exist')
      // Would be present if the route had fallen through to the gear listing.
      cy.get('[data-cy="gear-listing"]').should('not.exist')
      cy.get('[data-cy="coming-soon"]').should('not.exist')
    })

    it('states the load-bearing safety points', () => {
      cy.visit('/safety')
      cy.get('[data-cy="safety-page"]')
        .should('contain', 'Breaking strength is not a working load')
        // Points the reader at the manufacturer's instructions for the working
        // load, rather than leaving them to infer one from the kN figure.
        .and('contain', 'should be found in manufacturer instructions')
        .and('contain', 'can all reduce real-world strength')
        .and('contain', 'Stretch curves are indicative')
        // Certification data is a snapshot, and absence is not a negative claim.
        .and('contain', 'not a live feed')
        .and('contain', 'does not mean one does not exist')
        // Legacy gear is not a fitness-for-use claim.
        .and('contain', 'not a suggestion that it is still')
    })

    it('links to the ISA warnings database as the authoritative source', () => {
      cy.visit('/safety')
      cy.get('[data-cy="isa-warnings-link"]')
        .should('have.attr', 'href')
        .and('contain', 'slacklineinternational.org')
    })

    it('is reachable from the footer notice on any page', () => {
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="safety-notice-footer"]')
        .find('[data-cy="safety-notice-link"]')
        .click()
      cy.location('pathname').should('eq', '/safety')
      cy.get('[data-cy="safety-page"]').should('exist')
    })
  })
})
