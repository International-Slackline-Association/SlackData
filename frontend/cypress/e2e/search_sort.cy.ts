import { GEAR_TYPES } from '../support/gear_types'

// Sort fields per gear type — derived from slack_data/models/*.py.
// Rule: ONLY numeric fields (int or float) appear as sort options.
// Enums and booleans are filter-only (pill toggles in the sidebar).
//
// Implementation contract: each gear card must carry a data attribute for
// every sortable numeric field so tests can verify ordering without parsing
// display text. e.g. data-weight="280", data-breaking-strength="32.5".
// Null values use data-weight="" (empty string → sorts to bottom, null-last).

interface SortField {
  field: string         // Python field name; matches the card's data-{field} attribute
  label: string         // human label used in describe/it strings
  unit: string          // for display only
  nullLast: boolean     // true = items with null value sort to the bottom
}

// Fields that appear in the sort dropdown for every gear type
const UNIVERSAL_SORT_FIELDS: SortField[] = [
  { field: 'price',  label: 'Price',  unit: '',    nullLast: true },
  { field: 'weight', label: 'Weight', unit: 'g',   nullLast: true },
]

// Additional sort fields per gear type, from the model schemas
const EXTRA_SORT_FIELDS: Record<string, SortField[]> = {
  webbings: [
    { field: 'width',            label: 'Width',            unit: 'mm', nullLast: false },
    { field: 'breaking_strength',label: 'Breaking Strength',unit: 'kN', nullLast: true  },
    // stretch handled separately below — requires kN context
  ],
  weblocks: [
    { field: 'width_min',        label: 'Min Width',        unit: 'mm', nullLast: false },
    { field: 'breaking_strength',label: 'Breaking Strength',unit: 'kN', nullLast: true  },
  ],
  leashrings: [
    { field: 'inner_diameter',   label: 'Inner Diameter',   unit: 'mm', nullLast: true  },
    { field: 'outer_diameter',   label: 'Outer Diameter',   unit: 'mm', nullLast: true  },
    { field: 'breaking_strength',label: 'Breaking Strength',unit: 'kN', nullLast: true  },
  ],
  grips: [
    { field: 'width_min',             label: 'Min Width',          unit: 'mm', nullLast: false },
    { field: 'wll',                   label: 'WLL',                unit: 'kN', nullLast: true  },
    { field: 'mbs',                   label: 'MBS',                unit: 'kN', nullLast: true  },
    { field: 'common_slipping_threshold', label: 'Slipping Threshold', unit: 'kN', nullLast: true },
  ],
  rollers: [
    { field: 'breaking_strength',label: 'Breaking Strength',unit: 'kN', nullLast: true  },
  ],
  treepros: [
    { field: 'width',    label: 'Width',    unit: 'cm', nullLast: true },
    { field: 'length',   label: 'Length',   unit: 'cm', nullLast: true },
    { field: 'thickness',label: 'Thickness',unit: 'mm', nullLast: true },
  ],
  starterkits: [
    { field: 'webbing_length', label: 'Webbing Length', unit: 'm',  nullLast: false },
    { field: 'webbing_width',  label: 'Webbing Width',  unit: 'mm', nullLast: false },
  ],
  tricklinekits: [
    { field: 'webbing_length', label: 'Webbing Length', unit: 'm',  nullLast: false },
    { field: 'webbing_width',  label: 'Webbing Width',  unit: 'mm', nullLast: false },
  ],
}

// ── Search tests (unchanged for every gear type) ──────────────────────────────

GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Search — ${label}`, () => {
    const api = () => Cypress.env('apiUrl')

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    it('renders the search input with a placeholder referencing the gear type', () => {
      cy.get('[data-cy="search-input"]')
        .should('be.visible')
        .invoke('attr', 'placeholder')
        .should('match', new RegExp(label, 'i'))
    })

    it('filters cards to only those whose name contains the search term', () => {
      cy.request(`${api()}/${apiPath}/?limit=1`).then(({ body }) => {
        const term = (body[0].name as string).slice(0, 4)
        cy.get('[data-cy="search-input"]').type(term)
        cy.get('[data-cy="gear-card"]').each(($card) => {
          cy.wrap($card).find('[data-cy="gear-card-name"]')
            .invoke('text')
            .then((name) => expect(name.toLowerCase()).to.include(term.toLowerCase()))
        })
      })
    })

    it('updates the item count to match the number of filtered cards', () => {
      cy.request(`${api()}/${apiPath}/?limit=1`).then(({ body }) => {
        const term = (body[0].name as string).slice(0, 4)
        cy.get('[data-cy="search-input"]').type(term)
        cy.get('[data-cy="gear-card"]').its('length').then((count) => {
          cy.get('[data-cy="item-count"]').should('contain.text', String(count))
        })
      })
    })

    it('shows an empty state for a term that matches nothing', () => {
      cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
      cy.get('[data-cy="empty-state"]').should('be.visible')
      cy.get('[data-cy="gear-card"]').should('not.exist')
    })

    it('restores the full list when the search input is cleared', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match').clear()
        cy.get('[data-cy="gear-card"]').should('have.length', all.length)
      })
    })

    it('search is case-insensitive', () => {
      cy.request(`${api()}/${apiPath}/?limit=1`).then(({ body }) => {
        const term = (body[0].name as string).slice(0, 4).toUpperCase()
        cy.get('[data-cy="search-input"]').type(term)
        cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)
      })
    })

    it('search matches the brand name', () => {
      cy.request(`${api()}/${apiPath}/?limit=1`).then(({ body }) => {
        const term = (body[0].brand_name as string).slice(0, 4)
        cy.get('[data-cy="search-input"]').type(term)
        cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)
      })
    })
  })
})

// ── Normalized search (punctuation / number stripping) ────────────────────────
// Searching should ignore punctuation and separators so that "82" matches "8.2",
// "twave" matches "T-Wave", "type18" matches "type-18 MK1", and "pes" matches
// "(pes)". These are real webbing names from the database.
// The normalization rule: strip [.\-()/ ] before comparing, then do a
// case-insensitive substring match.

describe('Search — normalized (punctuation-insensitive)', () => {
  // Helper: strip punctuation the same way the implementation should
  function normalize(s: string) {
    return s.replace(/[.\-()/ ]/g, '').toLowerCase()
  }

  beforeEach(() => {
    cy.visit('/webbings')
  })

  const cases: { query: string; expectedNameSubstring: string }[] = [
    { query: '82',     expectedNameSubstring: '8.2'       },
    { query: '89',     expectedNameSubstring: '8.9'       },
    { query: 'twave',  expectedNameSubstring: 'T-Wave'    },
    { query: 'type18', expectedNameSubstring: 'type-18'   },
    { query: 'pes',    expectedNameSubstring: '(pes)'     },
  ]

  cases.forEach(({ query, expectedNameSubstring }) => {
    it(`"${query}" matches items whose normalized name contains it (e.g. "${expectedNameSubstring}")`, () => {
      cy.fetchAllItems('webbing').then((all) => {
        const matching = (all as Record<string, unknown>[])
          .filter(w => normalize(w.name as string).includes(normalize(query)))

        if (matching.length === 0) return // item not in db, skip gracefully

        cy.get('[data-cy="search-input"]').type(query)
        cy.get('[data-cy="gear-card"]').should('have.length.gte', 1)

        // Every visible card's normalized name must match the normalized query
        cy.get('[data-cy="gear-card-name"]').each(($el) => {
          expect(normalize($el.text())).to.include(normalize(query))
        })
      })
    })
  })

  it('a punctuation-only query matches nothing and shows the empty state', () => {
    cy.get('[data-cy="search-input"]').type('...')
    cy.get('[data-cy="empty-state"]').should('be.visible')
  })
})

// ── Sort tests ────────────────────────────────────────────────────────────────

GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  const sortFields = [...UNIVERSAL_SORT_FIELDS, ...(EXTRA_SORT_FIELDS[slug] ?? [])]

  describe(`Sort — ${label}`, () => {
    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    // ── Dropdown always-present options ──────────────────────────────────────

    it('renders a sort dropdown', () => {
      cy.get('[data-cy="sort-dropdown"]').should('be.visible')
    })

    it('always contains Name A→Z and Name Z→A', () => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/name.*a.*z|a.*z/i).should('exist')
      cy.get('[data-cy="sort-option"]').contains(/name.*z.*a|z.*a/i).should('exist')
      cy.get('body').type('{esc}')
    })

    // Every numeric field for this gear type has a Low→High and High→Low option
    sortFields.forEach(({ field, label: fieldLabel }) => {
      it(`contains Low→High sort for ${fieldLabel}`, () => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="sort-option"]')
          .filter(`[data-field="${field}"][data-direction="asc"]`)
          .should('exist')
        cy.get('body').type('{esc}')
      })

      it(`contains High→Low sort for ${fieldLabel}`, () => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="sort-option"]')
          .filter(`[data-field="${field}"][data-direction="desc"]`)
          .should('exist')
        cy.get('body').type('{esc}')
      })
    })

    // ── Name sort correctness ─────────────────────────────────────────────────

    it('Name A→Z renders cards in ascending alphabetical order', () => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/name.*a.*z/i).click()
      cy.get('[data-cy="gear-card-name"]').then(($els) => {
        const names = [...$els].map(el => el.textContent ?? '')
        expect(names).to.deep.equal([...names].sort((a, b) => a.localeCompare(b)))
      })
    })

    it('Name Z→A renders cards in descending alphabetical order', () => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/name.*z.*a/i).click()
      cy.get('[data-cy="gear-card-name"]').then(($els) => {
        const names = [...$els].map(el => el.textContent ?? '')
        expect(names).to.deep.equal([...names].sort((a, b) => b.localeCompare(a)))
      })
    })

    // ── Numeric field sort correctness ────────────────────────────────────────
    // Cards carry data-{field}="<value>" attributes (empty string = null).
    // Null-last fields: nulls/empties appear after all real values in both directions.

    sortFields.forEach(({ field, label: fieldLabel, nullLast }) => {
      it(`${fieldLabel} Low→High: cards are in ascending numeric order (nulls last)`, () => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="sort-option"]')
          .filter(`[data-field="${field}"][data-direction="asc"]`).click()

        cy.get('[data-cy="gear-card"]').then(($cards) => {
          const raw = [...$cards].map(c => c.getAttribute(`data-${field.replace(/_/g, '-')}`) ?? '')
          const nums  = raw.filter(v => v !== '').map(Number)
          const nulls = raw.filter(v => v === '')

          // Non-null values should be ascending
          expect(nums).to.deep.equal([...nums].sort((a, b) => a - b))

          if (nullLast) {
            // All empty-string entries should come after all numeric entries
            const firstNull = raw.indexOf('')
            const lastNum   = raw.map((v, i) => v !== '' ? i : -1).filter(i => i >= 0).pop() ?? -1
            if (firstNull !== -1 && lastNum !== -1) {
              expect(firstNull).to.be.gt(lastNum)
            }
          }
        })
      })

      it(`${fieldLabel} High→Low: cards are in descending numeric order (nulls last)`, () => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="sort-option"]')
          .filter(`[data-field="${field}"][data-direction="desc"]`).click()

        cy.get('[data-cy="gear-card"]').then(($cards) => {
          const raw  = [...$cards].map(c => c.getAttribute(`data-${field.replace(/_/g, '-')}`) ?? '')
          const nums  = raw.filter(v => v !== '').map(Number)
          const firstNull = raw.indexOf('')
          const lastNum   = raw.map((v, i) => v !== '' ? i : -1).filter(i => i >= 0).pop() ?? -1

          expect(nums).to.deep.equal([...nums].sort((a, b) => b - a))

          if (nullLast && firstNull !== -1 && lastNum !== -1) {
            expect(firstNull).to.be.gt(lastNum)
          }
        })
      })
    })

    // ── Sort persistence / reset ──────────────────────────────────────────────

    it('sort persists when the same gear-type tab is clicked again', () => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/name.*z.*a/i).click()
      cy.get('[data-cy="nav-tab"]').contains(label).click()
      cy.get('[data-cy="sort-dropdown"]').should('contain.text', /z.*a/i)
    })

    it('sort resets to Name A→Z when switching to a different gear type', () => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/name.*z.*a/i).click()

      const other = GEAR_TYPES.find(t => t.slug !== slug)!
      cy.get('[data-cy="nav-tab"]').contains(other.label).click()
      cy.get('[data-cy="nav-tab"]').contains(label).click()

      cy.get('[data-cy="sort-dropdown"]').should('not.contain.text', /z.*a/i)
    })
  })
})

// ── Webbing stretch sort (context-driven) ─────────────────────────────────────
//
// Stretch sort options appear in the dropdown ONLY when a kN is selected in
// the stretch filter widget. The selected kN determines which stretch % values
// are used for ordering.
//
// Null-last: webbings without stretch data at the selected kN sort to the
// bottom regardless of direction — they are NOT excluded from results unless
// a % range filter is also active.
//
// Cards carry data-stretch-percent="<value>" when they have data at the
// selected kN, and data-stretch-percent="" when they do not.

describe('Webbing stretch sort', () => {
  function parseKnValues(json: string | null): number[] {
    if (!json) return []
    try { return (JSON.parse(json) as { kn: number }[]).map(p => p.kn) }
    catch { return [] }
  }

  function percentAtKn(json: string | null, kn: number): number | null {
    if (!json) return null
    try {
      const pts = JSON.parse(json) as { kn: number; percent: number }[]
      return pts.find(p => p.kn === kn)?.percent ?? null
    } catch { return null }
  }

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('stretch sort options are NOT in the dropdown before a kN is selected', () => {
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="stretch"]').should('not.exist')
    cy.get('body').type('{esc}')
  })

  it('stretch Low→High and High→Low options appear after selecting a kN', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()

    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="asc"]').should('exist')
    cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="desc"]').should('exist')
    cy.get('body').type('{esc}')
  })

  it('stretch sort options disappear when the kN pill is deselected', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()  // select
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()  // deselect

    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="stretch"]').should('not.exist')
    cy.get('body').type('{esc}')
  })

  it('Stretch Low→High orders by % ascending at the selected kN, nulls last', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      // Find the most common kN
      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const kn = Number(Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0])

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').contains(`${kn}`).click()

      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="asc"]').click()

      cy.get('[data-cy="gear-card"]').then(($cards) => {
        const raw     = [...$cards].map(c => c.getAttribute('data-stretch-percent') ?? '')
        const nums    = raw.filter(v => v !== '').map(Number)
        const firstNull = raw.indexOf('')
        const lastNum   = raw.map((v, i) => v !== '' ? i : -1).filter(i => i >= 0).pop() ?? -1

        // Non-null values are ascending
        expect(nums).to.deep.equal([...nums].sort((a, b) => a - b))

        // Nulls (no data at this kN) are after all real values
        if (firstNull !== -1 && lastNum !== -1) {
          expect(firstNull).to.be.gt(lastNum)
        }
      })
    })
  })

  it('Stretch High→Low orders by % descending at the selected kN, nulls last', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const kn = Number(Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0])

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').contains(`${kn}`).click()

      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="desc"]').click()

      cy.get('[data-cy="gear-card"]').then(($cards) => {
        const raw     = [...$cards].map(c => c.getAttribute('data-stretch-percent') ?? '')
        const nums    = raw.filter(v => v !== '').map(Number)
        const firstNull = raw.indexOf('')
        const lastNum   = raw.map((v, i) => v !== '' ? i : -1).filter(i => i >= 0).pop() ?? -1

        expect(nums).to.deep.equal([...nums].sort((a, b) => b - a))

        if (firstNull !== -1 && lastNum !== -1) {
          expect(firstNull).to.be.gt(lastNum)
        }
      })
    })
  })

  it('changing the selected kN updates both the visible cards and the sort', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const sortedKns = Object.entries(freq).sort(([, a], [, b]) => b - a)
      if (sortedKns.length < 2) return

      const kn1 = Number(sortedKns[0][0])
      const kn2 = Number(sortedKns[1][0])

      // Select first kN and sort
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').contains(`${kn1}`).click()
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="asc"]').click()

      cy.get('[data-cy="gear-card"]').its('length').then((count1) => {
        // Switch to second kN
        cy.get('[data-cy="filter-group"][data-group="stretch"]')
          .find('[data-cy="stretch-kn-pill"]').contains(`${kn2}`).click()

        // Sort option should still be stretch asc but now driven by kn2
        cy.get('[data-cy="sort-dropdown"]')
          .should('contain.text', `${kn2}`)

        // Card count may differ since different kN values are present in different webbings
        cy.get('[data-cy="gear-card"]').its('length').should('be.gte', 1)
      })
    })
  })

  it('stretch sort without a % range filter shows all webbings (not just those with data)', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const kn = Number(Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0])

      // Select kN and sort — no % range set
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').contains(`${kn}`).click()
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="asc"]').click()

      // All webbings are visible (those without data at this kN appear at the bottom)
      cy.get('[data-cy="gear-card"]').should('have.length', webbings.length)
    })
  })
})

// ── Search + filter applied simultaneously ────────────────────────────────────
// Tests that both constraints are enforced together, not independently.
// Uses webbings (largest dataset) with material pill + search term.

describe('Search + filter combination', () => {
  it('search narrows results further when a pill filter is already active', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const material = webbings.find(w => w.material != null)?.material as string | undefined
      if (!material) return

      cy.visit('/webbings')

      // Apply pill filter first
      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`).click()
      cy.get('[data-cy="gear-card"]').its('length').then((filteredCount) => {

        // Now type a brand name to narrow further
        cy.get('[data-cy="search-input"]').type('Gibbon')
        cy.get('[data-cy="gear-card"]').its('length').should('be.lte', filteredCount)

        // Every remaining card must satisfy BOTH constraints
        cy.get('[data-cy="gear-card"]').each(($card) => {
          cy.wrap($card).find('[data-cy="gear-card-brand"]')
            .invoke('text').then((brand) => {
              expect(brand.toLowerCase()).to.include('gibbon')
            })
        })
      })
    })
  })

  it('clearing the search leaves the pill filter active', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const material = webbings.find(w => w.material != null)?.material as string | undefined
      if (!material) return

      const filterCount = webbings.filter(w => w.material === material).length

      cy.visit('/webbings')
      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`).click()
      cy.get('[data-cy="search-input"]').type('Gibbon').clear()

      // Filter should still be applied — count should equal filter-only count
      cy.get('[data-cy="gear-card"]').should('have.length', filterCount)
      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`)
        .should('have.attr', 'data-active', 'true')
    })
  })

  it('clearing a filter leaves the search term active', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="search-input"]').type('Gibbon')
    cy.get('[data-cy="gear-card"]').its('length').then((searchCount) => {

      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find('[data-cy="filter-pill"]').first().click()
      cy.get('[data-cy="gear-card"]').its('length').then((combinedCount) => {
        // Removing the filter should restore to search-only count
        cy.get('[data-cy="filter-group"][data-group="material"]')
          .find('[data-cy="filter-pill"]').first().click()
        cy.get('[data-cy="gear-card"]').should('have.length', searchCount)

        // Combined count should have been <= search-only count
        expect(combinedCount).to.be.lte(searchCount)
      })
    })
  })

  it('item count reflects both search and filter constraints', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const material = webbings.find(w => w.material != null)?.material as string | undefined
      if (!material) return

      cy.visit('/webbings')
      cy.get('[data-cy="filter-group"][data-group="material"]')
        .find(`[data-cy="filter-pill"][data-value="${material}"]`).click()
      cy.get('[data-cy="search-input"]').type('Gibbon')

      cy.get('[data-cy="gear-card"]').its('length').then((count) => {
        cy.get('[data-cy="item-count"]').should('contain.text', String(count))
      })
    })
  })

  it('sort order is preserved when a filter is applied on top', () => {
    cy.visit('/webbings')

    // Sort by weight ascending
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="weight"][data-direction="asc"]').click()

    // Apply a filter
    cy.get('[data-cy="filter-group"][data-group="material"]')
      .find('[data-cy="filter-pill"]').first().click()

    // Cards should still be in ascending weight order
    cy.get('[data-cy="gear-card"]').then(($cards) => {
      const weights = [...$cards]
        .map(c => c.getAttribute('data-weight'))
        .filter(v => v && v !== '')
        .map(Number)
      expect(weights).to.deep.equal([...weights].sort((a, b) => a - b))
    })
  })
})
