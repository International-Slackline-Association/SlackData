// The brand filter's data half: turning an item's own `gear_sellers` list into
// "which brands does this item belong to", maker included.
//
// Here rather than in Cypress because the rule is invisible on screen: the OR
// with the maker, the ordering, and the shapes that must not produce a blank or
// duplicated brand. The DOM half (the group renders, a pill narrows the grid)
// is brand_filter.cy.ts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { brandsFor } from '../../src/utils/sellers.ts'

test('an item with no sellers is just its maker', () => {
  assert.deepEqual(brandsFor({ brand_name: 'Slack Inov', gear_sellers: null }), ['Slack Inov'])
  assert.deepEqual(brandsFor({ brand_name: 'Slack Inov' }), ['Slack Inov'])
  assert.deepEqual(brandsFor({ brand_name: 'Slack Inov', gear_sellers: [] }), ['Slack Inov'])
})

test('a co-listed item belongs to its maker AND its sellers, maker first', () => {
  assert.deepEqual(
    brandsFor({ brand_name: 'Slack Inov', gear_sellers: ['Spider Slacklines'] }),
    ['Slack Inov', 'Spider Slacklines'],
  )
})

test('several sellers keep their recorded order behind the maker', () => {
  assert.deepEqual(
    brandsFor({ brand_name: 'Radrigs', gear_sellers: ['SlackX', 'Balance Community'] }),
    ['Radrigs', 'SlackX', 'Balance Community'],
  )
})

test('a seller that is also the maker is listed once', () => {
  // The seed pass refuses this pairing, so it is a guard against bad data
  // reaching the browser rather than an expected shape — a doubled pill in the
  // Brand group is the visible symptom.
  assert.deepEqual(
    brandsFor({ brand_name: 'Slack Inov', gear_sellers: ['Slack Inov'] }),
    ['Slack Inov'],
  )
})

test('a repeated seller is listed once', () => {
  assert.deepEqual(
    brandsFor({ brand_name: 'Slack Inov', gear_sellers: ['Spider Slacklines', 'Spider Slacklines'] }),
    ['Slack Inov', 'Spider Slacklines'],
  )
})

test('blank names never become a brand', () => {
  assert.deepEqual(
    brandsFor({ brand_name: 'Slack Inov', gear_sellers: ['  ', ''] }),
    ['Slack Inov'],
  )
  assert.deepEqual(brandsFor({ brand_name: '', gear_sellers: ['Spider Slacklines'] }), [
    'Spider Slacklines',
  ])
})

test('a non-list gear_sellers is ignored rather than spread into characters', () => {
  // The field is a JSON column; a stringified list ("['SlackX']") is exactly
  // what a loader bug produces, and iterating it would yield one pill per
  // character.
  assert.deepEqual(
    brandsFor({ brand_name: 'Slack Inov', gear_sellers: 'Spider Slacklines' as unknown }),
    ['Slack Inov'],
  )
})
