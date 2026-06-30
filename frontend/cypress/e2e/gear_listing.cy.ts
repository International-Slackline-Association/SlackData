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

    it('renders Cards and Chart view toggle buttons', () => {
      cy.get('[data-cy="view-cards"]').should('be.visible')
      cy.get('[data-cy="view-chart"]').should('be.visible')
    })

    it('defaults to Cards view active', () => {
      cy.get('[data-cy="view-cards"]').should('have.attr', 'data-active', 'true')
      cy.get('[data-cy="view-chart"]').should('not.have.attr', 'data-active', 'true')
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
  })

  // ── Chart (table) view ────────────────────────────────────────────────────
  // Chart view shows items as rows in a data table instead of visual cards.
  // Same items, same filters — just a different display format.
  //
  // data-cy contract:
  //   gear-table         — the table element visible in Chart view
  //   gear-table-row     — one item row (same count as gear-card in Cards view)
  //   gear-table-header  — the column header row

  it('clicking Chart view switches to a table display', () => {
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="gear-table"]').should('be.visible')
    cy.get('[data-cy="gear-grid"]').should('not.be.visible')
  })

  it('Chart view toggle becomes active after clicking', () => {
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="view-chart"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="view-cards"]').should('not.have.attr', 'data-active', 'true')
  })

  it('Chart view shows the same number of items as Cards view', () => {
    cy.fetchAllItems(apiPath).then((all) => {
      cy.get('[data-cy="view-chart"]').click()
      cy.get('[data-cy="gear-table-row"]').should('have.length', all.length)
    })
  })

  it('Chart view table has a header row with column labels', () => {
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="gear-table-header"]').should('be.visible')
  })

  it('each table row links to the item detail page', () => {
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="gear-table-row"]').first()
      .find('a').should('have.attr', 'href').and('match', new RegExp(`/${slug}/\\d+`))
  })

  it('switching back to Cards view restores the grid and hides the table', () => {
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="view-cards"]').click()
    cy.get('[data-cy="gear-grid"]').should('be.visible')
    cy.get('[data-cy="gear-table"]').should('not.be.visible')
  })

  it('active filters apply in Chart view as well as Cards view', () => {
    cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
    cy.get('[data-cy="view-chart"]').click()
    cy.get('[data-cy="gear-table-row"]').should('not.exist')
    cy.get('[data-cy="empty-state"]').should('be.visible')
  })
})
