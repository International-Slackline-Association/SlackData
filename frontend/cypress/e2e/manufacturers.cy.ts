// Manufacturers page tests.
// The /brand/ endpoint provides manufacturer data.
//
// NOTE ON country: brands are still created on-the-fly by get_brand() with only a
// name, but a manufacturers.json enrichment pass now backfills country (and year
// founded / website / socials) onto those rows. So country IS populated today —
// unlike the gear-derived fields, which may still be empty. Every assertion below
// stays data-driven off the API rather than hardcoding that, so the suite keeps
// working whether or not the enrichment ran.
//
// The logo manifest is imported straight from src (same approach as
// cypress/support/images.ts) so logo assertions are anchored to the real vendored
// image set rather than to whatever the DOM claims about itself.

import manufacturerImages from '../../src/data/manufacturerImages.json'

// canonical brand name -> stored logo filename
const LOGO_MANIFEST = manufacturerImages as Record<string, string>

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

  // The Cards/List view toggle was removed — the directory is grid-only now, and
  // that toolbar slot holds the sort control instead.
  it('does not render a view toggle', () => {
    cy.get('[data-cy="view-list"]').should('not.exist')
    cy.get('[data-cy="view-grid"]').should('not.exist')
  })

  it('renders a sort control', () => {
    cy.get('[data-cy="manufacturer-sort"]').should('be.visible')
  })

  it('defaults the sort to gear quantity', () => {
    cy.get('[data-cy="manufacturer-sort"]').should('have.value', 'gear')
  })

  it('offers gear, name, country and year sort options', () => {
    cy.get('[data-cy="manufacturer-sort"] option').then(($opts) => {
      const values = $opts.toArray().map(o => (o as HTMLOptionElement).value)
      expect(values).to.include.members(['gear', 'name', 'country', 'year'])
    })
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
  // get_brand() still creates brands with only a `name`, but the manufacturers.json
  // enrichment pass backfills `country` onto those rows afterwards — so country IS
  // populated today and these tests exercise the populated branch. The filter group
  // must nonetheless stay data-driven: render only the country values that actually
  // appear, and disappear entirely if none do (which is what the pre-enrichment
  // dataset looked like, and what a fresh DB looks like before enrichment runs).

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

  // ── Default ordering ──────────────────────────────────────────────────────
  // Manufacturers are listed by total gear count, largest first — the directory's
  // most useful default (the brands you're most likely to want are the ones with
  // the deepest catalogue). Asserted off the cards' own data-count-* attributes
  // rather than by recomputing from the API, so this pins the rendered order
  // directly.

  const totalOn = ($card: JQuery<HTMLElement>) =>
    ['webbings', 'weblocks', 'rollers', 'leashrings',
     'grips', 'treepros', 'starterkits', 'tricklinekits']
      .reduce((sum, slug) => sum + Number($card.attr(`data-count-${slug}`) ?? '0'), 0)

  it('lists manufacturers by total gear count, descending, by default', () => {
    cy.get('[data-cy="manufacturers-card"]').then(($cards) => {
      const totals = $cards.toArray().map(el => totalOn(Cypress.$(el)))
      const sorted = [...totals].sort((a, b) => b - a)
      expect(totals, 'card order is by total gear desc').to.deep.equal(sorted)
    })
  })

  it('the first manufacturer card has the largest inventory', () => {
    cy.get('[data-cy="manufacturers-card"]').then(($cards) => {
      const totals = $cards.toArray().map(el => totalOn(Cypress.$(el)))
      expect(totals[0]).to.equal(Math.max(...totals))
      expect(totals[0], 'top brand actually has gear').to.be.greaterThan(0)
    })
  })

  const namesInOrder = () =>
    cy.get('[data-cy="manufacturer-name"]').then($els =>
      $els.toArray().map(el => el.textContent!.trim()),
    )

  it('sorting by name orders manufacturers alphabetically', () => {
    cy.get('[data-cy="manufacturer-sort"]').select('name')
    namesInOrder().then((names) => {
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).to.deep.equal(sorted)
    })
  })

  it('sorting by country groups them alphabetically by country', () => {
    cy.get('[data-cy="manufacturer-sort"]').select('country')
    cy.get('[data-cy="manufacturers-card"]').then(($cards) => {
      const countries = $cards.toArray()
        .map(el => Cypress.$(el).find('[data-cy="manufacturer-flag"]').attr('data-country') ?? '')
      // Brands with no country sort last, so ignore the trailing blanks.
      const named = countries.filter(c => c !== '')
      const sorted = [...named].sort((a, b) => a.localeCompare(b))
      expect(named).to.deep.equal(sorted)
    })
  })

  it('sorting by year established orders oldest first, undated last', () => {
    cy.get('[data-cy="manufacturer-sort"]').select('year')
    cy.get('[data-cy="manufacturers-card"]').then(($cards) => {
      const years = $cards.toArray().map((el) => {
        const raw = Cypress.$(el).find('[data-cy="manufacturer-founded"]').text().replace(/\D/g, '')
        return raw ? Number(raw) : null
      })
      const dated = years.filter((y): y is number => y != null)
      expect(dated, 'dated brands are ascending').to.deep.equal([...dated].sort((a, b) => a - b))
      // Every dated brand must appear before every undated one.
      const firstUndated = years.indexOf(null)
      if (firstUndated !== -1) {
        expect(years.slice(firstUndated).every(y => y == null), 'undated all trail').to.be.true
      }
    })
  })

  it('switching sort back to gear restores the quantity order', () => {
    cy.get('[data-cy="manufacturer-sort"]').select('name')
    cy.get('[data-cy="manufacturer-sort"]').select('gear')
    cy.get('[data-cy="manufacturers-card"]').then(($cards) => {
      const totals = $cards.toArray().map(el => totalOn(Cypress.$(el)))
      expect(totals).to.deep.equal([...totals].sort((a, b) => b - a))
    })
  })

  // ── Active / inactive status ──────────────────────────────────────────────
  // Brand.active is backfilled from the reviewed manufacturers.json. It is a
  // plain bool (never null), so "still trading" and "never checked" are the same
  // value — the badge therefore marks only the negative case.

  it('every card reflects the API active flag as data-active', () => {
    cy.fetchAllItems('brand').then((all) => {
      const byName = new Map(
        (all as Record<string, unknown>[]).map(b => [b.name as string, b.active as boolean]),
      )
      cy.get('[data-cy="manufacturers-card"]').each(($card) => {
        const name = $card.find('[data-cy="manufacturer-name"]').text().trim()
        if (!byName.has(name)) return
        expect($card.attr('data-active'), `data-active for ${name}`)
          .to.equal(String(byName.get(name)))
      })
    })
  })

  it('an inactive brand shows an Inactive badge; an active one does not', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const dead = brands.find(b => b.active === false)
      const alive = brands.find(b => b.active === true)

      if (dead) {
        cy.get('[data-cy="manufacturers-card"]')
          .contains('[data-cy="manufacturer-name"]', dead.name as string)
          .closest('[data-cy="manufacturers-card"]')
          .find('[data-cy="manufacturer-inactive"]')
          .should('be.visible')
      }
      if (alive) {
        cy.get('[data-cy="manufacturers-card"]')
          .contains('[data-cy="manufacturer-name"]', alive.name as string)
          .closest('[data-cy="manufacturers-card"]')
          .find('[data-cy="manufacturer-inactive"]')
          .should('not.exist')
      }
    })
  })

  // ── Manufacturer logo ─────────────────────────────────────────────────────
  //
  // The manufacturer card reuses the gear card's shell (DESIGN.md → Manufacturers
  // Page), so it has the same fixed-height image area. Logos are vendored under
  // public/manufacturer-images/ and keyed by our CANONICAL brand slug; the
  // manifest (src/data/manufacturerImages.json) is the source of truth for which
  // brands have one. Brands without a logo keep the area and show a placeholder,
  // so cards in a row can't end up different heights.

  it('every card has an image area', () => {
    cy.fetchAllItems('brand').then((all) => {
      cy.get('[data-cy="manufacturer-image-area"]').should('have.length', all.length)
    })
  })

  it('a brand with a logo in the manifest renders it from /manufacturer-images/', () => {
    const withLogo = Object.keys(LOGO_MANIFEST)
    expect(withLogo.length, 'manifest is non-empty').to.be.greaterThan(0)

    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      // A brand that both exists in our DB and has a logo on disk.
      const target = brands.find(b => withLogo.includes(b.name as string))
      if (!target) return

      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', target.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="manufacturer-logo"]')
        .should('have.attr', 'src')
        .and('include', '/manufacturer-images/')
    })
  })

  it('a brand with no logo shows a placeholder instead of an empty area', () => {
    const withLogo = Object.keys(LOGO_MANIFEST)
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const target = brands.find(b => !withLogo.includes(b.name as string))
      if (!target) return // every brand has a logo — nothing to assert

      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', target.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="manufacturer-logo-placeholder"]')
        .should('exist')
    })
  })

  // ── Country flag ──────────────────────────────────────────────────────────
  //
  // Brand.country stores the Country enum's FULL NAME ("Germany"), and the
  // frontend maps that to an ISO alpha-2 code to resolve /flags/{cc}.png. These
  // tests deliberately do NOT duplicate that mapping: they assert the flag
  // resolves to a /flags/*.png and that its accessible name is the country the
  // API reports, which pins the linkage without re-implementing it.

  it('a brand with a country shows a flag on its card', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const target = brands.find(b => b.country != null)
      if (!target) {
        cy.get('[data-cy="manufacturer-flag"]').should('not.exist')
        return
      }

      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', target.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="manufacturer-flag"]')
        .should('be.visible')
        .and('have.attr', 'src')
        .and('match', /\/flags\/[a-z]{2}\.png$/)
    })
  })

  it('the flag carries the country name as its accessible name', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const target = brands.find(b => b.country != null)
      if (!target) return

      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', target.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="manufacturer-flag"]')
        .should('have.attr', 'alt', target.country as string)
    })
  })

  it('a brand with no country shows no flag at all', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const target = brands.find(b => b.country == null)
      if (!target) return // every brand has a country — nothing to assert

      cy.get('[data-cy="manufacturers-card"]')
        .contains('[data-cy="manufacturer-name"]', target.name as string)
        .closest('[data-cy="manufacturers-card"]')
        .find('[data-cy="manufacturer-flag"]')
        .should('not.exist')
    })
  })

  it('every rendered flag belongs to a brand the API reports a country for', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const withCountry = new Set(
        brands.filter(b => b.country != null).map(b => b.name as string),
      )
      cy.get('[data-cy="manufacturers-card"]').each(($card) => {
        const name = $card.find('[data-cy="manufacturer-name"]').text().trim()
        const flags = $card.find('[data-cy="manufacturer-flag"]').length
        expect(flags, `flag count for ${name}`).to.equal(withCountry.has(name) ? 1 : 0)
      })
    })
  })

  // ── Stored country data ───────────────────────────────────────────────────
  // Country is backfilled onto Brand rows from manufacturers.json. These pin the
  // storage contract itself, independent of how the card renders it.

  it('the brand API serves country values from the Country enum, not ISO codes', () => {
    cy.fetchAllItems('brand').then((all) => {
      const brands = all as Record<string, unknown>[]
      const countries = brands.map(b => b.country).filter(c => c != null) as string[]
      if (countries.length === 0) return
      // Full names ("Germany"), never 2-letter codes ("DE").
      countries.forEach((c) => {
        expect(c.length, `country "${c}" should be a full name`).to.be.greaterThan(2)
      })
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
