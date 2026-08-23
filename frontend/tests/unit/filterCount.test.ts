// activeFilterCount — the number badged on the mobile "Filters (n)" button.
//
// This is here rather than in Cypress because it is pure arithmetic over a
// URLSearchParams: the DOM half (the badge appears, the sheet opens) is covered
// by mobile.cy.ts, but the counting RULE — groups, not pills; ranges count once
// for either bound — is invisible in a screenshot and cheap to pin down here.

import test from 'node:test'
import assert from 'node:assert/strict'
import { activeFilterCount } from '../../src/utils/filter.ts'
import type { FilterGroupMeta } from '../../src/config/filterGroups.ts'

const GROUPS: FilterGroupMeta[] = [
  { group: 'material', label: 'Material', type: 'pill' },
  { group: 'isa_certified', label: 'ISA Certified', type: 'pill', pillKind: 'bool' },
  { group: 'width', label: 'Width', type: 'range', unit: 'mm' },
  { group: 'price', label: 'Price', type: 'range', currencyUnit: true },
]

const params = (qs: string) => new URLSearchParams(qs)

test('counts nothing on a bare listing', () => {
  assert.equal(activeFilterCount(GROUPS, params('')), 0)
})

test('ignores params that are not filter groups', () => {
  assert.equal(activeFilterCount(GROUPS, params('q=nylon&sort=width-asc&cur=EUR')), 0)
})

test('counts one per engaged pill group, not one per pill', () => {
  assert.equal(activeFilterCount(GROUPS, params('material=Nylon')), 1)
  assert.equal(
    activeFilterCount(GROUPS, params('material=Nylon,Polyester,Dyneema')),
    1,
    'three values in one group is still one decision to undo',
  )
})

test('counts a range group once whichever bound is set', () => {
  assert.equal(activeFilterCount(GROUPS, params('width_min=20')), 1)
  assert.equal(activeFilterCount(GROUPS, params('width_max=30')), 1)
  assert.equal(activeFilterCount(GROUPS, params('width_min=20&width_max=30')), 1)
})

test('sums across groups of both kinds', () => {
  assert.equal(
    activeFilterCount(GROUPS, params('material=Nylon&isa_certified=true&width_min=20&price_max=5')),
    4,
  )
})

test('does not count an empty value', () => {
  assert.equal(activeFilterCount(GROUPS, params('material=')), 0)
  assert.equal(activeFilterCount(GROUPS, params('width_min=')), 0)
})

test('counts a non-default status scope', () => {
  assert.equal(activeFilterCount(GROUPS, params(''), { statusScoped: false }), 0)
  assert.equal(activeFilterCount(GROUPS, params(''), { statusScoped: true }), 1)
})

test('counts an engaged stretch widget', () => {
  // Stretch is a bespoke widget with no URL param of its own, so the page has to
  // tell the counter about it — hence the `extras` argument existing at all.
  assert.equal(activeFilterCount(GROUPS, params(''), { stretchEngaged: true }), 1)
  assert.equal(
    activeFilterCount(GROUPS, params('material=Nylon'), {
      statusScoped: true,
      stretchEngaged: true,
    }),
    3,
  )
})

test('a group absent from the config is not counted even if its param is present', () => {
  // The listing renders from the filter config, so a stray param from another
  // gear type must not badge a filter the viewer has no control for.
  assert.equal(activeFilterCount(GROUPS, params('tensioning_type=RAT1')), 0)
})
