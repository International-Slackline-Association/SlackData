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

// Back goes to the page you were ACTUALLY on, not to a generic listing.
//
// A gear item is reached from at least four places — a filtered listing, a
// manufacturer's inventory, the compare table, or a bare link — and the detail
// page's back link used to be `/${slug}` in every one of them. Opening a webbing
// from Balance Community's page and pressing it landed you in the unfiltered
// webbing listing: the filters, the sort and the manufacturer all gone.
//
// The link carries the origin in history state (src/utils/origin.ts); these are
// its contract. The href matters as much as the click — it is a real link, so
// middle-click and "copy link address" have to work on it.
describe('Back link — where you came from', () => {
  it('returns to the filtered listing an item was opened from', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="search-input"]').type('core')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="gear-card-name"]').first().click()

    cy.get('[data-cy="detail-back-link"]')
      .should('contain.text', 'Webbings')
      .and('have.attr', 'href')
      .and('include', 'q=core')

    cy.get('[data-cy="detail-back-link"]').click()
    cy.url().should('include', 'q=core')
    cy.get('[data-cy="search-input"]').should('have.value', 'core')
  })

  it('returns to the manufacturer whose page the item was opened from', () => {
    cy.visit('/manufacturers')
    // The directory is built from every gear type at once, so it can take a
    // while to arrive on a cold cache — longer than the 5s default.
    cy.get('[data-cy="manufacturers-card"]', { timeout: 30000 })
      .first().find('a').first().click()
    cy.url().should('match', /\/manufacturers\/\d+$/)

    cy.url().then((brandUrl) => {
      cy.get('[data-cy="brand-detail-name"]', { timeout: 30000 }).invoke('text').then((brandName) => {
        cy.get('[data-cy="gear-card-name"]').first().click()
        // The manufacturer's own name, not the gear type's.
        cy.get('[data-cy="detail-back-link"]').should('contain.text', brandName.trim())
        cy.get('[data-cy="detail-back-link"]').click()
        cy.url().should('eq', brandUrl)
      })
    })
  })

  it('returns to the compare table an item was opened from', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 2)
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-view-btn"]').click()
    cy.url().should('include', '/webbings/compare')

    cy.get('[data-cy="compare-col-name"]').first().click()
    cy.get('[data-cy="detail-back-link"]').should('contain.text', 'Compare Webbings')
    cy.get('[data-cy="detail-back-link"]').click()
    cy.url().should('include', '/webbings/compare')
  })

  it('sends the compare table itself back to the listing it was built from', () => {
    cy.visit('/webbings?q=core')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 1)
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-view-btn"]').click()

    cy.get('[data-cy="compare-back-link"]')
      .should('have.attr', 'href')
      .and('include', 'q=core')
  })

  it('sends a brand page back to the listing its name was clicked on', () => {
    cy.visit('/webbings?q=core')
    cy.get('[data-cy="gear-card"]').first().find('[data-cy="brand-link"]').click()
    // Same wait as above: the brand page renders its back link once the whole
    // directory has loaded.
    cy.get('[data-cy="brand-back-link"]', { timeout: 30000 })
      .should('contain.text', 'Webbings')
      .and('have.attr', 'href')
      .and('include', 'q=core')
  })

  it('falls back to the gear type for an item opened by a bare link', () => {
    // No origin in history state — a pasted link, or a search result.
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card-name"]').first().invoke('attr', 'href').then((href) => {
      cy.visit(href as string)
      cy.get('[data-cy="detail-back-link"]')
        .should('contain.text', 'Webbings')
        .and('have.attr', 'href', '/webbings')
      cy.get('[data-cy="detail-back-link"]').click()
      cy.url().should('match', /\/webbings$/)
    })
  })
})

// The two filters that used to live in component state, and so silently
// reverted when you came back to the listing. Both are query params now
// (?status=, ?kn=/?stretch_min=/?stretch_max=) — see hooks/useUrlState.ts.
describe('Back restores the filters that were not in the URL', () => {
  it('brings the status scope back', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="status-historic"]').click()
    cy.url().should('include', 'status=historic')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)

    cy.get('[data-cy="gear-card-name"]').first().click()
    cy.url().should('match', /\/webbings\/\d+$/)
    cy.go('back')

    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'true')
    // Historic scope = legacy gear only, so every card wears the red badge.
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="gear-card"]').first().find('[data-cy="legacy-badge"]').should('exist')
  })

  it('brings the compare selection back', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 2)
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '2')

    // The detour that used to empty the bar: open one of the picks to check a
    // number, then come back.
    cy.get('[data-cy="gear-card-name"]').eq(0).click()
    cy.url().should('match', /\/webbings\/\d+$/)
    cy.go('back')

    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '2')
    cy.get('[data-cy="gear-card"]').eq(0)
      .find('[data-cy="btn-compare"]').should('have.attr', 'data-active', 'true')
  })

  it('brings the engaged stretch kN back', () => {
    const stretch = '[data-cy="filter-group"][data-group="stretch"]'
    cy.visit('/webbings')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first().click()
    cy.url().should('include', 'kn=')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .invoke('attr', 'data-kn')
      .then((kn) => {
        cy.get('[data-cy="gear-card-name"]').first().click()
        cy.go('back')
        cy.get(stretch)
          .find(`[data-cy="stretch-kn-pill"][data-kn="${kn}"][data-active="true"]`)
          .should('exist')
        // The filter it drives is back too: every card carries a stretch % at
        // that kN, which is only attached while a pill is engaged.
        cy.get('[data-cy="gear-card"]').first().should('have.attr', 'data-stretch-percent')
      })
  })
})
