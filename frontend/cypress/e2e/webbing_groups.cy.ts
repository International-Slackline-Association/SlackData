// A product whose specs depend on its maker or batch — Slack.fr's and Slack
// Inov's Reggae — is one webbing row per version, sharing a `product_group`,
// and shows like the connector groups: ONE card on the listing, and on either
// member's page the product with a per-version table (src/utils/groups.ts,
// components/gear/VendorTable.tsx). Real backend: the group is found through
// the API, and the assertions compare against what the rows actually state.

import { listingUnits } from '../support/listing'

type Row = Record<string, unknown>

const GROUP = 'Reggae'

describe('Webbing groups (maker- or batch-dependent specs)', () => {
  let rows: Row[]
  let members: Row[]

  before(() => {
    cy.fetchAllItems('webbing').then((all) => {
      rows = all as Row[]
      members = rows.filter(r => r.product_group === GROUP)
      expect(members.map(m => m.brand_name).sort(), 'the Reggae group').to.deep.equal(['Slack Inov', 'Slack.fr'])
    })
  })

  it('shows the group as one card, so the grid has one card fewer than rows', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length', listingUnits(rows).length)
    cy.get('[data-cy="gear-card"]').its('length').should('equal', rows.length - (members.length - 1))
  })

  it('the card names the product, lists both makers, and shows weight as a range', () => {
    const weights = members.map(m => Number(m.weight))
    const lo = Math.min(...weights)
    const hi = Math.max(...weights)
    cy.visit(`/webbings?q=${GROUP}`)
    cy.contains('[data-cy="gear-card-name"]', new RegExp(`^${GROUP}$`))
      .parents('[data-cy="gear-card"]')
      .within(() => {
        cy.get('[data-cy="group-vendors"]').should('have.attr', 'data-count', '2')
        cy.get('[data-cy="group-vendors"]').should('contain.text', 'Slack.fr').and('contain.text', 'Slack Inov')
        cy.get('[data-cy="gear-card-specs"]').should('contain.text', `${lo}–${hi} g/m`)
      })
  })

  it('each member opens as the product, with a version table highlighting it', () => {
    for (const member of members) {
      cy.visit(`/webbings/${member.id}`)
      cy.get('[data-cy="detail-name"]').should('contain.text', GROUP)
      cy.get('[data-cy="group-vendors"]').should('have.attr', 'data-count', '2')
      cy.get('[data-cy="vendor-table"]')
        .should('have.attr', 'data-group', GROUP)
        .and('contain.text', `${members.length} versions`)
      cy.get('[data-cy="vendor-row"]').should('have.length', members.length)
      cy.get(`[data-cy="vendor-row"][data-id="${member.id}"]`).should('have.attr', 'data-current', 'true')
      cy.get(`[data-cy="vendor-row"][data-id="${member.id}"]`).should('have.attr', 'data-brand', String(member.brand_name))
    }
  })

  it('each version row states its own figures', () => {
    cy.visit(`/webbings/${members[0].id}`)
    for (const m of members) {
      cy.get(`[data-cy="vendor-row"][data-id="${m.id}"]`).within(() => {
        cy.get('[data-field="weight"]').should('contain.text', `${Number(m.weight)} g/m`)
        cy.get('[data-field="breaking_strength"]').should('contain.text', `${Number(m.breaking_strength)} kN`)
      })
    }
  })

  it('the spec sheet keeps what the makers agree on and drops what they do not', () => {
    const agree = (f: string) => new Set(members.map(m => JSON.stringify(m[f] ?? null))).size === 1
    expect(agree('width'), 'both makers state the same width').to.equal(true)
    expect(agree('weight'), 'the makers state different weights').to.equal(false)
    cy.visit(`/webbings/${members[0].id}`)
    cy.get('[data-cy="spec-row"][data-field="width"]').should('contain.text', `${members[0].width} mm`)
    cy.get('[data-cy="spec-row"][data-field="weight"]').should('not.exist')
    cy.get('[data-cy="spec-row"][data-field="breaking_strength"]').should('not.exist')
  })

  it('shows one stretch curve on the spec sheet, never an overlay of the versions', () => {
    // The curves are stored differently (one is measured further), yet are one curve.
    expect(new Set(members.map(m => m.stretch)).size, 'the stored curves differ').to.equal(2)
    cy.visit(`/webbings/${members[0].id}`)
    cy.get('[data-cy="spec-row"][data-field="stretch"]').should('exist')
    cy.get('[data-cy="vendor-table"] [data-cy="stretch-chart"]').should('not.exist')
  })

  it('comparing the card adds every version, each its own item', () => {
    cy.visit(`/webbings?q=${GROUP}`)
    cy.contains('[data-cy="gear-card-name"]', new RegExp(`^${GROUP}$`))
      .parents('[data-cy="gear-card"]')
      .find('[data-cy="btn-compare"]')
      .click()
      .should('have.attr', 'data-active', 'true')
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', `${members.length} items`)
    // The chips share a name, so each carries its maker.
    cy.get('[data-cy="compare-bar-item-name"]').should('contain.text', `Slack.fr ${GROUP}`)
    cy.get('[data-cy="compare-bar-item-name"]').should('contain.text', `Slack Inov ${GROUP}`)
    // One version removed from the bar — Slack.fr's — leaves Slack Inov's,
    // still named with its maker rather than passing for the whole product.
    cy.contains('[data-cy="compare-bar-item"]', `Slack.fr ${GROUP}`).find('[data-cy="compare-bar-remove"]').click()
    cy.get('[data-cy="compare-bar-count"]').should('contain.text', '1 item')
    cy.get('[data-cy="compare-bar-item-name"]').should('have.length', 1).and('have.text', `Slack Inov ${GROUP}`)
    // The card still reads as picked, and its button then takes the rest off.
    cy.contains('[data-cy="gear-card-name"]', new RegExp(`^${GROUP}$`))
      .parents('[data-cy="gear-card"]')
      .find('[data-cy="btn-compare"]')
      .should('have.attr', 'data-active', 'true')
      .click()
    cy.get('[data-cy="compare-bar"]').should('not.exist')
  })

  it('one version can be taken off the compare page, leaving the other named by its maker', () => {
    const fr = members.find(m => m.brand_name === 'Slack.fr')!
    const inov = members.find(m => m.brand_name === 'Slack Inov')!
    cy.visit(`/webbings/compare?ids=${fr.id},${inov.id}`)
    cy.get('[data-cy="compare-col"]').should('have.length', 2)
    // Both curves are charted, each labelled with its maker.
    cy.get('[data-cy="stretch-chart"]')
      .should('contain.text', `Slack.fr ${GROUP}`)
      .and('contain.text', `Slack Inov ${GROUP}`)
    cy.get(`[data-cy="compare-col"][data-id="${fr.id}"] [data-cy="compare-col-remove"]`).click()
    cy.location('search').should('eq', `?ids=${inov.id}`)
    cy.get('[data-cy="compare-col"]').should('have.length', 1)
    cy.get('[data-cy="compare-col"]').should('have.attr', 'data-id', String(inov.id))
    cy.get('[data-cy="compare-col-brand"]').should('have.text', 'Slack Inov')
    cy.get('[data-cy="compare-col-name"]').should('have.text', GROUP)
  })

  it('every version row with a page links to it', () => {
    cy.visit(`/webbings/${members[0].id}`)
    const withUrl = members.filter(m => typeof m.product_url === 'string' && m.product_url !== '')
    cy.get('[data-cy="vendor-link"]').should('have.length', withUrl.length)
  })
})
