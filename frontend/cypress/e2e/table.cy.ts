import { GEAR_TYPES } from '../support/gear_types'

// Table view — the listing's third mode (DESIGN.md § Table View).
//
// What it is for: ranking a whole gear type on one spec and reading the numbers
// next to each other. So the assertions that matter are about COLUMNS (the full
// spec set, in specRows order, minus the ones nothing populates), SORT (the
// header and the dropdown are one piece of state), and the fact that the mode
// itself lives in the URL.
//
// Webbings carry the widest spec set and the stretch column, so the detailed
// assertions run there; every gear type gets the toggle + shape smoke test.

const TABLE = '[data-cy="gear-table"]'
const HEADER = '[data-cy="gear-table-header"]'
// The clickable sort control inside a header. The frozen identity column holds
// two of them — Name and Manufacturer — so its sorts are addressed through this
// rather than through the <th>.
const SORT = '[data-cy="gear-table-sort"]'
const ROW = '[data-cy="gear-table-row"]'

// A cell's leading number ("18 kN" → 18, "—" → null).
function numberIn(text: string): number | null {
  const m = text.replace(/[\s ]/g, ' ').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Assert a column reads in order. `.should` rather than `.then` because the
// header marks itself sorted synchronously (see GearTable's pendingSort) while
// the rows re-order on the URL echo a render later — a one-shot read races that
// and sees the previous order. Nulls sort last in both directions
// (utils/sort.ts), so only the numbers that are there are compared.
function expectSortedBy(field: string, direction: 'asc' | 'desc') {
  cy.get(`[data-cy="gear-table-cell"][data-field="${field}"]`).should(($cells) => {
    const nums = $cells
      .toArray()
      .map((el) => numberIn(el.textContent ?? ''))
      .filter((v): v is number => v !== null)
    const wanted = [...nums].sort((a, b) => (direction === 'asc' ? a - b : b - a))
    expect(nums).to.deep.equal(wanted)
  })
}

describe('Table view — the mode itself', () => {
  it('the toggle offers Table beside Cards and Detailed', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="view-cards"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="view-table"]').should('be.visible')
      .and('not.have.attr', 'data-active', 'true')
  })

  it('clicking Table swaps the grid for the table and records the mode in the URL', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="view-table"]').click()
    cy.get(TABLE).should('be.visible')
    cy.get('[data-cy="gear-grid"]').should('not.be.visible')
    cy.get('[data-cy="view-table"]').should('have.attr', 'data-active', 'true')
    cy.url().should('include', 'view=table')
  })

  it('?view=table is deep-linkable — the table renders on first paint', () => {
    cy.visit('/webbings?view=table')
    cy.get(TABLE).should('be.visible')
    cy.get('[data-cy="view-table"]').should('have.attr', 'data-active', 'true')
  })

  it('Cards writes no ?view= param — a bare listing URL stays canonical', () => {
    cy.visit('/webbings?view=table')
    cy.get('[data-cy="view-cards"]').click()
    cy.url().should('not.include', 'view=')
  })

  it('an unrecognised ?view= falls back to Cards rather than 404ing', () => {
    cy.visit('/webbings?view=hologram')
    cy.get('[data-cy="gear-grid"]').should('be.visible')
    cy.get('[data-cy="view-cards"]').should('have.attr', 'data-active', 'true')
  })

  // The reason the mode moved into the URL at all: local state did not survive
  // the trip to a detail page and back.
  it('the mode survives Back from a detail page', () => {
    cy.visit('/webbings?view=table')
    cy.get(`${ROW} [data-cy="gear-table-name"]`).first().click()
    cy.get('[data-cy="gear-detail"]').should('be.visible')
    cy.go('back')
    cy.get(TABLE).should('be.visible')
  })

  it('the table is absent from the DOM while Cards is active', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('exist')
    cy.get(TABLE).should('not.exist')
  })

  it('clearing the filters keeps the mode — a view is not a filter', () => {
    cy.visit('/webbings?view=table&material=Polyester')
    // The sidebar's "Clear all" shares the empty state's hook; only one is on
    // screen here.
    cy.get('[data-cy="clear-filters"]').first().click()
    cy.url().should('include', 'view=table')
    cy.get(TABLE).should('be.visible')
  })
})

describe('Table view — columns', () => {
  beforeEach(() => {
    cy.visit('/webbings?view=table')
    cy.get(TABLE).should('be.visible')
  })

  // The whole point of the mode: not a hand-picked six.
  it('columns are the full spec set, identity first', () => {
    cy.get(HEADER).first().should('have.attr', 'data-field', 'name')
    cy.get(HEADER).then(($h) => {
      const fields = $h.toArray().map((el) => el.getAttribute('data-field'))
      // Everything up to the stretch curve, in specRows order.
      expect(fields.slice(0, 8)).to.deep.equal([
        'name',
        'price',
        'material',
        'webbing_construction',
        'width',
        'thickness',
        'weight',
        'breaking_strength',
      ])
      // …then the curve, expanded in place into one column per integer kN.
      const stretch = fields.slice(8)
      expect(stretch).to.deep.equal(
        Array.from({ length: 40 }, (_, i) => `stretch@${i + 1}`),
      )
    })
  })

  // A curve is a series, and no single cell lets you rank on a load. Every
  // integer kN from 1 to 40 is measured on at least one webbing, so all forty
  // survive the dead-column filter.
  it('the stretch curve is one column per kN, not one cell', () => {
    cy.get(`${HEADER}[data-field="stretch"]`).should('not.exist')
    cy.get(`${HEADER}[data-field="stretch@10"]`).should('have.text', '10↕')
    cy.get('[data-cy="gear-table-group"]').should('contain', 'Stretch @ kN')
    cy.get(`[data-cy="gear-table-cell"][data-field="stretch@10"]`)
      .filter(':contains("%")')
      .should('exist')
  })

  // `colors` is configured for webbings and null for every row we hold. On the
  // detail page that costs nothing; here it would be a permanent empty stripe
  // every reader scrolls past.
  it('a spec no item populates gets no column', () => {
    cy.get(`${HEADER}[data-field="colors"]`).should('not.exist')
  })

  it('every row carries a cell for every spec column', () => {
    cy.get(HEADER).its('length').then((headers) => {
      cy.get(ROW).first().find('[data-cy="gear-table-cell"]')
        .should('have.length', headers - 1) // identity is a <th>, not a cell
    })
  })

  // The value carries the unit, so the header repeating it said the same thing
  // 250 times down the column.
  it('headers carry the label alone — the unit is on every line', () => {
    cy.get(`${HEADER}[data-field="width"]`)
      .should('contain', 'Width')
      .and('not.contain', '(mm)')
    cy.get('[data-cy="gear-table-cell"][data-field="width"]').first().should('contain', 'mm')
  })

  it('a missing value is an em dash, not a blank cell', () => {
    cy.get('[data-cy="gear-table-cell"]').filter(':contains("—")').should('exist')
  })

  // Only 29 of 230 curves reach past 20 kN, so on an unfiltered webbings table
  // the top of the block is nearly empty. Narrow the results and the ceiling
  // comes down with them.
  it('the kN ceiling follows the filtered set, not the whole gear type', () => {
    const highest = () =>
      cy.get(HEADER).then(($h) =>
        Math.max(
          ...$h
            .toArray()
            .map((el) => el.getAttribute('data-field') ?? '')
            .filter((f) => f.startsWith('stretch@'))
            .map((f) => Number(f.slice('stretch@'.length))),
        ),
      )
    highest().then((unfiltered) => {
      expect(unfiltered).to.equal(40)
      // A search that keeps webbings but drops the long-curve ones.
      cy.get('[data-cy="search-input"]').type('Aero')
      cy.get(ROW).should('have.length.lessThan', 20)
      highest().should('be.lessThan', unfiltered)
    })
  })

  it('the identity column heads both of its sorts', () => {
    cy.get(`${SORT}[data-field="name"]`).should('contain', 'Name')
    cy.get(`${SORT}[data-field="brand_name"]`).should('contain', 'Manufacturer')
  })

  // The whole row opens the item, the way the whole card does.
  it('clicking anywhere in a row opens that item', () => {
    cy.get(ROW).first().invoke('attr', 'data-id').then((id) => {
      cy.get(ROW).first().find('[data-cy="gear-table-cell"]').eq(1).click()
      cy.location('pathname').should('eq', `/webbings/${id}`)
      cy.get('[data-cy="gear-detail"]').should('be.visible')
    })
  })

  // A click handler is not a link: no context menu, no "open in a new tab", no
  // middle click, no URL in the status bar. So every cell holds a real anchor,
  // and THAT is what these assert — the href being there is what the browser
  // builds its context menu from.
  it('every cell is a real link to the item, not just a click handler', () => {
    cy.get(ROW).first().invoke('attr', 'data-id').then((id) => {
      // One assertion over every cell rather than a Cypress command per cell:
      // there are forty-odd of them per row and each command costs a retry loop.
      cy.get(ROW).first().find('[data-cy="gear-table-cell"]').should(($cells) => {
        const hrefs = $cells.toArray().map((td) => td.querySelector('a')?.getAttribute('href'))
        expect(hrefs.length).to.be.greaterThan(8)
        expect(new Set(hrefs)).to.deep.equal(new Set([`/webbings/${id}`]))
      })
    })
  })

  it("the cell link fills the cell, so it isn't a hit-box around the text", () => {
    cy.get(ROW).first().find('[data-cy="gear-table-cell"]').eq(1).then(($cell) => {
      const cell = $cell[0].getBoundingClientRect()
      const link = $cell[0].querySelector('a')!.getBoundingClientRect()
      expect(link.width, 'link spans the cell width').to.be.closeTo(cell.width, 1)
      expect(link.height, 'link spans the cell height').to.be.closeTo(cell.height, 1)
    })
  })

  it('the repeated cell links are hidden from the a11y tree', () => {
    // One destination repeated forty-odd times a row. The product name is the
    // one that stays focusable; the rest are mouse affordances, exactly as the
    // card's stretched overlay is.
    cy.get(ROW).first().find('[data-cy="gear-table-cell"] a')
      .should('have.attr', 'aria-hidden', 'true')
      .and('have.attr', 'tabindex', '-1')
    cy.get(ROW).first().find('[data-cy="gear-table-name"]')
      .should('not.have.attr', 'aria-hidden')
  })

  // What makes cmd/middle-click open a new tab is the anchor itself: a plain
  // same-document link with no `target`, which the browser handles before any
  // script sees it. That is assertable; the modified click is not — Cypress does
  // not deliver the modifier to React Router's link handler (a meta+click on the
  // shipped gear CARD name link navigates in-tab under Cypress too), so a test
  // of it would be testing the harness.
  it('the cell links are plain same-tab anchors, so the browser owns modified clicks', () => {
    // One callback, not a chain: `not.have.attr` yields the (undefined)
    // attribute as the new subject, so a chained `.and` asserts on nothing.
    cy.get(ROW).first().find('[data-cy="gear-table-cell"] a').should(($links) => {
      expect($links.length).to.be.greaterThan(8)
      $links.toArray().forEach((a) => {
        expect(a.getAttribute('target'), 'no target').to.equal(null)
        expect(a.getAttribute('download'), 'no download').to.equal(null)
      })
    })
  })

  it('the row click does not swallow the controls inside it', () => {
    // The compare checkbox and the brand link are their own destinations; a row
    // handler that fired on them would make both unusable.
    cy.get(ROW).first().find('[data-cy="table-compare"]').check()
    cy.location('pathname').should('eq', '/webbings')
    cy.get('[data-cy="compare-bar"]').should('be.visible')
    cy.get(ROW).first().find('[data-cy="gear-table-brand"] a').click()
    cy.location('pathname').should('include', '/manufacturers/')
  })

  it('the identity column carries the image, brand and a link to the item', () => {
    cy.get(ROW).first().within(() => {
      cy.get('[data-cy="gear-table-brand"]').should('be.visible')
      cy.get('[data-cy="gear-table-name"]')
        .should('have.attr', 'href')
        .and('match', /\/webbings\/\d+/)
    })
  })

  it('the row count matches the filtered item count', () => {
    cy.get('[data-cy="item-count"]').invoke('text').then((text) => {
      cy.get(ROW).should('have.length', Number(text.split(' ')[0]))
    })
  })
})

describe('Table view — sorting from the column headers', () => {
  beforeEach(() => {
    cy.visit('/webbings?view=table')
    cy.get(TABLE).should('be.visible')
  })

  it('a fresh table is Name A→Z, and the Name header says so', () => {
    cy.get(`${SORT}[data-field="name"]`).should('have.attr', 'data-sort', 'asc')
    cy.get(`${HEADER}[data-field="name"]`).should('have.attr', 'data-sort', 'asc')
  })

  it('clicking a spec header sorts ascending and writes the shared ?sort= param', () => {
    cy.get(`${HEADER}[data-field="breaking_strength"] button`).click()
    cy.get(`${HEADER}[data-field="breaking_strength"]`).should('have.attr', 'data-sort', 'asc')
    cy.url().should('include', 'sort=breaking_strength-asc')
    expectSortedBy('breaking_strength', 'asc')
  })

  it('clicking the sorted header flips the direction', () => {
    cy.get(`${HEADER}[data-field="breaking_strength"] button`).click()
    cy.get(`${HEADER}[data-field="breaking_strength"] button`).click()
    cy.get(`${HEADER}[data-field="breaking_strength"]`).should('have.attr', 'data-sort', 'desc')
    cy.url().should('include', 'sort=breaking_strength-desc')
    expectSortedBy('breaking_strength', 'desc')
  })

  it('only one column is marked sorted at a time', () => {
    cy.get(`${HEADER}[data-field="weight"] button`).click()
    cy.get(`${HEADER}[data-sort="asc"], ${HEADER}[data-sort="desc"]`).should('have.length', 1)
    cy.get(`${SORT}[data-field="name"]`).should('have.attr', 'data-sort', 'none')
  })

  // The header and the dropdown are two controls over ONE piece of state.
  it('the dropdown and the headers cannot disagree', () => {
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="weight"][data-direction="desc"]').click()
    cy.get(`${HEADER}[data-field="weight"]`).should('have.attr', 'data-sort', 'desc')
  })

  it('a header sort shows up in the dropdown label', () => {
    cy.get(`${HEADER}[data-field="weight"] button`).click()
    cy.get('[data-cy="sort-dropdown"]').should('contain', 'Weight')
  })

  // Alphabetical, so it must not be labelled like a number. It read
  // "brand_name: Low→High" before, which is wrong twice over.
  it('the Manufacturer sort is labelled as the alphabetical sort it is', () => {
    cy.get(`${SORT}[data-field="brand_name"]`).click()
    cy.get('[data-cy="sort-dropdown"]').should('contain', 'Brand: A→Z')
    cy.get(`${SORT}[data-field="brand_name"]`).click()
    cy.get('[data-cy="sort-dropdown"]').should('contain', 'Brand: Z→A')
  })

  it('a deep-linked sort marks the header on arrival', () => {
    cy.visit('/webbings?view=table&sort=width-desc')
    cy.get(`${HEADER}[data-field="width"]`).should('have.attr', 'data-sort', 'desc')
  })

  // Enums and booleans have no single number to rank on.
  it('non-sortable columns are plain labels, not buttons', () => {
    cy.get(`${HEADER}[data-field="material"]`).should('have.attr', 'data-sort', 'none')
    cy.get(`${HEADER}[data-field="material"] button`).should('not.exist')
    cy.get(`${HEADER}[data-field="webbing_construction"] button`).should('not.exist')
  })

  // Ranking the catalogue by stretch at a given load is the reason the curve is
  // forty columns rather than one cell.
  it('a per-kN stretch column sorts like any other', () => {
    cy.get(`${HEADER}[data-field="stretch@10"] button`).click()
    cy.get(`${HEADER}[data-field="stretch@10"]`).should('have.attr', 'data-sort', 'asc')
    expectSortedBy('stretch@10', 'asc')
    cy.get(`${HEADER}[data-field="stretch@10"] button`).click()
    expectSortedBy('stretch@10', 'desc')
  })

  // The dropdown's own stretch rows write the same `stretch@N` field, so the two
  // controls stay one piece of state here too.
  it('the dropdown\'s stretch sort marks the matching kN column', () => {
    cy.get('[data-cy="sort-dropdown"]').click()
    // The dropdown's stretch row carries its reference kN in data-kn and writes
    // `stretch@<kn>` — the same field the column header writes.
    cy.get('[data-cy="sort-option"][data-field="stretch"][data-direction="desc"]')
      .first()
      .then(($opt) => {
        const kn = $opt.attr('data-kn')
        cy.wrap($opt).click()
        cy.get(`${HEADER}[data-field="stretch@${kn}"]`).should('have.attr', 'data-sort', 'desc')
      })
  })

  it('the Name header sorts by name', () => {
    cy.get(`${SORT}[data-field="name"]`).click()
    cy.url().should('include', 'sort=name-desc')
  })

  // Alphabetical, not numeric: the generic numeric path would Number() every
  // brand to NaN and leave the rows in name order under a header claiming
  // otherwise.
  it('the Manufacturer header sorts the makers alphabetically', () => {
    cy.get(`${SORT}[data-field="brand_name"]`).click()
    cy.url().should('include', 'sort=brand_name-asc')
    cy.get(`${ROW} [data-cy="gear-table-brand"]`).should(($cells) => {
      const brands = $cells.toArray().map((el) => el.textContent?.trim().toLowerCase() ?? '')
      expect(brands).to.deep.equal([...brands].sort())
    })
  })

  it('the Manufacturer header flips, and keeps names ascending inside a maker', () => {
    cy.get(`${SORT}[data-field="brand_name"]`).click()
    cy.get(`${SORT}[data-field="brand_name"]`).click()
    cy.get(`${SORT}[data-field="brand_name"]`).should('have.attr', 'data-sort', 'desc')
    cy.get(ROW).should(($rows) => {
      const pairs = $rows.toArray().map((row) => ({
        brand: row.querySelector('[data-cy="gear-table-brand"]')?.textContent?.trim() ?? '',
        name: row.querySelector('[data-cy="gear-table-name"]')?.textContent?.trim() ?? '',
      }))
      const brands = pairs.map((p) => p.brand.toLowerCase())
      expect(brands, 'makers descending').to.deep.equal([...brands].sort().reverse())
      // Within the first maker, names still read A→Z.
      const first = pairs.filter((p) => p.brand === pairs[0].brand).map((p) => p.name)
      expect(first, 'names ascending within a maker').to.deep.equal([...first].sort())
    })
  })

  // width_range is a composite of width_min + width_max, so its header sorts on
  // the bound the Sort dropdown offers.
  it('the weblock width-range column sorts on width_min', () => {
    cy.visit('/weblocks?view=table')
    cy.get(`${HEADER}[data-field="width_range"] button`).click()
    cy.url().should('include', 'sort=width_min-asc')
  })
})

describe('Table view — filters, search and compare', () => {
  beforeEach(() => {
    cy.visit('/webbings?view=table')
    cy.get(TABLE).should('be.visible')
  })

  it('search narrows the table', () => {
    cy.get(ROW).its('length').then((before) => {
      cy.get('[data-cy="search-input"]').type('Gibbon')
      cy.get(ROW).should('have.length.lessThan', before)
      // Search matches brand OR name (utils/search.ts) — Gibbon's "Flow Line"
      // is a match on neither the row's name alone nor a coincidence.
      cy.get(ROW).each(($row) => {
        expect($row.text().toLowerCase()).to.contain('gibbon')
      })
    })
  })

  it('a search with no matches replaces the table with the empty state', () => {
    cy.get('[data-cy="search-input"]').type('xqzxqzxqzxqz_no_match')
    cy.get(TABLE).should('not.exist')
    cy.get('[data-cy="empty-state"]').should('be.visible')
  })

  it('a row checkbox adds the item to the compare bar', () => {
    cy.get(ROW).first().find('[data-cy="table-compare"]').check()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
    cy.get('[data-cy="compare-bar-item"]').should('have.length', 1)
  })

  it('the selection is the same one the cards hold', () => {
    cy.get(ROW).first().find('[data-cy="table-compare"]').check()
    cy.get('[data-cy="view-cards"]').click()
    cy.get('[data-cy="btn-compare"][data-active="true"]').should('have.length', 1)
  })

  it('unchecking removes the item again', () => {
    cy.get(ROW).first().find('[data-cy="table-compare"]').check()
    cy.get(ROW).first().find('[data-cy="table-compare"]').uncheck()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })
})

describe('Table view — the wide sets scroll sideways, the page does not', () => {
  it('the table scrolls inside its own region', () => {
    cy.viewport(1024, 900) // the narrowest desktop: sidebar + table share the row
    cy.visit('/webbings?view=table')
    cy.get('[data-cy="gear-table-scroll"]').should(($el) => {
      const el = $el[0]
      expect(el.scrollWidth, 'the spec set is wider than the region').to.be.greaterThan(
        el.clientWidth,
      )
    })
    cy.document().then((doc) => {
      const el = doc.documentElement
      expect(el.scrollWidth, 'the page itself must not scroll sideways').to.be.at.most(
        el.clientWidth + 1,
      )
    })
  })

  // Geometry, not cy visibility: Cypress can't reason about a `position: sticky`
  // cell that is pinned inside a scrolled container, and the contract here is
  // precisely where the cell sits.
  it('the identity column stays pinned to the left edge while the columns scroll', () => {
    cy.visit('/webbings?view=table')
    cy.get('[data-cy="gear-table-scroll"]').scrollTo('right')
    cy.get('[data-cy="gear-table-scroll"]').then(($box) => {
      cy.get(ROW).first().find('th').then(($th) => {
        expect($th[0].getBoundingClientRect().left).to.be.closeTo(
          $box[0].getBoundingClientRect().left,
          2,
        )
      })
    })
  })

  it('the header row stays pinned to the top while the rows scroll', () => {
    cy.visit('/webbings?view=table')
    cy.get('[data-cy="gear-table-scroll"]').scrollTo('bottom')
    cy.get('[data-cy="gear-table-scroll"]').then(($box) => {
      const top = $box[0].getBoundingClientRect().top
      // Two rows travel together: the "Stretch @ kN" group heading at the very
      // top, the column labels directly under it.
      cy.get('[data-cy="gear-table-group"]').then(($group) => {
        expect($group[0].getBoundingClientRect().top).to.be.closeTo(top, 2)
      })
      cy.get(`${HEADER}[data-field="width"]`).then(($th) => {
        const label = $th[0].getBoundingClientRect()
        expect(label.top).to.be.greaterThan(top)
        expect(label.top).to.be.lessThan(top + 40)
      })
    })
  })
})

describe('Table view — below lg', () => {
  beforeEach(() => cy.viewport(390, 844))

  it('the Table button is absent on a phone', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="view-table"]').should('not.exist')
  })

  // The link keeps its intent — widening the window brings the table back — but
  // a phone gets Cards, because a frozen-column table has nowhere to freeze.
  it('a deep-linked ?view=table renders Cards instead', () => {
    cy.visit('/webbings?view=table')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get(TABLE).should('not.exist')
    cy.url().should('include', 'view=table')
  })
})

// Every gear type gets the mode, and every one of them gets its own spec set.
GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Table view — ${label}`, () => {
    it('renders one row per item, with that type\'s spec rows as columns', () => {
      // Row count comes from the API, like every other data-driven assertion in
      // the suite — and a gear type the database holds nothing for shows the
      // empty state rather than a headerless table.
      cy.fetchAllItems(apiPath).then((all) => {
        cy.visit(`/${slug}?view=table`)
        if (all.length === 0) {
          cy.get('[data-cy="empty-state"]').should('be.visible')
          return
        }
        cy.get(TABLE).should('be.visible')
        cy.get(HEADER).should('have.length.greaterThan', 2)
        cy.get(HEADER).first().should('have.attr', 'data-field', 'name')
        cy.get(ROW).should('have.length', all.length)
      })
    })
  })
})
