// Generic-part groups on the listing (src/utils/groups.ts): several shops'
// rows for one part become one card whose numbers are the min over the vendors
// still in play, with min..max kept for display.

import test from 'node:test'
import assert from 'node:assert/strict'
import { collapseGroups, groupFor, isGroupItem, rangeText } from '../../src/utils/groups.ts'

const row = (id: number, brand: string, extra: Record<string, unknown> = {}) => ({
  id, name: `D Shackle 8mm (${brand})`, brand_name: brand, product_group: 'D Shackle 8mm, Stainless',
  active: true, ...extra,
})

test('two or more vendors of a group collapse into one card', () => {
  const out = collapseGroups([
    row(1, 'Slacktivity', { mbs_straight_pull: 20, weight: 79 }),
    { id: 2, name: 'KingPin', brand_name: 'Slacktivity' },
    row(3, 'SlackGear', { mbs_straight_pull: 28, weight: 60 }),
  ])
  assert.equal(out.length, 2)
  const g = out.find(isGroupItem)!
  assert.equal(g.name, 'D Shackle 8mm, Stainless')
  assert.equal(g.mbs_straight_pull, 20, 'the card reports the lowest stated MBS')
  assert.deepEqual(g._ranges.mbs_straight_pull, [20, 28])
  assert.equal(g.brand_name, 'SlackGear, Slacktivity')
  assert.equal(g.id, 3, 'links to the first member in vendor order (current, then A→Z)')
})

test('a lone vendor stays a plain row', () => {
  const only = row(1, 'Slacktivity')
  assert.deepEqual(collapseGroups([only]), [only])
})

test('the group sits where its first member was', () => {
  const out = collapseGroups([
    { id: 9, name: 'A', brand_name: 'X' },
    row(1, 'Slacktivity'),
    { id: 8, name: 'B', brand_name: 'X' },
    row(2, 'BC'),
  ])
  assert.deepEqual(out.map(o => o.name), ['A', 'D Shackle 8mm, Stainless', 'B'])
})

test('price comes from the cheapest vendor as one set', () => {
  const g = collapseGroups([
    row(1, 'A', { price: 10, currency: 'EUR', price_base: 10, price_display: 11 }),
    row(2, 'B', { price: 50, currency: 'ZAR', price_base: 2.5, price_display: 2.75 }),
  ])[0]
  assert.deepEqual([g.price, g.currency, g.price_base], [50, 'ZAR', 2.5])
})

test('historic only when every vendor is', () => {
  assert.equal(collapseGroups([row(1, 'A', { active: false }), row(2, 'B', { active: true })])[0].active, true)
  assert.equal(collapseGroups([row(1, 'A', { active: false }), row(2, 'B', { active: false })])[0].active, false)
})

test('rangeText shows min–max, one value when they agree, plain value on a row', () => {
  const g = collapseGroups([row(1, 'A', { opening: 25 }), row(2, 'B', { opening: 25, mbs_straight_pull: 60 })])[0]
  assert.equal(rangeText(g, 'opening', 'mm'), '25 mm')
  assert.equal(rangeText(g, 'mbs_straight_pull', 'kN'), '60 kN')
  assert.equal(rangeText({ weight: 79 }, 'weight', 'g'), '79 g')
  assert.equal(rangeText({ weight: null }, 'weight', 'g'), '')
})

test('a spec the shops disagree on, or some leave blank, is marked as varying', () => {
  const g = collapseGroups([
    row(1, 'A', { mbs_straight_pull: 20, opening: 25, material: 'Stainless Steel', closure: 'Screw pin' }),
    row(2, 'B', { mbs_straight_pull: 29, opening: 25, material: 'Stainless Steel', closure: null }),
  ])[0]
  assert.ok(isGroupItem(g))
  assert.deepEqual(g._varies.sort(), ['closure', 'mbs_straight_pull'])
  assert.equal(g.material, 'Stainless Steel', 'agreed text stays')
  assert.equal(g.closure, null, 'disputed text is not the group\'s to state')
  assert.equal(g.opening, 25)
})

test('groupFor keys the group to the member whose page is open', () => {
  const a = row(1, 'A')
  const b = row(2, 'B')
  const g = groupFor([a, b], b)!
  assert.equal(g.id, 2)
  assert.equal(g._current, 2)
  assert.equal(g.name, 'D Shackle 8mm, Stainless')
  assert.equal(groupFor([a], a), null, 'a lone member is not a group')
})

test('a group can mix captive and loose pins; the flag then varies', () => {
  const g = collapseGroups([row(1, 'A', { captive_pin: true }), row(2, 'B', { captive_pin: false })])[0]
  assert.ok(isGroupItem(g))
  assert.ok(g._varies.includes('captive_pin'))
  assert.equal(g.captive_pin, null)
})
