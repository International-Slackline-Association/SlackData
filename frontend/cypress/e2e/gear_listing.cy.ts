import { GEAR_TYPES } from '../support/gear_types'

// Tests run against every gear type — all assertions use the real backend.
GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Gear listing page — ${label}`, () => {
    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    // ── Page structure ────────────────────────────────────────────────────────

    it('renders the search input above the grid', () => {
      cy.get('[data-cy="search-input"]').should('be.visible')
    })

    it('renders the sort dropdown', () => {
      cy.get('[data-cy="sort-dropdown"]').should('be.visible')
    })

    it('renders Cards and Detailed view toggle buttons', () => {
      cy.get('[data-cy="view-cards"]').should('be.visible')
      cy.get('[data-cy="view-detailed"]').should('be.visible')
    })

    it('defaults to Cards view active', () => {
      cy.get('[data-cy="view-cards"]').should('have.attr', 'data-active', 'true')
      cy.get('[data-cy="view-detailed"]').should('not.have.attr', 'data-active', 'true')
    })

    it('renders the filter sidebar', () => {
      cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    })

    it('shows the item count label', () => {
      cy.get('[data-cy="item-count"]').should('be.visible')
    })

    // ── Data-driven: item count matches the backend ───────────────────────────

    it('displays the correct total item count', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.get('[data-cy="item-count"]').should('contain.text', String(all.length))
      })
    })

    it('renders exactly as many cards as the backend has items', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.get('[data-cy="gear-card"]').should('have.length', all.length)
      })
    })

    // ── Card grid layout ──────────────────────────────────────────────────────

    it('renders cards in a grid container', () => {
      cy.get('[data-cy="gear-grid"]').should('be.visible')
    })

    it('renders at least 3 columns on a 1440px viewport', () => {
      // Pinned explicitly. The grid is 1 column below sm by design (see
      // mobile.cy.ts), so this assertion is only meaningful at a wide viewport —
      // without the pin it would fail the moment anything ran the suite narrow.
      cy.viewport(1440, 900)
      cy.get('[data-cy="gear-card"]').then(($cards) => {
        if ($cards.length < 2) return // skip if fewer than 2 items exist
        const top0 = $cards[0].getBoundingClientRect().top
        const top1 = $cards[1].getBoundingClientRect().top
        // If cards 0 and 1 share the same top, they're on the same row (multi-column layout)
        expect(top0).to.equal(top1)
      })
    })

    // ── Loading state ─────────────────────────────────────────────────────────

    it('shows loading skeletons before cards appear', () => {
      // Intercept and delay the API response to catch the skeleton state
      cy.intercept(`${Cypress.env('apiUrl')}/${apiPath}/*`, (req) => {
        req.on('response', (res) => { res.setDelay(500) })
      }).as('delayedApi')

      cy.visit(`/${slug}`)
      cy.get('[data-cy="loading-skeleton"]').should('exist')
      cy.wait('@delayedApi')
      cy.get('[data-cy="loading-skeleton"]').should('not.exist')
    })

    // ── Empty state ───────────────────────────────────────────────────────────

    it('shows an empty-state message when search matches nothing', () => {
      cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
      cy.get('[data-cy="empty-state"]').should('be.visible')
      cy.get('[data-cy="gear-card"]').should('not.exist')
    })

    it('shows a clear-filters action in the empty state', () => {
      cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
      cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').should('be.visible')
    })

    // The sidebar's "Clear all" is the one that also wipes the search box.
    // (The empty state's own button keeps the term — see the webbings-only
    // "Empty-state clear" describe at the bottom of this file.)
    it('restores the full card list when the sidebar Clear all is clicked from empty state', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
        cy.get('[data-cy="empty-state"]').should('be.visible')
        cy.get('[data-cy="filter-sidebar"]').find('[data-cy="clear-filters"]').click()
        cy.get('[data-cy="search-input"]').should('have.value', '')
        cy.get('[data-cy="gear-card"]').should('have.length', all.length)
      })
    })

  // ── Detailed view ─────────────────────────────────────────────────────────
  // These live inside the describe above so they inherit its cy.visit beforeEach.
  // Detailed view shows each item as a full-width panel carrying its complete
  // spec sheet — the same content as the standalone detail page, stacked and
  // scrolled through in place. Same items, same filters, same sort order as the
  // grid; only the density differs.
  //
  // data-cy contract:
  //   gear-detailed-list — the stacked list, visible in Detailed view
  //   gear-detailed-row  — one item panel (same count as gear-card in Cards view)
  // Panels reuse the detail page's inner hooks (detail-name, detail-brand,
  // spec-table, …) because they render the very same component — assertions on
  // those must be scoped WITHIN a gear-detailed-row.

  it('clicking Detailed view switches to stacked spec panels', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-list"]').should('be.visible')
    cy.get('[data-cy="gear-grid"]').should('not.be.visible')
  })

  it('Detailed view toggle becomes active after clicking', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="view-detailed"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="view-cards"]').should('not.have.attr', 'data-active', 'true')
  })

  it('Detailed view shows the same number of items as Cards view', () => {
    cy.fetchAllItems(apiPath).then((all) => {
      cy.get('[data-cy="view-detailed"]').click()
      cy.get('[data-cy="gear-detailed-row"]').should('have.length', all.length)
    })
  })

  it('each panel carries the full spec sheet, not just the card summary', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').first().within(() => {
      cy.get('[data-cy="detail-brand"]').should('be.visible')
      cy.get('[data-cy="detail-name"]').should('be.visible')
      cy.get('[data-cy="spec-table"]').should('be.visible')
      cy.get('[data-cy="spec-row"]').should('have.length.greaterThan', 1)
    })
  })

  it('each panel keeps the Compare action, without the dead Save / Alert', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').first().within(() => {
      cy.get('[data-cy="btn-compare"]').should('be.visible')
      cy.get('[data-cy="btn-save"]').should('not.exist')
      cy.get('[data-cy="btn-alert"]').should('not.exist')
    })
  })

  it("each panel's name links to the item detail page", () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').first()
      .find('[data-cy="detail-name"]')
      .should('have.attr', 'href').and('match', new RegExp(`/${slug}/\\d+`))
  })

  it('panels appear in the same order as the cards they replace', () => {
    cy.get('[data-cy="gear-card-name"]').then(($cards) => {
      const cardNames = $cards.toArray().slice(0, 5).map((el) => el.textContent?.trim())
      cy.get('[data-cy="view-detailed"]').click()
      cy.get('[data-cy="gear-detailed-row"] [data-cy="detail-name"]').then(($rows) => {
        const rowNames = $rows.toArray().slice(0, 5).map((el) => el.textContent?.trim())
        expect(rowNames).to.deep.equal(cardNames)
      })
    })
  })

  it('switching back to Cards view restores the grid and drops the panels', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="view-cards"]').click()
    cy.get('[data-cy="gear-grid"]').should('be.visible')
    cy.get('[data-cy="gear-detailed-list"]').should('not.exist')
  })

  // The panels are unmounted (not merely hidden) while Cards is active, so they
  // can't contribute stray detail-* / spec-row nodes to assertions elsewhere.
  it('detailed panels are absent from the DOM while Cards view is active', () => {
    cy.get('[data-cy="gear-card"]').should('exist')
    cy.get('[data-cy="gear-detailed-row"]').should('not.exist')
    cy.get('[data-cy="spec-table"]').should('not.exist')
  })

  it('active filters apply in Detailed view as well as Cards view', () => {
    cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').should('not.exist')
    cy.get('[data-cy="empty-state"]').should('be.visible')
  })
  })
})

// ── Sticky filter sidebar ─────────────────────────────────────────────────────
// Behavioral assertions (Cypress can't read `position: sticky` from CSS): the
// sidebar must stay visible and usable while the results scroll, self-scroll so
// its tallest groups stay reachable, and never overlap the fixed CompareBar.
// Run against webbings — its sidebar (8 groups + stretch widget) is the tallest
// and the only one with the stretch-kn-pill that guards the inner-scroll rule.
describe('Gear listing page — sticky filter sidebar (webbings)', () => {
  beforeEach(() => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })

  // Scrolls a long way INTO the results rather than to the document bottom.
  // At the very bottom the flex row's own bottom edge arrives, and a sticky
  // element taller than the space left above it is then pushed up and out of
  // view — that is what `position: sticky` means, not a bug. This assertion used
  // to scroll to 'bottom' and so could never pass for webbings, whose sidebar is
  // the tallest in the app (measured -18px before the mobile work, -12px after).
  it('pins below the top nav after the results scroll', () => {
    cy.scrollTo(0, 2000)
    cy.get('[data-cy="top-nav"]').then(($nav) => {
      const navBottom = $nav[0].getBoundingClientRect().bottom
      cy.get('[data-cy="filter-sidebar"]').should('be.visible').then(($aside) => {
        const top = $aside[0].getBoundingClientRect().top
        expect(top).to.be.at.least(0)
        // Pinned just below the sticky nav (offset ~1rem), with tolerance.
        expect(top).to.be.at.most(navBottom + 24)
      })
    })
  })

  it('keeps filters usable while scrolled — no scroll back to top needed', () => {
    cy.scrollTo('bottom')
    cy.get('[data-cy="item-count"]').invoke('text').then((before) => {
      cy.get('[data-cy="filter-sidebar"] [data-cy="filter-pill"]').first().click()
      cy.get('[data-cy="item-count"]').invoke('text').should('not.eq', before)
    })
  })

  // The scroll region is the aside's lower half — the status bubble is pinned
  // above it (see gear_status.cy.ts), so the groups scroll under a fixed control.
  it('self-scrolls so the tallest groups stay reachable', () => {
    cy.scrollTo('bottom')
    cy.get('[data-cy="filter-sidebar"] [data-cy="filter-scroll"]').scrollTo('bottom')
    cy.get('[data-cy="stretch-kn-pill"]').first().should('be.visible')
  })

  it('does not collide with the CompareBar', () => {
    cy.get('[data-cy="gear-card"] [data-cy="btn-compare"]').eq(0).click()
    cy.get('[data-cy="gear-card"] [data-cy="btn-compare"]').eq(1).click()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
    cy.scrollTo('bottom')
    cy.get('[data-cy="compare-bar"]').then(($bar) => {
      const barTop = $bar[0].getBoundingClientRect().top
      cy.get('[data-cy="filter-sidebar"]').then(($aside) => {
        expect($aside[0].getBoundingClientRect().bottom).to.be.at.most(barTop)
      })
    })
  })
})

// ── Empty-state clear (webbings fixture) ──────────────────────────────────────
//
// The empty state's "Clear filters" clears the FILTERS and the status scope but
// KEEPS the search term: a dead end is nearly always the filters, so the words
// typed are the one thing worth carrying over. It navigates to the same route
// with only ?q= left. The sidebar's "Clear all" is the harder reset (covered per
// gear type above).

describe('Empty state — Clear filters keeps the search', () => {
  // A term that matches plenty, plus a weight bound nothing can satisfy.
  const DEAD_END = '/webbings?q=a&weight_min=999999'

  it('empties the grid to begin with', () => {
    cy.visit(DEAD_END)
    cy.get('[data-cy="empty-state"]').should('be.visible')
    cy.get('[data-cy="gear-card"]').should('not.exist')
  })

  it('brings the cards back while keeping the term in the box and the URL', () => {
    cy.visit(DEAD_END)
    cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').click()
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="search-input"]').should('have.value', 'a')
    cy.url().should('include', 'q=a')
    cy.url().should('not.include', 'weight_min')
  })

  it('still filters by the kept search term', () => {
    cy.visit(DEAD_END)
    cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').click()
    cy.fetchAllItems('webbing').then((all) => {
      // Same rule as utils/search: name OR brand, punctuation-insensitive.
      const norm = (s: unknown) =>
        String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[.\-()/ ]/g, '').toLowerCase()
      const matching = (all as Record<string, unknown>[]).filter(
        (it) => norm(it.name).includes('a') || norm(it.brand_name).includes('a'),
      )
      cy.get('[data-cy="item-count"]').should('contain.text', String(matching.length))
    })
  })

  it('resets the status bubble to ALL', () => {
    cy.visit(DEAD_END)
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').click()
    cy.get('[data-cy="status-all"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'false')
  })

  // The stretch widget resets through the same reset signal as the sidebar's
  // Clear all (asserted in filters.cy.ts) — it cannot be engaged from an already
  // empty grid, since its kN pills are derived from the items still in scope.
  it('leaves the sidebar filter pills deselected afterwards', () => {
    cy.visit('/webbings?q=a&material=Nylon&weight_min=999999')
    cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').click()
    cy.get('[data-cy="filter-pill"][data-active="true"]').should('not.exist')
    cy.url().should('not.include', 'material=')
  })
})

// The sidebar's Clear all keeps its harder semantics: search included, status
// back to ALL.
describe('Sidebar Clear all — resets the status bubble too', () => {
  it('returns to ALL after browsing Historic', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="status-historic"]').click()
    cy.get('[data-cy="filter-sidebar"]').find('[data-cy="clear-filters"]').click()
    cy.get('[data-cy="status-all"]').should('have.attr', 'data-active', 'true')
  })
})
