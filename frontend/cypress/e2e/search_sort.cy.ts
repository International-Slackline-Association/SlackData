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

    // ── Default order ─────────────────────────────────────────────────────────
    // A fresh load (no sort chosen) must be alphabetical by name — name is the
    // default sort as well as the universal tie-breaker.

    it('defaults to ascending alphabetical order on first load', () => {
      cy.get('[data-cy="gear-card-name"]').then(($els) => {
        const names = [...$els].map(el => el.textContent ?? '')
        expect(names).to.deep.equal([...names].sort((a, b) => a.localeCompare(b)))
      })
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

      it(`${fieldLabel} Low→High: equal values are broken alphabetically by name`, () => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="sort-option"]')
          .filter(`[data-field="${field}"][data-direction="asc"]`).click()

        cy.get('[data-cy="gear-card"]').then(($cards) => {
          const rows = [...$cards].map(c => ({
            value: c.getAttribute(`data-${field.replace(/_/g, '-')}`) ?? '',
            name: c.querySelector('[data-cy="gear-card-name"]')?.textContent ?? '',
          }))
          // Within every run of cards sharing the same numeric value, names must
          // be in ascending alphabetical order.
          for (let i = 1; i < rows.length; i++) {
            if (rows[i].value !== '' && rows[i].value === rows[i - 1].value) {
              expect(rows[i - 1].name.localeCompare(rows[i].name)).to.be.at.most(0)
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

// ── Webbing stretch sort (top-5 kN, secondary dropdown) ───────────────────────
//
// Stretch sorting is decoupled from the filter widget: the sort dropdown always
// carries ONE "Stretch at <kN>" row for webbings, where the kN is a nested
// secondary dropdown offering the top-5 stretch points. Low→High / High→Low then
// order by the % at the chosen kN (nulls last, ties alphabetical). No filter kN
// pill needs to be selected.

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

  // Mirror of src/utils/stretch.ts topKnPoints: 0 dropped, integers only, top-5
  // by webbing count (ties toward smaller kN).
  function topKnPoints(webbings: Record<string, unknown>[], n = 5): { kn: number; count: number }[] {
    const freq = new Map<number, number>()
    webbings.forEach(w => {
      new Set(parseKnValues(w.stretch as string | null)).forEach(k => {
        freq.set(k, (freq.get(k) ?? 0) + 1)
      })
    })
    return [...freq.entries()]
      .filter(([kn]) => kn !== 0 && Number.isInteger(kn))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, n)
      .map(([kn, count]) => ({ kn, count }))
  }

  // Read the visible cards' item ids top-to-bottom, from the detail-link href
  // (/webbings/<id>). Ids are unique — webbing NAMES are not, so map by id.
  function cardIds($cards: JQuery<HTMLElement>): string[] {
    return [...$cards].map(c => {
      const href = c.querySelector('[data-cy="gear-card-name"]')?.getAttribute('href') ?? ''
      return href.split('/').pop() ?? ''
    })
  }

  function pctByIdAt(webbings: Record<string, unknown>[], kn: number): Map<string, number | null> {
    return new Map(webbings.map(w => [String(w.id), percentAtKn(w.stretch as string | null, kn)]))
  }

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('exposes a stretch sort row in the dropdown WITHOUT a filter kN selected', () => {
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-stretch-row"]').should('exist')
    cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
      .should('exist')
    cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="desc"]')
      .should('exist')
    cy.get('body').type('{esc}')
  })

  it('the kN secondary dropdown offers only the top-5 stretch points', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const topKns = topKnPoints(all as Record<string, unknown>[]).map(p => p.kn)
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="stretch-sort-kn"]').click()
      cy.get('[data-cy="stretch-sort-kn-option"]').should('have.length', topKns.length)
      cy.get('[data-cy="stretch-sort-kn-option"]').then(($opts) => {
        const shown = [...$opts].map(o => Number(o.getAttribute('data-kn')))
        expect([...shown].sort((a, b) => a - b)).to.deep.equal([...topKns].sort((a, b) => a - b))
      })
    })
  })

  it('defaults the stretch sort kN to the most common (top) point', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const defaultKn = topKnPoints(all as Record<string, unknown>[])[0].kn
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="stretch-sort-kn"]').should('have.attr', 'data-kn', `${defaultKn}`)
      cy.get('body').type('{esc}')
    })
  })

  it('Stretch Low→High orders by % ascending at the chosen kN, nulls last', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const kn = topKnPoints(webbings)[0].kn
      const pctById = pctByIdAt(webbings, kn)

      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
        .click()

      cy.get('[data-cy="gear-card"]').should(($cards) => {
        const pcts = cardIds($cards).map(id => pctById.get(id) ?? null)
        const nums = pcts.filter((p): p is number => p != null)
        expect(nums).to.deep.equal([...nums].sort((a, b) => a - b))
        const firstNull = pcts.indexOf(null)
        const lastNum = pcts.map((p, i) => (p != null ? i : -1)).filter(i => i >= 0).pop() ?? -1
        if (firstNull !== -1 && lastNum !== -1) expect(firstNull).to.be.gt(lastNum)
      })
    })
  })

  it('Stretch High→Low orders by % descending at the chosen kN, nulls last', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const kn = topKnPoints(webbings)[0].kn
      const pctById = pctByIdAt(webbings, kn)

      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="desc"]')
        .click()

      cy.get('[data-cy="gear-card"]').should(($cards) => {
        const pcts = cardIds($cards).map(id => pctById.get(id) ?? null)
        const nums = pcts.filter((p): p is number => p != null)
        expect(nums).to.deep.equal([...nums].sort((a, b) => b - a))
        const firstNull = pcts.indexOf(null)
        const lastNum = pcts.map((p, i) => (p != null ? i : -1)).filter(i => i >= 0).pop() ?? -1
        if (firstNull !== -1 && lastNum !== -1) expect(firstNull).to.be.gt(lastNum)
      })
    })
  })

  it('all webbings stay visible when sorting by stretch (nulls sink, not excluded)', () => {
    cy.fetchAllItems('webbing').then((all) => {
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
        .click()
      cy.get('[data-cy="gear-card"]').should('have.length', all.length)
    })
  })

  it('choosing a different kN in the secondary dropdown re-sorts by that kN', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]
      const top = topKnPoints(webbings)
      if (top.length < 2) return
      const kn2 = top[1].kn
      const pctById = pctByIdAt(webbings, kn2)

      cy.get('[data-cy="sort-dropdown"]').click()
      // Sort ascending at the default kN first.
      cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
        .click()
      // Reopen, switch the secondary kN to the second top point.
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="stretch-sort-kn"]').click()
      cy.get(`[data-cy="stretch-sort-kn-option"][data-kn="${kn2}"]`).click()

      cy.get('[data-cy="sort-dropdown"]').should('contain.text', `${kn2}`)
      cy.get('[data-cy="gear-card"]').should(($cards) => {
        const nums = cardIds($cards)
          .map(id => pctById.get(id) ?? null)
          .filter((p): p is number => p != null)
        expect(nums).to.deep.equal([...nums].sort((a, b) => a - b))
      })
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
