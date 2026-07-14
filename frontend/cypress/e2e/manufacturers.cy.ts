// Manufacturers page tests.
// The /brand/ endpoint provides manufacturer data.
// Each brand in the DB was created on-the-fly from gear JSON, so
// country/website/etc may be empty — we only assert on what the API guarantees.

describe('Manufacturers page', () => {
  const api = () => Cypress.env('apiUrl')

  beforeEach(() => {
    cy.visit('/manufacturers')
  })

  // ── Page structure ────────────────────────────────────────────────────────

  it('renders the manufacturers page at /manufacturers', () => {
    cy.url().should('include', '/manufacturers')
  })

  it('shows the top nav', () => {
    cy.get('[data-cy="top-nav"]').should('be.visible')
  })

  it('shows the Manufacturers link as active in the nav', () => {
    cy.get('[data-cy="manufacturers-link"]').should('have.attr', 'data-active', 'true')
  })

  it('renders a List view toggle', () => {
    cy.get('[data-cy="view-list"]').should('be.visible')
  })

  it('defaults to List view active', () => {
    cy.get('[data-cy="view-list"]').should('have.attr', 'data-active', 'true')
  })

  // ── Data-driven: card count matches API ───────────────────────────────────

  it('renders one card per brand returned by the API', () => {
    cy.fetchAllItems('brand').then((all) => {
      cy.get('[data-cy="manufacturers-card"]').should('have.length', all.length)
    })
  })

  // ── Manufacturer card anatomy ─────────────────────────────────────────────

  it('each card shows the brand name', () => {
    cy.request(`${api()}/brand/?limit=1`).then(({ body }) => {
      const brand = body[0]
      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', brand.name)
        .should('be.visible')
    })
  })

  it('each card shows a View Gear button', () => {
    cy.get('[data-cy="manufacturers-card"]').first()
      .find('[data-cy="btn-view-gear"]').should('be.visible')
  })

  it('View Gear button navigates to a page showing only that brand\'s gear', () => {
    cy.request(`${api()}/brand/?limit=1`).then(({ body }) => {
      const brand = body[0] as Record<string, unknown>
      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', brand.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="btn-view-gear"]').click()

      // The page must either be a brand detail page or a filtered gear listing.
      // Regardless of route shape, every visible gear card must belong to this brand.
      cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)
      cy.get('[data-cy="gear-card-brand"]').each(($el) => {
        expect($el.text().trim()).to.equal(brand.name as string)
      })
    })
  })

  it('each card shows a gear-count row listing how many items the brand has', () => {
    cy.get('[data-cy="manufacturers-card"]').first()
      .find('[data-cy="manufacturer-gear-counts"]')
      .should('exist')
  })

  // ── Filters ───────────────────────────────────────────────────────────────
  //
  // The Brand model (slack_data/models/brands.py) has `country: Country | None`.
  // There is no `continent` field anywhere in the schema — an earlier version
  // of this test guessed at a "continent" filter against a field that doesn't
  // exist, which is exactly backwards: filter design must follow the model,
  // not be invented and reconciled against it after the fact.
  //
  // Per CLAUDE.md, brands are created on-the-fly by get_brand() with only a
  // `name` — country is essentially never populated by the current loaders.
  // So in real data today, most/all brands have country == null. The filter
  // group must therefore degrade gracefully: render only the country values
  // that actually appear in the data, and disappear entirely if none do.

  it('renders a country filter only for country values present in the data', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const countries = new Set(brands.map(b => b.country).filter(c => c != null))

      if (countries.size === 0) {
        cy.get('[data-cy="filter-group"][data-group="country"]').should('not.exist')
        return
      }

      cy.get('[data-cy="filter-group"][data-group="country"]')
        .find('[data-cy="filter-pill"]')
        .should('have.length', countries.size)
    })
  })

  it('filtering by a real country value shows exactly the matching brands', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const withCountry = brands.find(b => b.country != null)

      if (!withCountry) {
        // No brand has country populated in this dataset — nothing to filter.
        // This is the expected state today per CLAUDE.md; assert the group
        // is absent rather than silently passing a no-op assertion.
        cy.get('[data-cy="filter-group"][data-group="country"]').should('not.exist')
        return
      }

      const countryValue = withCountry.country as string
      const expectedCount = brands.filter(b => b.country === countryValue).length

      cy.get('[data-cy="filter-group"][data-group="country"]')
        .find('[data-cy="filter-pill"]').contains(countryValue).click()

      cy.get('[data-cy="manufacturers-card"]').should('have.length', expectedCount)

      // Verify it's the RIGHT brands, not just the right count
      cy.get('[data-cy="manufacturer-name"]').each(($el) => {
        const name = $el.text()
        const matchedBrand = brands.find(b => b.name === name)
        expect(matchedBrand?.country).to.equal(countryValue)
      })
    })
  })

  // ── Search ────────────────────────────────────────────────────────────────

  it('renders a search input on the manufacturers page', () => {
    cy.get('[data-cy="manufacturer-search"]').should('be.visible')
  })

  it('typing a brand name filters manufacturer cards to matching names', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const term = (brands[0].name as string).slice(0, 4)
      cy.get('[data-cy="manufacturer-search"]').type(term)
      cy.get('[data-cy="manufacturers-card"]').each(($card) => {
        cy.wrap($card).find('[data-cy="manufacturer-name"]')
          .invoke('text')
          .then((name) => expect(name.toLowerCase()).to.include(term.toLowerCase()))
      })
    })
  })

  it('manufacturer search is case-insensitive', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const term = (brands[0].name as string).slice(0, 4).toUpperCase()
      cy.get('[data-cy="manufacturer-search"]').type(term)
      cy.get('[data-cy="manufacturers-card"]').should('have.length.gte', 1)
    })
  })

  it('shows empty state when manufacturer search matches nothing', () => {
    cy.get('[data-cy="manufacturer-search"]').type('xqzxqzxqzxqz_no_match')
    cy.get('[data-cy="manufacturers-card"]').should('not.exist')
    cy.get('[data-cy="empty-state"]').should('be.visible')
  })

  it('clearing the manufacturer search restores all brands', () => {
    cy.fetchAllItems('brand').then((all) => {
      cy.get('[data-cy="manufacturer-search"]').type('xqzxqzxqzxqz_no_match').clear()
      cy.get('[data-cy="manufacturers-card"]').should('have.length', all.length)
    })
  })

  // ── Gear count accuracy ───────────────────────────────────────────────────
  // Each manufacturer card shows how many items of each gear type that brand
  // has. These counts are verified against the real backend data.

  it('the gear counts on a manufacturer card match the actual API counts', () => {
    const apiUrl = Cypress.env('apiUrl')
    const gearTypes = [
      { apiPath: 'webbing',      attr: 'data-count-webbings'      },
      { apiPath: 'weblock',      attr: 'data-count-weblocks'      },
      { apiPath: 'roller',       attr: 'data-count-rollers'       },
      { apiPath: 'leashring',    attr: 'data-count-leashrings'    },
      { apiPath: 'grip',         attr: 'data-count-grips'         },
      { apiPath: 'treepro',      attr: 'data-count-treepros'      },
      { apiPath: 'starterkit',   attr: 'data-count-starterkits'   },
      { apiPath: 'tricklinekit', attr: 'data-count-tricklinekits' },
    ]

    // Pick the first brand from the API
    cy.request(`${apiUrl}/brand/?limit=1`).then(({ body }) => {
      const brand = body[0] as Record<string, unknown>
      const brandName = brand.name as string

      // For each gear type, count items belonging to this brand
      const counts: Record<string, number> = {}
      gearTypes.forEach(({ apiPath, attr }) => {
        cy.fetchAllItems(apiPath).then((all) => {
          counts[attr] = (all as Record<string, unknown>[])
            .filter(item => item.brand_name === brandName).length
        })
      })

      // After all counts are collected, verify the card displays them correctly
      cy.then(() => {
        cy.get('[data-cy="manufacturers-card"]')
          .contains('[data-cy="manufacturer-name"]', brandName)
          .closest('[data-cy="manufacturers-card"]')
          .then(($card) => {
            gearTypes.forEach(({ attr }) => {
              const displayed = Number($card.attr(attr) ?? '0')
              expect(displayed).to.equal(counts[attr])
            })
          })
      })
    })
  })
})
