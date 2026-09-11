// URL state / deep linking tests.
//
// Every user-facing filter, sort, and search choice must be reflected in the URL
// so that users can bookmark or share a filtered view and get identical results.
//
// URL param contract:
//   ?q=term                        — search query
//   ?sort=field-direction          — e.g. ?sort=weight-asc, ?sort=name-desc
//   ?view=detailed|table           — listing mode (Cards writes no param)
//   ?status=current|historic       — lifecycle scope (ALL writes no param)
//   ?compare=3,1,9                 — a compare selection to OPEN WITH (read on
//                                    mount only; ticking a box never writes it)
//   ?kn=10                         — webbing stretch: the engaged reference kN
//   ?stretch_min=&?stretch_max=    — webbing stretch: % bounds at that kN
//   ?{field}=value1,value2         — pill filter (comma-separated for multi-select)
//   ?{field}_min=val&{field}_max=val — range filter bounds
//
// Tests use webbings (88 items, rich filter set) as the primary subject.
// Sort and search URL tests run for all gear types via GEAR_TYPES.


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
    // contain.text needs a plain string — a RegExp is coerced to its literal
    // source and never matches (see search_sort.cy.ts). Button shows "Weight: Low→High".
    cy.get('[data-cy="sort-dropdown"]').should('contain.text', 'Weight: Low→High')
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
      // `material` is a multi-select list — each pill is a single fiber.
      const material = webbings
        .map(w => w.material as string[] | null)
        .find(m => m != null && m.length > 0)?.[0]
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
    // URLSearchParams encodes the comma separator as %2C in the raw URL; assert on
    // the decoded value, which is what round-trips back into the filter.
    cy.location('search').should((search) => {
      const material = new URLSearchParams(search).get('material')
      expect(material).to.match(/[^,]+,[^,]+/)
    })
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
  // Range bounds are dual-thumb sliders (the thumbs have pointer-events:none and
  // can't be typed into). An exact bound is set via the click-to-edit value label
  // (data-cy="range-{min,max}-value"), which is the Phase-4 contract in filters.cy.ts.
  const weight = '[data-cy="filter-group"][data-group="weight"]'

  // A range domain is derived from the items, so until the fetch lands both
  // thumbs sit on a placeholder domain. Editing a bound before then is not a
  // slow test but a wrong one: the typed value can BE the placeholder domain's
  // edge, an edge bound is dropped from the URL as a no-op (asserted two tests
  // below), and the thumb then springs to the real domain's edge when the items
  // arrive. That is exactly how this spec failed on main — an entered 50 read
  // back as 19, the real minimum weight, with no `weight_min` in the URL.
  //
  // Waiting on the domain rather than on the fetch: `max` and `min` are equal
  // (both 0) until real numbers arrive. filters.cy.ts guards every editable-bound
  // test the same way.
  const domainReady = () =>
    cy.get(weight).find('[data-cy="range-max"]').should(($el) => {
      expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
    })

  it('entering a weight min writes ?weight_min= to the URL', () => {
    cy.visit('/webbings')
    domainReady()
    cy.get(weight).find('[data-cy="range-min-value"]').click()
    cy.get(weight).find('input[data-cy="range-min-value"]').clear().type('50{enter}')
    // Wait for the commit to round-trip through the URL back onto the thumb before
    // asserting on the URL — otherwise the assertion can race the async param write.
    cy.get(weight).find('[data-cy="range-min"]').should('have.value', '50')
    cy.url().should('include', 'weight_min=50')
  })

  it('entering a weight max writes ?weight_max= to the URL', () => {
    cy.visit('/webbings')
    domainReady()
    cy.get(weight).find('[data-cy="range-max-value"]').click()
    cy.get(weight).find('input[data-cy="range-max-value"]').clear().type('150{enter}')
    cy.get(weight).find('[data-cy="range-max"]').should('have.value', '150')
    cy.url().should('include', 'weight_max=150')
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

  it('resetting a range bound to its domain edge removes its param from the URL', () => {
    cy.visit('/webbings?weight_min=50')
    // A thumb parked at its domain bound means "no constraint" — setting the min
    // back to the domain low drops the param. Read the low off the thumb's min attr.
    cy.get(weight).find('[data-cy="range-min"]').invoke('attr', 'min').then((lo) => {
      cy.get(weight).find('[data-cy="range-min-value"]').click()
      cy.get(weight).find('input[data-cy="range-min-value"]').clear().type(`${lo}{enter}`)
      cy.url().should('not.include', 'weight_min=')
    })
  })
})

// ── Combined params ───────────────────────────────────────────────────────────

describe('URL state — combined params', () => {
  it('search, sort, and a pill filter can all be active simultaneously in the URL', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const material = (all as Record<string, unknown>[])
        .map(w => w.material as string[] | null)
        .find(m => m != null && m.length > 0)?.[0]
      if (!material) return

      const url = `/webbings?q=Gibbon&sort=weight-asc&material=${encodeURIComponent(material)}`
      cy.visit(url)

      cy.get('[data-cy="search-input"]').should('have.value', 'Gibbon')
      cy.get('[data-cy="sort-dropdown"]').should('contain.text', 'Weight: Low→High')
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

// ── Status scope + the stretch widget → URL ───────────────────────────────────
//
// Both were component state until they cost a real complaint: a filter that is
// not in the URL cannot be shared, and quietly reverts when you come back to the
// listing from an item. See navigation.cy.ts for the Back half of this.

describe('URL state — status scope', () => {
  it('picking a scope writes ?status=', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="status-historic"]').click()
    cy.url().should('include', 'status=historic')
  })

  it('ALL writes no param — a bare listing URL stays canonical', () => {
    cy.visit('/webbings?status=historic')
    cy.get('[data-cy="status-all"]').click()
    cy.url().should('not.include', 'status=')
  })

  it('visiting a URL with ?status= applies that scope', () => {
    cy.visit('/webbings?status=historic')
    cy.get('[data-cy="status-historic"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="gear-card"]').first().find('[data-cy="legacy-badge"]').should('exist')
  })

  it('an unrecognised ?status= shows the listing at ALL rather than 404ing', () => {
    cy.visit('/webbings?status=nonsense')
    cy.get('[data-cy="status-all"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })
})

describe('URL state — webbing stretch widget', () => {
  const stretch = '[data-cy="filter-group"][data-group="stretch"]'

  it('engaging a kN pill writes ?kn=, and deselecting it drops the params', () => {
    cy.visit('/webbings')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first().click()
    cy.url().should('include', 'kn=')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"][data-active="true"]').click()
    cy.url().should('not.include', 'kn=')
  })

  it('a deep-linked ?kn= engages that pill and its filter', () => {
    cy.visit('/webbings')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first()
      .invoke('attr', 'data-kn')
      .then((kn) => {
        cy.visit(`/webbings?kn=${kn}`)
        cy.get(stretch)
          .find(`[data-cy="stretch-kn-pill"][data-kn="${kn}"][data-active="true"]`)
          .should('exist')
        // The % slider only exists once a kN is engaged, and cards only carry a
        // stretch % then — so both are proof the deep link engaged the widget.
        cy.get(stretch).find('[data-cy="range-min"]').should('exist')
        cy.get('[data-cy="gear-card"]').first().should('have.attr', 'data-stretch-percent')
      })
  })

  // The % bounds are a dual-thumb slider (dragging it is range_slider.cy.ts's
  // job); what matters here is that the params it writes are read back.
  it('a deep-linked % bound seeds the slider and narrows the grid', () => {
    cy.visit('/webbings')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first()
      .invoke('attr', 'data-kn')
      .then((kn) => {
        cy.visit(`/webbings?kn=${kn}`)
        cy.get(stretch).find('[data-cy="range-min"]').should('exist')
        // Read the count only once the grid has actually arrived — the toolbar
        // says "0 items" while the fetch is in flight.
        cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
        cy.get('[data-cy="item-count"]').invoke('text').then((countText) => {
          const engaged = Number(countText.replace(/\D/g, ''))
          cy.get(stretch).find('[data-cy="range-min"]').then(($min) => {
            const lo = Number($min.attr('min'))
            const hi = Number($min.attr('max'))
            const mid = Math.round(lo + (hi - lo) / 2)
            cy.visit(`/webbings?kn=${kn}&stretch_min=${mid}`)
            cy.get(stretch).find('[data-cy="range-min"]').should('have.value', String(mid))
            cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
            cy.get('[data-cy="item-count"]').invoke('text').should((t) => {
              expect(Number(t.replace(/\D/g, ''))).to.be.lessThan(engaged)
            })
          })
        })
      })
  })

  it('deselecting the kN drops the % bounds with it', () => {
    cy.visit('/webbings')
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first()
      .invoke('attr', 'data-kn')
      .then((kn) => {
        cy.visit(`/webbings?kn=${kn}&stretch_min=4`)
        cy.get(stretch).find('[data-cy="stretch-kn-pill"][data-active="true"]').click()
        cy.url().should('not.include', 'stretch_min=')
      })
  })
})

// ── Compare selection ─────────────────────────────────────────────────────────
//
// The picks are a list you build over several minutes. They live in component
// state and the URL is READ for them but never written: a param write re-runs
// every memo keyed off the query string — both filter passes, the sort, and the
// table view's column set — so ticking one box re-ran the whole listing
// pipeline and re-rendered 12,000 table cells. The box took about a second to
// look ticked.

describe('URL state — compare selection', () => {
  const compareBtn = (i: number) =>
    cy.get('[data-cy="gear-card"]').eq(i).find('[data-cy="btn-compare"]')

  // The performance guard. If this fails, ticking a box has become slow again.
  it('picking items does not touch the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 2)
    compareBtn(2).click()
    compareBtn(0).click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '2')
    cy.url().should('not.include', 'compare=')
    cy.url().should('eq', `${Cypress.config('baseUrl')}/webbings`)
  })

  it('a deep-linked ?compare= fills the bar', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card-name"]').eq(0).invoke('attr', 'href').then((href) => {
      const id = String(href).split('/').pop()
      cy.visit(`/webbings?compare=${id}`)
      cy.get('[data-cy="compare-bar"]').should('be.visible')
      cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
      // And the card it names shows itself as picked.
      cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/webbings/${id}"])`)
        .find('[data-cy="btn-compare"]')
        .should('have.attr', 'data-active', 'true')
    })
  })

  it('the selection survives a Clear all — it is not a filter', () => {
    cy.visit('/webbings?q=core')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    compareBtn(0).click()
    cy.get('[data-cy="filter-sidebar"]').find('[data-cy="clear-filters"]').click()
    cy.url().should('not.include', 'q=')
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  // The picks belong to the gear type they were made in.
  it('switching gear type clears the selection', () => {
    cy.visit('/webbings')
    compareBtn(0).click()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
    cy.get('[data-cy="nav-tab"]').contains('Weblocks').click()
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })
})
