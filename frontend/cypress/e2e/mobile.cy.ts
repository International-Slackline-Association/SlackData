// Mobile / responsive contract, run at 390×844 (iPhone 14). Everything else in
// the suite runs at the config default of 1440×900, so this is the only place
// the narrow layout is exercised.
//
// The single most valuable assertion here is the horizontal-overflow check: it
// catches the whole class of bug this suite was written for (a fixed-width
// column, an unwrapped table, a min-w popover) on every route at once, without
// caring how the layout is implemented.

import { GEAR_TYPES } from '../support/gear_types'

const PHONE: [number, number] = [390, 844]

// iOS/Android tap-target guidance is 44px. Filter pills sit in dense wrapping
// groups where 44px would push the longer lists off-screen, so they get 36px —
// still a comfortable target given their generous width.
const TAP_MIN = 44
const PILL_MIN = 36

function expectNoHorizontalOverflow() {
  cy.document().then((doc) => {
    const el = doc.documentElement
    // +1 absorbs sub-pixel rounding on fractional device widths.
    expect(
      el.scrollWidth,
      `page scrolls horizontally (${el.scrollWidth}px of content in ${el.clientWidth}px)`,
    ).to.be.at.most(el.clientWidth + 1)
  })
}

describe('Mobile — no horizontal overflow', () => {
  beforeEach(() => cy.viewport(...PHONE))

  GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
    it(`${label} listing fits the viewport`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
      expectNoHorizontalOverflow()
    })

    it(`${label} detail page fits the viewport`, () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.visit(`/${slug}/${all[0].id}`)
        cy.get('[data-cy="gear-detail"]').should('be.visible')
        expectNoHorizontalOverflow()
      })
    })
  })

  it('manufacturers fits the viewport', () => {
    cy.visit('/manufacturers')
    cy.get('[data-cy="manufacturers-card"]').should('have.length.greaterThan', 0)
    expectNoHorizontalOverflow()
  })

  it('a brand page fits the viewport', () => {
    cy.visit('/manufacturers')
    cy.get('[data-cy="manufacturers-card"]').first().click()
    cy.location('pathname').should('match', /^\/manufacturers\/\d+$/)
    expectNoHorizontalOverflow()
  })

  it('the safety page fits the viewport', () => {
    cy.visit('/safety')
    expectNoHorizontalOverflow()
  })

  it('the compare table scrolls inside itself, not the page', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="btn-compare"]').eq(0).click()
    cy.get('[data-cy="btn-compare"]').eq(1).click()
    cy.get('[data-cy="compare-bar-view-btn"]').click()
    cy.get('[data-cy="compare-table"]').should('be.visible')
    // The table itself is allowed — required, even — to be wider than the phone.
    // The page around it must not be.
    expectNoHorizontalOverflow()
  })
})

describe('Mobile — single-column layout', () => {
  beforeEach(() => {
    cy.viewport(...PHONE)
    cy.visit('/webbings')
  })

  it('stacks the card grid into one column', () => {
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 1)
    cy.get('[data-cy="gear-card"]').then(($cards) => {
      const top0 = $cards[0].getBoundingClientRect().top
      const top1 = $cards[1].getBoundingClientRect().top
      expect(top1, 'second card sits below the first, not beside it').to.be.greaterThan(top0)
    })
  })

  it('does not render the desktop filter sidebar', () => {
    cy.get('[data-cy="gear-grid"]').should('exist')
    cy.get('[data-cy="filter-sidebar"]').should('not.exist')
  })

  it('gives the results the full width of the page', () => {
    cy.get('[data-cy="gear-card"]').first().then(($card) => {
      // The old bug: a 280px sidebar in an uncollapsed flex row squeezed the
      // grid to a few dozen pixels. Anything under half the viewport means the
      // sidebar (or something like it) is stealing the row again.
      expect($card[0].getBoundingClientRect().width).to.be.greaterThan(390 / 2)
    })
  })
})

describe('Mobile — filters live in a bottom sheet', () => {
  beforeEach(() => {
    cy.viewport(...PHONE)
    cy.visit('/webbings')
  })

  it('shows a filter bar with a Filters button instead of the sidebar', () => {
    cy.get('[data-cy="mobile-filter-bar"]').should('be.visible')
    cy.get('[data-cy="mobile-filter-btn"]').should('be.visible').and('have.attr', 'data-count', '0')
    cy.get('[data-cy="sheet"]').should('not.exist')
  })

  it('opens the sidebar in a sheet and closes it again', () => {
    cy.get('[data-cy="mobile-filter-btn"]').click()
    cy.get('[data-cy="sheet"]').should('be.visible')
    cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    // DESIGN.md: the scope control is always visible, in either layout.
    cy.get('[data-cy="status-toggle"]').should('be.visible')

    cy.get('[data-cy="sheet-close"]').click()
    cy.get('[data-cy="sheet"]').should('not.exist')
    cy.get('[data-cy="filter-sidebar"]').should('not.exist')
  })

  it('applies a filter from the sheet and badges the button with the count', () => {
    cy.get('[data-cy="mobile-filter-btn"]').click()
    cy.get('[data-cy="filter-pill"]').first().click()
    // The filter went to the URL like any other.
    cy.location('search').should('not.equal', '')
    // And the footer count reflects the narrowed list while the sheet is open.
    cy.get('[data-cy="sheet-apply"]').should('contain.text', 'result')

    cy.get('[data-cy="sheet-apply"]').click()
    cy.get('[data-cy="sheet"]').should('not.exist')
    cy.get('[data-cy="mobile-filter-btn"]').should('have.attr', 'data-count', '1')
  })

  it('opens sort in a sheet and applies a choice', () => {
    cy.get('[data-cy="mobile-sort-btn"]').click()
    cy.get('[data-cy="sheet"]').should('be.visible')
    cy.get('[data-cy="sort-option"][data-field="name"][data-direction="desc"]').click()
    cy.get('[data-cy="sheet"]').should('not.exist')
    cy.location('search').should('contain', 'sort=name-desc')
    cy.get('[data-cy="mobile-sort-btn"]').should('contain.text', 'Z→A')
  })

  it('keeps the filter bar reachable after scrolling down the results', () => {
    cy.scrollTo(0, 1200)
    cy.get('[data-cy="mobile-filter-btn"]').should('be.visible')
  })
})

describe('Mobile — navigation strip', () => {
  beforeEach(() => {
    cy.viewport(...PHONE)
    cy.visit('/webbings')
  })

  it('keeps every gear tab on a single row', () => {
    cy.get('[data-cy="nav-tab"]').then(($tabs) => {
      const tops = [...$tabs].map((t) => Math.round(t.getBoundingClientRect().top))
      expect(new Set(tops).size, 'all tabs share one row').to.equal(1)
    })
  })

  it('keeps the header short enough to leave room for results', () => {
    cy.get('[data-cy="top-nav"]').then(($nav) => {
      // Wrapping 10 tabs used to cost 200px+ of permanently sticky chrome.
      expect($nav[0].getBoundingClientRect().height).to.be.lessThan(140)
    })
  })

  it('scrolls the active tab into view on a later category', () => {
    cy.get('[data-cy="nav-tab"][data-type="tricklinekits"]').click({ force: true })
    cy.get('[data-cy="nav-tab"][data-active="true"]').then(($tab) => {
      const r = $tab[0].getBoundingClientRect()
      expect(r.left).to.be.at.least(0)
      expect(r.right).to.be.at.most(390)
    })
  })
})

describe('Mobile — touch targets', () => {
  beforeEach(() => {
    cy.viewport(...PHONE)
    cy.visit('/webbings')
  })

  const atLeast = (selector: string, min: number) => {
    cy.get(selector).each(($el) => {
      expect(
        $el[0].getBoundingClientRect().height,
        `${selector} is too small to tap`,
      ).to.be.at.least(min)
    })
  }

  it('gives nav tabs a full-size tap target', () => atLeast('[data-cy="nav-tab"]', TAP_MIN))

  it('gives the filter and sort buttons a full-size tap target', () => {
    atLeast('[data-cy="mobile-filter-btn"]', TAP_MIN)
    atLeast('[data-cy="mobile-sort-btn"]', TAP_MIN)
  })

  it('gives the card action buttons a usable tap target', () => {
    atLeast('[data-cy="btn-compare"]', 40)
  })

  it('gives filter pills a usable tap target', () => {
    cy.get('[data-cy="mobile-filter-btn"]').click()
    atLeast('[data-cy="filter-pill"]', PILL_MIN)
  })

  it('gives the carousel arrows a usable tap target', () => {
    cy.get('[data-cy="card-image-next"]').then(($arrows) => {
      if (!$arrows.length) return // not every type has multi-image items
      atLeast('[data-cy="card-image-next"]', 32)
    })
  })
})

describe('Mobile — compare bar does not cover content', () => {
  beforeEach(() => {
    cy.viewport(...PHONE)
    cy.visit('/webbings')
  })

  it('leaves the footer reachable below the bar', () => {
    cy.get('[data-cy="btn-compare"]').first().click()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
    cy.scrollTo('bottom')
    cy.get('[data-cy="site-footer"]').then(($footer) => {
      cy.get('[data-cy="compare-bar"]').then(($bar) => {
        expect(
          $footer[0].getBoundingClientRect().bottom,
          'footer is not hidden underneath the fixed compare bar',
        ).to.be.at.most($bar[0].getBoundingClientRect().top + 1)
      })
    })
  })

  it('keeps the count and the CTA on screen with four items selected', () => {
    for (let i = 0; i < 4; i += 1) cy.get('[data-cy="btn-compare"]').eq(i).click()
    cy.get('[data-cy="compare-bar-item"]').should('have.length', 4)
    cy.get('[data-cy="compare-bar-count"]').should('be.visible')
    cy.get('[data-cy="compare-bar-view-btn"]').should('be.visible').and('not.be.disabled')
  })
})

describe('Mobile — detail page', () => {
  beforeEach(() => cy.viewport(...PHONE))

  it('stacks the image above the specs instead of beside them', () => {
    cy.fetchAllItems('webbing').then((all) => {
      cy.visit(`/webbings/${all[0].id}`)
      cy.get('[data-cy="detail-img"]').then(($img) => {
        cy.get('[data-cy="spec-table"]').then(($specs) => {
          expect(
            $specs[0].getBoundingClientRect().top,
            'specs sit below the image, not in a second column',
          ).to.be.greaterThan($img[0].getBoundingClientRect().top)
        })
      })
    })
  })
})
