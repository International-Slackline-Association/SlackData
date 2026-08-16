// Unit tests for the brand detail page's section builder — `npm run test:unit`.
//
// The ordering rule is the reason this module exists: the API hands back id
// order, which looks plausible on screen but is arbitrary to a reader scanning
// a brand's catalogue. Pure grouping/sorting, so it's tested here; the collapse
// interaction is DOM state and lives in cypress/e2e/manufacturers.cy.ts.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrandSections, compareByName, sortByName } from '../../src/utils/brandSections.ts'

const TYPES = [
  { slug: 'webbings', label: 'Webbings' },
  { slug: 'weblocks', label: 'Weblocks' },
  { slug: 'rollers', label: 'Rollers' },
]

const names = (items: { name?: unknown }[]) => items.map(i => String(i.name))

describe('compareByName', () => {
  test('orders ascending', () => {
    assert.ok(compareByName({ name: 'Aero' }, { name: 'Zenith' }) < 0)
    assert.ok(compareByName({ name: 'Zenith' }, { name: 'Aero' }) > 0)
    assert.equal(compareByName({ name: 'Aero' }, { name: 'Aero' }), 0)
  })

  // localeCompare, not raw code-point order: "aero" < "Bravo" reads correctly,
  // where `<` on the strings would put every capital ahead of every lowercase.
  test('is case-insensitive in ordering, not ASCII-ordered', () => {
    assert.ok(compareByName({ name: 'aero' }, { name: 'Bravo' }) < 0)
  })

  // Names are non-null on every model, but a missing one must not throw and
  // must not jump ahead of / behind real names unpredictably.
  test('treats a missing name as empty rather than throwing', () => {
    assert.ok(compareByName({}, { name: 'Aero' }) < 0)
  })
})

describe('sortByName', () => {
  test('sorts alphabetically', () => {
    const items = [{ name: 'Zenith' }, { name: 'Aero' }, { name: 'Meta' }]
    assert.deepEqual(names(sortByName(items)), ['Aero', 'Meta', 'Zenith'])
  })

  test('does not mutate the input array', () => {
    const items = [{ name: 'Zenith' }, { name: 'Aero' }]
    sortByName(items)
    assert.deepEqual(names(items), ['Zenith', 'Aero'])
  })
})

describe('buildBrandSections', () => {
  const gear = {
    webbings: [
      { id: 3, name: 'Zulu', brand_name: 'Balance Community' },
      { id: 1, name: 'Aero', brand_name: 'Balance Community' },
      { id: 2, name: 'Mantra', brand_name: 'Landcruising' },
      { id: 4, name: 'Beta', brand_name: 'Balance Community' },
    ],
    weblocks: [
      { id: 9, name: 'Omega', brand_name: 'Balance Community' },
      { id: 8, name: 'Alpha', brand_name: 'Balance Community' },
    ],
    rollers: [{ id: 7, name: 'Solo', brand_name: 'Landcruising' }],
  }

  test('keeps only the named brand\'s items', () => {
    const [webbings] = buildBrandSections(TYPES, gear, 'Balance Community')
    assert.deepEqual(names(webbings.items), ['Aero', 'Beta', 'Zulu'])
  })

  // The point of the module: id order (Zulu id 3 before Aero id 1) must not survive.
  test('sorts each section alphabetically, not by id', () => {
    const sections = buildBrandSections(TYPES, gear, 'Balance Community')
    sections.forEach(({ items }) => {
      assert.deepEqual(names(items), [...names(items)].sort((a, b) => a.localeCompare(b)))
    })
    assert.deepEqual(names(sections[1].items), ['Alpha', 'Omega'])
  })

  test('omits gear types the brand has none of', () => {
    const slugs = buildBrandSections(TYPES, gear, 'Balance Community').map(s => s.type.slug)
    assert.deepEqual(slugs, ['webbings', 'weblocks'])
  })

  test('keeps sections in the given gear-type order', () => {
    const slugs = buildBrandSections(TYPES, gear, 'Landcruising').map(s => s.type.slug)
    assert.deepEqual(slugs, ['webbings', 'rollers'])
  })

  test('returns nothing for a brand with no gear', () => {
    assert.deepEqual(buildBrandSections(TYPES, gear, 'Nobody'), [])
  })

  test('tolerates a gear type missing from the map entirely', () => {
    const sections = buildBrandSections(TYPES, { webbings: gear.webbings }, 'Balance Community')
    assert.deepEqual(sections.map(s => s.type.slug), ['webbings'])
  })

  test('does not mutate the source lists', () => {
    buildBrandSections(TYPES, gear, 'Balance Community')
    assert.deepEqual(names(gear.webbings), ['Zulu', 'Aero', 'Mantra', 'Beta'])
  })
})
