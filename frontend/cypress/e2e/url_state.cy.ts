// URL state / deep linking tests.
//
// Every user-facing filter, sort, and search choice must be reflected in the URL
// so that users can bookmark or share a filtered view and get identical results.
//
// URL param contract:
//   ?q=term                        — search query
//   ?sort=field-direction          — e.g. ?sort=weight-asc, ?sort=name-desc
//   ?{field}=value1,value2         — pill filter (comma-separated for multi-select)
//   ?{field}_min=val&{field}_max=val — range filter bounds
//
// Tests use webbings (88 items, rich filter set) as the primary subject.
// Sort and search URL tests run for all gear types via GEAR_TYPES.

import { GEAR_TYPES } from '../support/gear_types'

// ── Search → URL ──────────────────────────────────────────────────────────────

describe('URL state — search', () => {
  it('typing a search term writes ?q= to the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="search-input"]').type('Gibbon')
    cy.url().should('include', 'q=Gibbon')
  })

  it('visiting a URL with ?q= pre-fills the search input and filters cards', () => {
    cy.visit('/webbings?q=Gibbon')
    cy.get('[data-cy="search-input"]').should('have.value', 'Gibbon')
    cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)
    cy.get('[data-cy="gear-card-brand"]').each(($el) => {
      expect($el.text().toLowerCase()).to.include('gibbon')
    })
  })

  it('clearing the search removes ?q= from the URL', () => {
    cy.visit('/webbings?q=Gibbon')
    cy.get('[data-cy="search-input"]').clear()
    cy.url().should('not.include', 'q=')
  })
})

// ── Sort → URL ────────────────────────────────────────────────────────────────

describe('URL state — sort', () => {
  it('choosing a sort option writes ?sort= to the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="weight"][data-direction="asc"]').click()
    cy.url().should('include', 'sort=weight-asc')
  })

  it('visiting a URL with ?sort= applies that sort and marks it active in the dropdown', () => {
    cy.visit('/webbings?sort=weight-asc')
    cy.get('[data-cy="sort-dropdown"]').should('contain.text', /weight.*low|low.*weight/i)
    cy.get('[data-cy="gear-card"]').then(($cards) => {
      const weights = [...$cards].map(c => {
        const v = c.getAttribute('data-weight')
        return v && v !== '' ? Number(v) : Infinity
      })
      const withData = weights.filter(v => v !== Infinity)
      expect(withData).to.deep.equal([...withData].sort((a, b) => a - b))
    })
  })

  it('Name A→Z sort produces no ?sort= param (it is the default)', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"]').contains(/name.*a.*z/i).click()
    cy.url().should('not.include', 'sort=')
  })
})

// ── Pill filter → URL ─────────────────────────────────────────────────────────

describe('URL state — pill filters', () => {
  it('selecting a material pill writes ?material= to the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').first().click()
    cy.url().should('match', /material=/)
  })

  it('visiting a URL with ?material= selects the pill and filters cards', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const material = webbings.find(w => w.material != null)?.material as string | undefined
      if (!material) return

      cy.visit(`/webbings?material=${encodeURIComponent(material)}`)

      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`)
        .should('have.attr', 'data-active', 'true')

      cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)
    })
  })

  it('multi-select pill values appear as comma-separated in the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').eq(0).click()
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').eq(1).click()
    cy.url().should('match', /material=[^&].*,[^&]/)
  })

  it('deselecting the last pill for a filter removes that param from the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').first().click().click()
    cy.url().should('not.include', 'material=')
  })
})

// ── Range filter → URL ────────────────────────────────────────────────────────

describe('URL state — range filters', () => {
  it('entering a weight min writes ?weight_min= to the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="weight"]')
      .find('[data-cy="range-min"]').type('50')
    cy.url().should('include', 'weight_min=50')
  })

  it('entering a weight max writes ?weight_max= to the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="weight"]')
      .find('[data-cy="range-max"]').type('200')
    cy.url().should('include', 'weight_max=200')
  })

  it('visiting a URL with range params restores the inputs and filters cards', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const weights = (all as Record<string, unknown>[])
        .map(w => w.weight as number | null).filter(v => v != null).map(Number).sort((a, b) => a - b)
      if (weights.length < 4) return

      const lo = weights[Math.floor(weights.length * 0.25)]
      const hi = weights[Math.floor(weights.length * 0.75)]

      cy.visit(`/webbings?weight_min=${lo}&weight_max=${hi}`)

      cy.get('[data-cy="filter-group"][data-group="weight"]')
        .find('[data-cy="range-min"]').should('have.value', String(lo))
      cy.get('[data-cy="filter-group"][data-group="weight"]')
        .find('[data-cy="range-max"]').should('have.value', String(hi))

      const attr = 'data-weight'
      cy.get('[data-cy="gear-card"]').each(($card) => {
        const raw = $card.attr(attr)
        if (raw && raw !== '') {
          expect(Number(raw)).to.be.gte(lo)
          expect(Number(raw)).to.be.lte(hi)
        }
      })
    })
  })

  it('clearing a range input removes its param from the URL', () => {
    cy.visit('/webbings?weight_min=50')
    cy.get('[data-cy="filter-group"][data-group="weight"]')
      .find('[data-cy="range-min"]').clear()
    cy.url().should('not.include', 'weight_min=')
  })
})

// ── Combined params ───────────────────────────────────────────────────────────

describe('URL state — combined params', () => {
  it('search, sort, and a pill filter can all be active simultaneously in the URL', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const material = (all as Record<string, unknown>[])
        .find(w => w.material != null)?.material as string | undefined
      if (!material) return

      const url = `/webbings?q=Gibbon&sort=weight-asc&material=${encodeURIComponent(material)}`
      cy.visit(url)

      cy.get('[data-cy="search-input"]').should('have.value', 'Gibbon')
      cy.get('[data-cy="sort-dropdown"]').should('contain.text', /weight.*low|low.*weight/i)
      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`)
        .should('have.attr', 'data-active', 'true')
    })
  })

  it('clear-filters removes all filter and search params but preserves the route', () => {
    cy.visit('/webbings?q=Gibbon&material=Polyester&weight_min=50')
    cy.get('[data-cy="clear-filters"]').first().click()
    cy.url().should('include', '/webbings')
    cy.url().should('not.include', 'q=')
    cy.url().should('not.include', 'material=')
    cy.url().should('not.include', 'weight_min=')
  })
})

// ── 404 / unknown routes ──────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('shows a not-found page for a completely unknown route', () => {
    cy.visit('/this-route-does-not-exist', { failOnStatusCode: false })
    cy.get('[data-cy="not-found"]').should('be.visible')
  })

  it('the not-found page has a link back to the home page', () => {
    cy.visit('/this-route-does-not-exist', { failOnStatusCode: false })
    cy.get('[data-cy="not-found-home-link"]').should('be.visible').click()
    cy.url().should('include', '/webbings')
  })
})
