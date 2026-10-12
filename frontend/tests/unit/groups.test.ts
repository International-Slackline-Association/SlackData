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

// A product whose specs depend on its maker or batch (Slack.fr's and Slack
// Inov's Reggae) groups the same way, over the webbing's own fields.
test('a webbing group ranges its own numbers and keeps one stretch curve, the longest', () => {
  const reggae = (id: number, brand: string, extra: Record<string, unknown>) => ({
    id, name: 'Reggae', brand_name: brand, product_group: 'Reggae', ...extra,
  })
  const [g] = collapseGroups([
    reggae(155, 'Slack.fr', { active: false, weight: 54, breaking_strength: 21, width: 25, stretch: '[{"kn":1,"percent":1.6}]' }),
    reggae(249, 'Slack Inov', { active: true, weight: 49, breaking_strength: 23.6, width: 25, stretch: '[{"kn":1,"percent":1.6},{"kn":2,"percent":3.9}]' }),
  ])
  assert.ok(isGroupItem(g))
  assert.equal(g.brand_name, 'Slack Inov, Slack.fr', 'the current maker first')
  assert.equal(rangeText(g, 'weight', 'g/m'), '49–54 g/m')
  assert.equal(rangeText(g, 'width', 'mm'), '25 mm')
  // Versions of one webbing are one curve measured to different loads.
  assert.ok(!g._varies.includes('stretch'))
  assert.equal(g.stretch, '[{"kn":1,"percent":1.6},{"kn":2,"percent":3.9}]')
  assert.ok(!g._varies.includes('width'))
})

test("a webbing member's detail page shows that member's own curve", () => {
  const short = { id: 155, name: 'Reggae', brand_name: 'Slack.fr', product_group: 'Reggae', stretch: '[{"kn":1,"percent":1.6}]' }
  const long = { id: 249, name: 'Reggae', brand_name: 'Slack Inov', product_group: 'Reggae', stretch: '[{"kn":1,"percent":1.6},{"kn":2,"percent":3.9}]' }
  const silent = { id: 300, name: 'Reggae', brand_name: 'Other', product_group: 'Reggae' }
  assert.equal(groupFor([short, long], short)!.stretch, short.stretch)
  // A member with no curve of its own falls back to the longest.
  assert.equal(groupFor([short, long, silent], silent)!.stretch, long.stretch)
})

test('a string spec in a numeric slot (a roller width) is left as stated', () => {
  const [g] = collapseGroups([
    { id: 1, name: 'R', brand_name: 'A', product_group: 'R', width: '15-35 mm' },
    { id: 2, name: 'R', brand_name: 'B', product_group: 'R', width: '15-35 mm' },
  ])
  assert.equal(g.width, '15-35 mm')
})
