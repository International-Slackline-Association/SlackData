// Compare feature tests.
//
// data-cy contract:
//   btn-compare              — compare button on each gear card
//   compare-bar              — sticky bottom bar; exists only when ≥1 item selected
//   compare-bar-count        — "N items" label inside the bar
//   compare-bar-item         — chip for each selected item
//   compare-bar-item-name    — item name inside the chip
//   compare-bar-remove       — × button on a chip to deselect that item
//   compare-bar-clear        — "Clear all" button in the bar
//   compare-bar-view-btn     — "Compare" CTA; disabled when only 1 item selected
//   compare-table            — the side-by-side spec table on the compare page
//   compare-col              — one item column (carries data-id attribute)
//   compare-col-name         — the item name in the column header
//   compare-row              — one spec row (carries data-field attribute)
//   compare-field-label      — the label cell on the left of each row
//   compare-back-link        — "← Webbings" link returning to the listing

describe('Compare bar — selection', () => {
  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('compare bar is not visible before any item is selected', () => {
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })

  it('clicking Compare on a card shows the compare bar', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
  })

  it('compare bar shows the selected item name as a chip', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="gear-card-name"]').invoke('text').then((name) => {
        cy.get('[data-cy="gear-card"]').first()
          .find('[data-cy="btn-compare"]').click()
        cy.get('[data-cy="compare-bar-item-name"]').first()
          .should('contain.text', name.trim())
      })
  })

  it('compare bar shows count 1 after one selection', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  it('selecting a second item increments the count to 2', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '2')
  })

  it('the selected card\'s Compare button shows data-active="true"', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="btn-compare"]').click()
      .should('have.attr', 'data-active', 'true')
  })

  it('clicking Compare again on a selected card deselects it', () => {
    cy.get('[data-cy="gear-card"]').first()
      .find('[data-cy="btn-compare"]').as('btn').click()
    cy.get('@btn').click()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })

  it('clicking × on a chip removes that item from the bar', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-item"]').first()
      .find('[data-cy="compare-bar-remove"]').click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  it('"Clear all" removes all selections and hides the bar', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-clear"]').click()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })

  it('the Compare CTA is disabled when only 1 item is selected', () => {
    cy.get('[data-cy="gear-card"]').first().find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-view-btn"]').should('be.disabled')
  })

  it('the Compare CTA is enabled when 2 or more items are selected', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-view-btn"]').should('not.be.disabled')
  })

  it('max 10 items can be selected; the 11th card\'s Compare button is disabled', () => {
    for (let i = 0; i < 10; i++) {
      cy.get('[data-cy="gear-card"]').eq(i).find('[data-cy="btn-compare"]').click()
    }
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '10')
    cy.get('[data-cy="gear-card"]').eq(10)
      .find('[data-cy="btn-compare"]').should('be.disabled')
  })

  it('switching to a different gear type clears the compare selection', () => {
    cy.get('[data-cy="gear-card"]').first().find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="nav-tab"]').contains('Weblocks').click()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })
})

describe('Compare view — side-by-side table', () => {
  let name0: string
  let name1: string

  beforeEach(() => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').eq(0)
      .find('[data-cy="gear-card-name"]').invoke('text').then((n) => { name0 = n.trim() })
    cy.get('[data-cy="gear-card"]').eq(1)
      .find('[data-cy="gear-card-name"]').invoke('text').then((n) => { name1 = n.trim() })
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="gear-card"]').eq(1).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar-view-btn"]').click()
  })

  it('navigates to a compare URL', () => {
    cy.url().should('match', /\/compare|\/webbings\/compare/)
  })

  it('shows one column per selected item', () => {
    cy.get('[data-cy="compare-col"]').should('have.length', 2)
  })

  it('carries ten columns — the cap, not four', () => {
    cy.request(`${Cypress.env('apiUrl')}/webbing/?limit=10`).then(({ body }) => {
      const ids = (body as { id: number }[]).map(r => r.id)
      cy.visit(`/webbings/compare?ids=${ids.join(',')}`)
      cy.get('[data-cy="compare-col"]').should('have.length', 10)
    })
  })

  it('each column header shows the item name', () => {
    cy.get('[data-cy="compare-col"]').eq(0)
      .find('[data-cy="compare-col-name"]').should('contain.text', name0)
    cy.get('[data-cy="compare-col"]').eq(1)
      .find('[data-cy="compare-col-name"]').should('contain.text', name1)
  })

  it('shows rows for the relevant spec fields', () => {
    cy.get('[data-cy="compare-row"]').should('have.length.gte', 3)
  })

  // The price row — the reason you can compare two weblocks on cost at all — is
  // specified in currency.cy.ts, because its content depends on the selected
  // display currency. Only its existence is anyone's business here.
  it('includes price among the compared fields', () => {
    cy.get('[data-cy="compare-row"][data-field="price"]').should('exist')
  })

  // A row no item in the dataset populates can never distinguish anything, so
  // ComparePage drops it rather than drawing an all-"—" stripe. `colors` is the
  // live example: on the webbing model, but null for every seeded row.
  it('omits spec rows that no item in the gear type populates', () => {
    cy.get('[data-cy="compare-row"][data-field="colors"]').should('not.exist')
  })

  it('each row has a field label in the left column', () => {
    cy.get('[data-cy="compare-row"]').each(($row) => {
      cy.wrap($row).find('[data-cy="compare-field-label"]').should('not.be.empty')
    })
  })

  it('shows a back link that returns to the gear listing', () => {
    cy.get('[data-cy="compare-back-link"]').should('be.visible').click()
    cy.url().should('include', '/webbings')
  })

  it('the compare URL is deep-linkable — revisiting it restores the same comparison', () => {
    cy.url().then((compareUrl) => {
      cy.visit(compareUrl)
      cy.get('[data-cy="compare-col"]').should('have.length', 2)
      cy.get('[data-cy="compare-col-name"]').first().should('contain.text', name0)
    })
  })
})

// The Detailed view is the listing's other density (DESIGN.md § Detailed View).
// Its panels reuse GearDetailBody with `showActions`, so they render the SAME
// btn-compare hook as the cards — and must drive the SAME selection state.
//
// Scoping matters here: the card grid stays mounted-but-hidden behind
// `display:none` when Detailed is active, so a bare [data-cy="btn-compare"]
// matches the hidden grid buttons too. Every selector below is scoped to
// [data-cy="gear-detailed-row"] so it can only resolve to a detailed panel.
describe('Compare — Detailed view', () => {
  const detailedCompare = (i: number) =>
    cy.get('[data-cy="gear-detailed-row"]').eq(i).find('[data-cy="btn-compare"]')

  beforeEach(() => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-list"]').should('be.visible')
    // Wait for the panels themselves, not just their container. The detailed
    // view mounts a full spec sheet per item (hundreds of them), so the list
    // element appears well before React has committed the rows — clicking in
    // that window lands on a node that is about to be replaced, and the click
    // is swallowed.
    cy.get('[data-cy="gear-detailed-row"]').should('have.length.greaterThan', 0)
  })

  it('clicking Compare on a detailed panel shows the compare bar', () => {
    cy.get('[data-cy="compare-bar"]').should('not.exist')
    detailedCompare(0).click()
    cy.get('[data-cy="compare-bar"]').should('be.visible')
  })

  it('the compare bar counts a selection made from a detailed panel', () => {
    detailedCompare(0).click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  it('the compare bar chip carries the detailed panel\'s item name', () => {
    cy.get('[data-cy="gear-detailed-row"]').eq(0)
      .find('[data-cy="detail-name"]').invoke('text').then((name) => {
        detailedCompare(0).click()
        cy.get('[data-cy="compare-bar-item-name"]').first()
          .should('contain.text', name.trim())
      })
  })

  it('the selected panel\'s Compare button shows data-active="true"', () => {
    detailedCompare(0).click().should('have.attr', 'data-active', 'true')
  })

  it('clicking Compare again on a selected panel deselects it', () => {
    // Assert the button's own state between the two clicks. It retries until
    // the first click has actually been committed, so the second click can't
    // race ahead of it and land while the panel is still unselected (which
    // would toggle it ON and leave the bar up, failing confusingly).
    detailedCompare(0).click().should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
    detailedCompare(0).click().should('have.attr', 'data-active', 'false')
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })

  it('selecting two panels enables the Compare CTA and opens the comparison', () => {
    detailedCompare(0).click()
    detailedCompare(1).click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '2')
    cy.get('[data-cy="compare-bar-view-btn"]').should('not.be.disabled').click()
    cy.url().should('include', '/webbings/compare?ids=')
    cy.get('[data-cy="compare-col"]').should('have.length', 2)
  })

  it('honours the 10-item cap — the 11th panel\'s Compare button is disabled', () => {
    for (let i = 0; i < 10; i++) detailedCompare(i).click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '10')
    detailedCompare(10).should('be.disabled')
  })

  it('an unselected panel stays enabled below the cap', () => {
    detailedCompare(0).click()
    detailedCompare(10).should('not.be.disabled')
  })
})

// Selection is owned by GearListingPage, above both views — so it must survive
// a density switch in either direction rather than living inside one of them.
describe('Compare — selection shared across Cards and Detailed views', () => {
  beforeEach(() => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })

  it('a selection made in Cards view is still active in Detailed view', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').eq(0)
      .find('[data-cy="btn-compare"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  it('a selection made in Detailed view is still active back in Cards view', () => {
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').eq(0)
      .find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="view-cards"]').click()
    cy.get('[data-cy="gear-card"]').eq(0)
      .find('[data-cy="btn-compare"]').should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1')
  })

  it('deselecting in Detailed view clears the selection shown in Cards view', () => {
    cy.get('[data-cy="gear-card"]').eq(0).find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-row"]').eq(0)
      .find('[data-cy="btn-compare"]').click()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
    cy.get('[data-cy="view-cards"]').click()
    cy.get('[data-cy="gear-card"]').eq(0)
      .find('[data-cy="btn-compare"]').should('have.attr', 'data-active', 'false')
  })
})

// The stretch curve on compare — DESIGN.md § Compare View → "Stretch is a chart,
// not a table". Four columns of "5.9% @ 10 kN · 7.1% @ 15 kN · …" is the thing a
// comparison view exists to avoid: a curve is a shape, so it is drawn.
//
// data-cy contract:
//   stretch-chart              — the whole panel (webbings, ≥2 curves)
//   stretch-chart-svg          — the plot itself
//   stretch-chart-line         — one polyline per compared webbing (data-id)
//   stretch-chart-point        — one marker per MEASURED point (data-id, data-kn)
//   stretch-chart-label        — direct label at the end of a line (data-id)
//   stretch-chart-legend-item  — legend entry (data-id)
//   stretch-chart-missing      — "No stretch data: …" note for uncharted picks
//   stretch-chart-out-of-range — note naming a webbing measured only above 20 kN
//   stretch-chart-expand       — "Show all loads →" / "Show 1–20 kN" window toggle
//   stretch-chart-toggle       — Chart | Table switch
//   stretch-view-chart / stretch-view-table — its two buttons
//   stretch-chart-table        — the same data as a grid (the accessible view)
describe('Compare — webbing stretch renders as a chart', () => {
  const api = () => Cypress.env('apiUrl')

  // Mirrors displayPoints() in src/utils/stretch.ts (see gear_detail.cy.ts).
  const displayPoints = (raw: unknown): { kn: number; percent: number }[] => {
    if (typeof raw !== 'string' || raw === '') return []
    let pts: { kn: number; percent: number }[] = []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      pts = parsed.filter(
        (p: unknown): p is { kn: number; percent: number } =>
          !!p && typeof p === 'object' &&
          typeof (p as { kn: unknown }).kn === 'number' &&
          typeof (p as { percent: unknown }).percent === 'number',
      )
    } catch {
      return []
    }
    const nonZero = pts.filter(p => p.kn !== 0)
    return [...(nonZero.length ? nonZero : pts)].sort((a, b) => a.kn - b.kn)
  }

  type Row = Record<string, unknown>
  const webbings = (fn: (rows: Row[]) => void) =>
    cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => fn(body as Row[]))

  // Two webbings that both carry a real curve — the case the chart is for.
  const withCurves = (fn: (a: Row, b: Row) => void) =>
    webbings(rows => {
      const curved = rows.filter(r => displayPoints(r.stretch).length >= 2)
      expect(curved.length, 'webbings with a stretch curve').to.be.greaterThan(1)
      fn(curved[0], curved[1])
    })

  const compare = (...ids: unknown[]) => cy.visit(`/webbings/compare?ids=${ids.join(',')}`)

  it('draws the chart panel instead of a stretch row in the table', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart"]').should('be.visible')
      // The chart IS the row — it must not also be printed as text above it.
      cy.get('[data-cy="compare-row"][data-field="stretch"]').should('not.exist')
    })
  })

  it('draws one line per compared webbing, and one marker per measured point', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-line"]').should('have.length', 2)
      cy.get(`[data-cy="stretch-chart-line"][data-id="${a.id}"]`).should('exist')
      cy.get(`[data-cy="stretch-chart-point"][data-id="${a.id}"]`)
        .should('have.length', displayPoints(a.stretch).length)
      // Nothing is interpolated: no marker sits at a load this webbing never
      // measured, and 0 kN is dropped from every curve.
      cy.get(`[data-cy="stretch-chart-point"][data-id="${a.id}"]`).each(($p) => {
        const kn = Number($p.attr('data-kn'))
        expect(displayPoints(a.stretch).map(p => p.kn)).to.include(kn)
      })
      cy.get('[data-cy="stretch-chart-point"][data-kn="0"]').should('not.exist')
    })
  })

  it('identifies every series by name, not by colour alone', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-legend-item"]').should('have.length', 2)
      cy.get(`[data-cy="stretch-chart-legend-item"][data-id="${b.id}"]`)
        .should('contain.text', String(b.name))
      cy.get(`[data-cy="stretch-chart-label"][data-id="${b.id}"]`).should('exist')
    })
  })

  // Two curves ending at nearly the same stretch is the interesting case, not an
  // edge case — near-identical webbings are what people compare. Their direct
  // labels must not print on top of each other.
  it('never overlaps two direct labels, however close the curves end', () => {
    webbings(rows => {
      const curved = rows.filter(r => displayPoints(r.stretch).length >= 2)
      const end = (r: Row) => {
        const pts = displayPoints(r.stretch)
        return pts[pts.length - 1]
      }
      // The closest-ending pair measured at the same final load — the worst
      // case the declutter pass has to handle.
      let pair: [Row, Row] | null = null
      let best = Infinity
      for (let i = 0; i < curved.length; i++) {
        for (let j = i + 1; j < curved.length; j++) {
          const a = end(curved[i]); const b = end(curved[j])
          if (a.kn !== b.kn) continue
          const d = Math.abs(a.percent - b.percent)
          if (d < best) { best = d; pair = [curved[i], curved[j]] }
        }
      }
      if (!pair) return
      compare(pair[0].id, pair[1].id)
      cy.get('[data-cy="stretch-chart-label"]').then(($labels) => {
        const boxes = [...$labels].map(l => l.getBoundingClientRect())
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const overlap =
              boxes[i].left < boxes[j].right && boxes[j].left < boxes[i].right &&
              boxes[i].top < boxes[j].bottom && boxes[j].top < boxes[i].bottom
            expect(overlap, `labels ${i} and ${j} overlap`).to.eq(false)
          }
        }
      })
    })
  })

  // A label belongs beside the point it names — a leader line out to a gutter is
  // a horizontal stroke in the series colour, which on a webbing measured at one
  // load reads as a flat curve. So: close to its endpoint, and clear of every
  // drawn line.
  it('keeps each label beside its own line and off every curve', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-label"]').each(($l) => {
        const id = $l.attr('data-id')
        cy.get(`[data-cy="stretch-chart-point"][data-id="${id}"]`).last().then(($pt) => {
          const label = $l[0].getBoundingClientRect()
          const point = $pt[0].getBoundingClientRect()
          expect(label.left - point.right, 'gap from its last point, px')
            .to.be.within(0, 60)
        })
      })
      // Whether a label covers a LINE is geometry, not layout, and is pinned
      // exactly in tests/unit/chart.test.ts (segmentHitsBox / placeLabels) —
      // a polyline's bounding box is not its line, so asserting it here would
      // only produce a flaky approximation.
    })
  })

  it('gives each series its own colour, assigned by column and never repeated', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-line"]').then(($lines) => {
        const colors = [...$lines].map(l => l.getAttribute('stroke'))
        expect(new Set(colors).size, 'distinct series colours').to.eq(colors.length)
      })
    })
  })

  it('y starts at zero — a truncated baseline would exaggerate the difference', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-y-tick"]').first().should('have.text', '0%')
    })
  })

  it('names a compared webbing that has no curve rather than dropping it silently', () => {
    webbings(rows => {
      const curved = rows.filter(r => displayPoints(r.stretch).length >= 2)
      const bare = rows.find(r => displayPoints(r.stretch).length === 0)
      if (!bare) return
      compare(curved[0].id, curved[1].id, bare.id)
      cy.get('[data-cy="stretch-chart-missing"]').should('contain.text', String(bare.name))
      cy.get(`[data-cy="stretch-chart-line"][data-id="${bare.id}"]`).should('not.exist')
    })
  })

  it('offers the same data as a table — the accessible equivalent of the chart', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-table"]').should('not.exist')
      cy.get('[data-cy="stretch-view-table"]').click()
      cy.get('[data-cy="stretch-chart-svg"]').should('not.exist')
      cy.get('[data-cy="stretch-chart-table"]').should('be.visible')
      cy.get('[data-cy="stretch-chart-table"]').should('contain.text', String(a.name))
      const pt = displayPoints(a.stretch)[0]
      cy.get(`[data-cy="stretch-table-cell"][data-id="${a.id}"][data-kn="${pt.kn}"]`)
        .should('contain.text', String(pt.percent))
      cy.get('[data-cy="stretch-view-chart"]').click()
      cy.get('[data-cy="stretch-chart-svg"]').should('be.visible')
    })
  })

  it('reports every series measured at a load when the plot is hovered', () => {
    withCurves((a, b) => {
      compare(a.id, b.id)
      cy.get('[data-cy="stretch-chart-point"]').first().trigger('mouseover')
      cy.get('[data-cy="stretch-chart-tooltip"]').should('be.visible')
        .and('contain.text', 'kN')
    })
  })

  // One curve is a detail-page question; the comparison starts at two. And no
  // other gear type carries a curve at all.
  it('keeps the table row when only one compared webbing has a curve', () => {
    webbings(rows => {
      const curved = rows.find(r => displayPoints(r.stretch).length >= 2)
      const bare = rows.find(r => displayPoints(r.stretch).length === 0)
      if (!curved || !bare) return
      compare(curved.id, bare.id)
      cy.get('[data-cy="stretch-chart"]').should('not.exist')
      cy.get('[data-cy="compare-row"][data-field="stretch"]').should('exist')
    })
  })

  // The default window: 1–20 kN. Slackline working loads live there, and a curve
  // measured to 100 kN otherwise squashes the interesting part of every line
  // into the first fifth of the plot. DESIGN.md § Compare View.
  describe('the 1–20 kN window', () => {
    // Two webbings that both have points inside the window AND at least one
    // point beyond it — the only case where the expand control means anything.
    const withLongCurves = (fn: (a: Row, b: Row) => void) =>
      webbings(rows => {
        const long = rows.filter(r => {
          const pts = displayPoints(r.stretch)
          return pts.some(p => p.kn <= 20) && pts.some(p => p.kn > 20)
        })
        if (long.length < 2) return
        fn(long[0], long[1])
      })

    it('plots nothing above 20 kN by default', () => {
      withLongCurves((a, b) => {
        compare(a.id, b.id)
        cy.get('[data-cy="stretch-chart-point"]').each(($p) => {
          expect(Number($p.attr('data-kn'))).to.be.at.most(20)
        })
        cy.get(`[data-cy="stretch-chart-point"][data-id="${a.id}"]`)
          .should('have.length', displayPoints(a.stretch).filter(p => p.kn <= 20).length)
      })
    })

    it('the x axis ends at the window, not at the longest curve', () => {
      withLongCurves((a, b) => {
        compare(a.id, b.id)
        cy.get('[data-cy="stretch-chart-x-tick"]').last().invoke('text').then((t) => {
          expect(Number(t.replace(' kN', ''))).to.be.at.most(20)
        })
      })
    })

    it('expands to the full measured range, and back again', () => {
      withLongCurves((a, b) => {
        const beyond = displayPoints(a.stretch).find(p => p.kn > 20)!
        compare(a.id, b.id)
        cy.get(`[data-cy="stretch-chart-point"][data-kn="${beyond.kn}"]`).should('not.exist')
        cy.get('[data-cy="stretch-chart-expand"]').should('be.visible').click()
        cy.get(`[data-cy="stretch-chart-point"][data-id="${a.id}"][data-kn="${beyond.kn}"]`)
          .should('exist')
        cy.get('[data-cy="stretch-chart-expand"]').click()
        cy.get(`[data-cy="stretch-chart-point"][data-kn="${beyond.kn}"]`).should('not.exist')
      })
    })

    // The window is a statement about which loads are under discussion, so the
    // table view honours it too rather than quietly showing a different dataset.
    it('the table view shows the same window as the chart', () => {
      withLongCurves((a, b) => {
        const beyond = displayPoints(a.stretch).find(p => p.kn > 20)!
        compare(a.id, b.id)
        cy.get('[data-cy="stretch-view-table"]').click()
        cy.get(`[data-cy="stretch-table-load"][data-kn="${beyond.kn}"]`).should('not.exist')
        cy.get('[data-cy="stretch-chart-expand"]').click()
        cy.get(`[data-cy="stretch-table-load"][data-kn="${beyond.kn}"]`).should('exist')
      })
    })

    it('offers no expand control when nothing was measured above 20 kN', () => {
      webbings(rows => {
        const short = rows.filter(r => {
          const pts = displayPoints(r.stretch)
          return pts.length >= 2 && pts.every(p => p.kn <= 20)
        })
        if (short.length < 2) return
        compare(short[0].id, short[1].id)
        cy.get('[data-cy="stretch-chart"]').should('exist')
        cy.get('[data-cy="stretch-chart-expand"]').should('not.exist')
      })
    })

    it('names a webbing measured only above the window rather than dropping it', () => {
      webbings(rows => {
        const inside = rows.filter(r => displayPoints(r.stretch).filter(p => p.kn <= 20).length >= 2)
        const outside = rows.find(r => {
          const pts = displayPoints(r.stretch)
          return pts.length > 0 && pts.every(p => p.kn > 20)
        })
        if (inside.length < 2 || !outside) return
        compare(inside[0].id, inside[1].id, outside.id)
        cy.get('[data-cy="stretch-chart-out-of-range"]').should('contain.text', String(outside.name))
        cy.get(`[data-cy="stretch-chart-line"][data-id="${outside.id}"]`).should('not.exist')
        cy.get('[data-cy="stretch-chart-expand"]').click()
        cy.get(`[data-cy="stretch-chart-line"][data-id="${outside.id}"]`).should('exist')
      })
    })

    // Clamping must never turn a comparison into a single line: if only one
    // webbing has readings inside the window, the panel opens on the full range.
    it('opens on the full range when the window leaves only one curve', () => {
      webbings(rows => {
        const inside = rows.find(r => displayPoints(r.stretch).filter(p => p.kn <= 20).length >= 2)
        const outside = rows.find(r => {
          const pts = displayPoints(r.stretch)
          return pts.length >= 2 && pts.every(p => p.kn > 20)
        })
        if (!inside || !outside) return
        compare(inside.id, outside.id)
        cy.get('[data-cy="stretch-chart-line"]').should('have.length', 2)
      })
    })
  })

  // Ten items can be compared, but eight is where a validated categorical colour
  // scale ends — a ninth line would be an indistinguishable gray or a repeated
  // hue. The plot draws eight and names the rest; the table carries them all.
  it('plots at most eight lines and names the ones it left out', () => {
    webbings(rows => {
      const curved = rows.filter(r => displayPoints(r.stretch).length >= 2).slice(0, 10)
      if (curved.length < 9) return
      compare(...curved.map(r => r.id))
      cy.get('[data-cy="stretch-chart-line"]').should('have.length', 8)
      cy.get('[data-cy="stretch-chart-over-cap"]')
        .should('contain.text', String(curved[8].name))
      cy.get('[data-cy="stretch-view-table"]').click()
      // Nothing is lost — the table still holds every compared curve.
      cy.get(`[data-cy="stretch-table-cell"][data-id="${curved[8].id}"]`).should('exist')
    })
  })

  it('draws no chart for a gear type with no stretch field', () => {
    cy.request(`${api()}/weblock/?limit=2`).then(({ body }) => {
      const rows = body as Row[]
      cy.visit(`/weblocks/compare?ids=${rows[0].id},${rows[1].id}`)
      cy.get('[data-cy="compare-table"]').should('exist')
      cy.get('[data-cy="stretch-chart"]').should('not.exist')
    })
  })
})
