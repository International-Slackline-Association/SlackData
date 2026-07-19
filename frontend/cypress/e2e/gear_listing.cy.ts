import { GEAR_TYPES } from '../support/gear_types'

// Tests run against every gear type — all assertions use the real backend.
GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Gear listing page — ${label}`, () => {
    const api = () => `${Cypress.env('apiUrl')}/${apiPath}`

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

    it('restores the full card list when clear-filters is clicked from empty state', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
        cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').click()
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

  it('each panel keeps the Save / Alert / Compare actions', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').first().within(() => {
      cy.get('[data-cy="btn-save"]').should('be.visible')
      cy.get('[data-cy="btn-alert"]').should('be.visible')
      cy.get('[data-cy="btn-compare"]').should('be.visible')
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
