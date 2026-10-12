// Generic connectors several shops sell — one catalogue row per shop, sharing a
// `product_group` — show as ONE card on the listing and as the part, with a
// shop-by-shop vendor table, on any member's detail page (src/utils/groups.ts).
// Real backend, like every other spec: the groups are whatever connectors.json
// holds, found through the API rather than hard-coded.

import { listingUnits } from '../support/listing'

type Row = Record<string, unknown>

function groupsOf(rows: Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const g = r.product_group
    if (typeof g !== 'string' || g === '') continue
    groups.set(g, [...(groups.get(g) ?? []), r])
  }
  return groups
}

describe('Connector groups', () => {
  let rows: Row[]
  let biggest: [string, Row[]]

  before(() => {
    cy.fetchAllItems('connector').then((all) => {
      rows = all as Row[]
      const groups = [...groupsOf(rows)].filter(([, m]) => m.length >= 2)
      expect(groups.length, 'the seed holds at least one generic-part group').to.be.greaterThan(0)
      biggest = groups.sort((a, b) => b[1].length - a[1].length)[0]
    })
  })

  it('shows each group as one card, so the grid has fewer cards than shop rows', () => {
    cy.visit('/connectors')
    cy.get('[data-cy="gear-card"]').should('have.length', listingUnits(rows).length)
    cy.get('[data-cy="gear-card"]').its('length').should('be.lessThan', rows.length)
  })

  it('names the group, lists its shops, and shows numbers as ranges', () => {
    const [group, members] = biggest
    cy.visit(`/connectors?q=${encodeURIComponent(group.split(',')[0])}`)
    cy.contains('[data-cy="gear-card-name"]', group)
      .parents('[data-cy="gear-card"]')
      .within(() => {
        const shops = new Set(members.map(m => String(m.brand_name))).size
        cy.get('[data-cy="group-vendors"]').should('have.attr', 'data-count', String(shops))
      })
  })

  it('a member opens as the part: group name, no one shop as maker, vendor table', () => {
    const [group, members] = biggest
    const member = members[members.length - 1]
    cy.visit(`/connectors/${member.id}`)
    cy.get('[data-cy="detail-name"]').should('contain.text', group)
    cy.get('[data-cy="group-vendors"]').should('exist')
    cy.get('[data-cy="vendor-table"]').should('have.attr', 'data-group', group)
    cy.get('[data-cy="vendor-row"]').should('have.length', members.length)
    // The shop whose page this is, highlighted.
    cy.get(`[data-cy="vendor-row"][data-id="${member.id}"]`).should('have.attr', 'data-current', 'true')
  })

  it('leaves a spec the shops disagree on out of the spec sheet', () => {
    const [, members] = biggest
    const disputed = ['mbs_straight_pull', 'opening', 'weight', 'pin_diameter'].find((f) => {
      const values = members.map(m => JSON.stringify(m[f] ?? null))
      return new Set(values).size > 1
    })
    if (!disputed) return
    cy.visit(`/connectors/${members[0].id}`)
    cy.get('[data-cy="vendor-table"]').should('exist')
    cy.get(`[data-cy="spec-row"][data-field="${disputed}"]`).should('not.exist')
  })

  it('the whole of another shop\'s row opens that shop\'s listing', () => {
    const [, members] = biggest
    const [here, other] = members
    cy.visit(`/connectors/${here.id}`)
    // The current row is the page you are on: no link anywhere in its cells.
    cy.get(`[data-cy="vendor-row"][data-id="${here.id}"] [data-field="price"] a`).should('not.exist')
    // A plain spec cell, nowhere near the name, is a real link (new tab works)…
    cy.get(`[data-cy="vendor-row"][data-id="${other.id}"] [data-field="price"] a`)
      .should('have.attr', 'href', `/connectors/${other.id}`)
      .click()
    cy.location('pathname').should('eq', `/connectors/${other.id}`)
    cy.get(`[data-cy="vendor-row"][data-id="${other.id}"]`).should('have.attr', 'data-current', 'true')
    // …and the shop cell, which holds a brand link of its own, opens the row
    // too when clicked beside that link.
    cy.visit(`/connectors/${here.id}`)
    cy.get(`[data-cy="vendor-row"][data-id="${other.id}"] td`).first().click('bottomRight')
    cy.location('pathname').should('eq', `/connectors/${other.id}`)
  })

  it('every vendor row with a page links to it', () => {
    const [, members] = biggest
    cy.visit(`/connectors/${members[0].id}`)
    const withUrl = members.filter(m => typeof m.product_url === 'string' && m.product_url !== '')
    cy.get('[data-cy="vendor-link"]').should('have.length', withUrl.length)
  })
})
