import { GEAR_TYPES } from '../support/gear_types'

describe('Top navigation', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('shows the SlackData wordmark', () => {
    cy.get('[data-cy="wordmark"]').should('be.visible').and('contain.text', 'SlackData')
  })

  // The browser tab / bookmark name, from index.html. Guards against the Vite
  // scaffold default ("frontend") coming back, which shipped to production once.
  it('titles the browser tab SlackData', () => {
    cy.title().should('eq', 'SlackData')
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

// Back returns you to where you were on the page, not to the top of it.
//
// This is the site's most-repeated action — scroll a 245-card listing, open one,
// press Back — and without restoration it costs the whole scroll every time.
// react-router's <ScrollRestoration> is data-router-only and main.tsx mounts a
// plain <BrowserRouter>, so hooks/useScrollRestoration.ts does it instead; these
// are its contract.
describe('Scroll restoration', () => {
  it('returns to the previous scroll position after Back', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 10)

    const LEFT_AT = 1800
    cy.scrollTo(0, LEFT_AT)

    // Click a card that is ALREADY on screen, with scrollBehavior disabled.
    // cypress.config.ts sets scrollBehavior: 'center' globally, which scrolls
    // the target into the middle of the viewport before clicking — a real
    // scroll, recorded like any other, so the offset restored afterwards would
    // be that one and not the one we set up. A visitor clicking a card they can
    // already see does no scrolling, which is what this reproduces.
    cy.window()
      .then((w) => {
        const cards = Array.from(w.document.querySelectorAll('[data-cy="gear-card"]'))
        const onScreen = cards.findIndex((c) => {
          const r = c.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= w.innerHeight
        })
        expect(onScreen, 'a card is fully in view at this offset').to.be.greaterThan(-1)
        return onScreen
      })
      .then((i) => {
        cy.get('[data-cy="gear-card"]').eq(i).find('a').first().click({ scrollBehavior: false })
        cy.url().should('match', /\/webbings\/\d+$/)
        // A forward navigation still starts at the top.
        cy.window().its('scrollY').should('be.lessThan', 50)

        cy.go('back')
        cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 10)
        // Restoration is retried across frames while the list refetches, so the
        // offset arrives a little after the cards do. Within a few pixels: the
        // browser clamps to whatever document height it has at that instant.
        cy.window()
          .its('scrollY')
          .should((y) => expect(Math.abs(y - LEFT_AT)).to.be.lessThan(5))
      })
  })

  it('brings search, sort and filters back with it', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="search-input"]').type('core')
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"]').contains(/name.*z.*a/i).click()
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)

    cy.get('[data-cy="gear-card"]').first().find('a').first().click()
    cy.url().should('match', /\/webbings\/\d+$/)

    cy.go('back')
    // The query string is the state, and the search box re-seeds from it on
    // mount — so both the URL and the input have to come back.
    cy.url().should('include', 'q=core')
    cy.get('[data-cy="search-input"]').should('have.value', 'core')
    cy.get('[data-cy="sort-dropdown"]').should('contain.text', 'Z→A')
  })

  it('opens a fresh navigation at the top', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 10)
    cy.scrollTo(0, 1800)
    cy.get('[data-cy="nav-tab"][data-type="weblocks"]').click()
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.window().its('scrollY').should('be.lessThan', 50)
  })
})
