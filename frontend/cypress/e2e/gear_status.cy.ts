// Gear status — the ALL / CURRENT / HISTORIC segmented control at the top of the
// filter sidebar, which scopes the grid by the `active` field, plus the red
// "Legacy" card badge shown only for retired gear. Driven by the real backend.
// Webbings is the fixture — the dataset has both active (still-sold) and legacy
// (active === false) items.

const SLUG = 'webbings'
const API = 'webbing'

// "All" shows everything; "Current" shows still-sold + unknown (active !== false);
// "Historic" shows only legacy (active === false). Mirror that split from the API
// so the counts are asserted against the source of truth, not a hard-coded number.
function partition(all: Record<string, unknown>[]) {
  const legacy = all.filter((it) => it.active === false)
  const current = all.filter((it) => it.active !== false)
  return { legacy, current }
}

describe('Gear status — all/current/historic control + legacy badge', () => {
  let all: Record<string, unknown>[]

  before(() => {
    cy.fetchAllItems(API).then((items) => {
      all = items as Record<string, unknown>[]
    })
  })

  beforeEach(() => {
    cy.visit(`/${SLUG}`)
  })

  it('renders a three-option status bubble, defaulting to All', () => {
    cy.get('[data-cy="status-toggle"]').should('be.visible')
    cy.get('[data-cy="status-all"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="status-current"]').should('have.attr', 'data-active', 'false')
    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'false')
  })

  it('lives at the top of the filter sidebar, above the sidebar header', () => {
    cy.get('[data-cy="filter-sidebar"]')
      .find('[data-cy="status-toggle"]')
      .should('exist')
    // Above the "FIND YOUR …" header, and it is the toolbar that no longer owns it.
    cy.get('[data-cy="status-toggle"]').then(($toggle) => {
      cy.get('[data-cy="filter-sidebar-header"]').then(($header) => {
        expect($toggle[0].getBoundingClientRect().top).to.be.lessThan(
          $header[0].getBoundingClientRect().top,
        )
      })
    })
  })

  it('sits outside the sidebar scroll region, which owns everything below it', () => {
    // The aside splits in two: pinned bubble + one scrolling region holding the
    // header and every filter group.
    cy.get('[data-cy="filter-sidebar"] [data-cy="filter-scroll"]').should('exist')
    cy.get('[data-cy="filter-scroll"] [data-cy="status-toggle"]').should('not.exist')
    cy.get('[data-cy="filter-scroll"] [data-cy="filter-sidebar-header"]').should('exist')
    cy.get('[data-cy="filter-scroll"] [data-cy="filter-group"]').should('have.length.greaterThan', 1)
  })

  it('stays pinned while the filter groups scroll beneath it', () => {
    // A short viewport guarantees the groups overflow their region.
    cy.viewport(1280, 620)
    cy.get('[data-cy="filter-group"]').should('have.length.greaterThan', 1)

    cy.get('[data-cy="status-toggle"]').then(($toggle) => {
      const pinnedTop = $toggle[0].getBoundingClientRect().top
      cy.get('[data-cy="filter-scroll"]').scrollTo('bottom')
      // The groups really moved…
      cy.get('[data-cy="filter-scroll"]').its('0.scrollTop').should('be.greaterThan', 0)
      // …and the bubble did not.
      cy.get('[data-cy="status-toggle"]').should('be.visible').then(($after) => {
        expect($after[0].getBoundingClientRect().top).to.be.closeTo(pinnedTop, 2)
      })
    })
  })

  it('is still clickable with the filter groups scrolled to the bottom', () => {
    cy.viewport(1280, 620)
    cy.get('[data-cy="filter-scroll"]').scrollTo('bottom')
    // No scroll-back-up, no force: the bubble is where it always was.
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'true')
  })

  it('colors each third and fills only the selected one', () => {
    // ALL orange / CURRENT green / HISTORIC red. Selected = filled with its own
    // color + white text; the others sit on white with their color as the text.
    const expected: Record<string, string> = {
      'status-all': 'rgb(232, 119, 10)',
      'status-current': 'rgb(21, 128, 61)',
      'status-historic': 'rgb(220, 38, 38)',
    }
    for (const [cy_, color] of Object.entries(expected)) {
      cy.get(`[data-cy="${cy_}"]`).click()
      cy.get(`[data-cy="${cy_}"]`).should('have.css', 'background-color', color)
      cy.get(`[data-cy="${cy_}"]`).should('have.css', 'color', 'rgb(255, 255, 255)')
      // The other two are white-backed and carry their own color as text.
      for (const [other, otherColor] of Object.entries(expected)) {
        if (other === cy_) continue
        cy.get(`[data-cy="${other}"]`).should('have.css', 'background-color', 'rgba(0, 0, 0, 0)')
        cy.get(`[data-cy="${other}"]`).should('have.css', 'color', otherColor)
      }
    }
  })

  it('All shows every item, badging only the legacy ones', () => {
    cy.get('[data-cy="item-count"]').should('contain.text', String(all.length))
    // A mixed grid: some cards badged, some not — the badge is the discriminator.
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="gear-card"]').then(($cards) => {
      const badged = $cards.find('[data-cy="legacy-badge"]').length
      expect(badged).to.be.greaterThan(0)
      expect(badged).to.be.lessThan($cards.length)
    })
  })

  it('Current view shows the still-sold count and no legacy badges', () => {
    const { current } = partition(all)
    cy.get('[data-cy="status-current"]').click()
    cy.get('[data-cy="status-current"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="item-count"]').should('contain.text', String(current.length))
    // No card in the current scope is legacy, so no badge should render.
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="legacy-badge"]').should('not.exist')
  })

  it('Historic view shows the legacy count and a legacy badge on cards', () => {
    const { legacy } = partition(all)
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="item-count"]').should('contain.text', String(legacy.length))
    // Every card in the historic scope is legacy → each carries the red badge.
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="legacy-badge"]')
      .should('be.visible')
      .and('contain.text', 'Legacy')
  })

  it('positions the legacy badge in the top-LEFT of the card', () => {
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="gear-card"]').first().then(($card) => {
      const card = $card[0].getBoundingClientRect()
      cy.wrap($card)
        .find('[data-cy="legacy-badge"]')
        .then(($b) => {
          const badge = $b[0].getBoundingClientRect()
          // Anchored to the left edge, not the right: the badge's left sits in the
          // left half of the card, and its own left is closer to the card's left
          // edge than its right is to the card's right edge.
          expect(badge.left - card.left).to.be.lessThan(card.width / 2)
          expect(badge.left - card.left).to.be.lessThan(card.right - badge.right)
        })
    })
  })

  it('returning to All restores the full scope', () => {
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="status-all"]').click()
    cy.get('[data-cy="status-all"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="item-count"]').should('contain.text', String(all.length))
  })
})
