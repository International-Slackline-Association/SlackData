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

  it('max 4 items can be selected; the 5th card\'s Compare button is disabled', () => {
    for (let i = 0; i < 4; i++) {
      cy.get('[data-cy="gear-card"]').eq(i).find('[data-cy="btn-compare"]').click()
    }
    cy.get('[data-cy="gear-card"]').eq(4)
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

  it('honours the 4-item cap — the 5th panel\'s Compare button is disabled', () => {
    for (let i = 0; i < 4; i++) detailedCompare(i).click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '4')
    detailedCompare(4).should('be.disabled')
  })

  it('an unselected panel stays enabled below the cap', () => {
    detailedCompare(0).click()
    detailedCompare(4).should('not.be.disabled')
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
