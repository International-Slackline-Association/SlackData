// Unit tests for manufacturer-name → brand-page link resolution —
// `npm run test:unit`. See DESIGN.md § Manufacturer names are links.
//
// The reason this is a module rather than three inline lookups: gear items
// carry `brand_name`, not `brand_id` (the *Public schemas don't declare the
// FK), so every link on a card is a name→id resolution that can legitimately
// fail — index not loaded, brand not in the directory — and each failure must
// degrade to the plain text that was there before, never to a dead link.
// The DOM half (hover treatment, which element carries the hook) is Cypress's.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrandIndex, brandHref } from '../../src/utils/brandLinks.ts'

const BRANDS = [
  { id: 7, name: 'Balance Community' },
  { id: 12, name: 'Slack Inov' },
  { id: 3, name: 'Landcruising' },
]

describe('buildBrandIndex', () => {
  test('maps each brand name to its id', () => {
    const index = buildBrandIndex(BRANDS)
    assert.equal(index.get('Balance Community'), 7)
    assert.equal(index.get('Slack Inov'), 12)
    assert.equal(index.size, 3)
  })

  test('ignores rows with no usable name', () => {
    const index = buildBrandIndex([...BRANDS, { id: 99, name: '' }])
    assert.equal(index.size, 3)
  })
})

describe('brandHref', () => {
  const index = buildBrandIndex(BRANDS)

  test('resolves a known brand to its detail page', () => {
    assert.equal(brandHref(index, 'Slack Inov'), '/manufacturers/12')
  })

  // An empty index is the pre-load state, not an error: the fetch has not come
  // back yet and the name must still render.
  test('returns null for an unknown brand, and while the index is empty', () => {
    assert.equal(brandHref(index, 'Nobody Makes This'), null)
    assert.equal(brandHref(new Map(), 'Slack Inov'), null)
    assert.equal(brandHref(index, ''), null)
    assert.equal(brandHref(index, undefined), null)
  })

  // Names arrive from two independent sources (the gear row's computed
  // brand_name and /brand's own name), so incidental whitespace must not cost
  // the link.
  test('tolerates surrounding whitespace on the looked-up name', () => {
    assert.equal(brandHref(index, '  Slack Inov '), '/manufacturers/12')
  })

  // Case 1 in DESIGN.md: on /manufacturers/12 every card says "Slack Inov",
  // and a link back to the page you are reading is noise.
  test('suppresses the self-link when already on that brand\'s page', () => {
    assert.equal(brandHref(index, 'Slack Inov', 12), null)
    assert.equal(brandHref(index, 'Slack Inov', '12'), null)
    // A different brand's page still links.
    assert.equal(brandHref(index, 'Slack Inov', 7), '/manufacturers/12')
  })
})
