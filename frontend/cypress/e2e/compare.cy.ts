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
