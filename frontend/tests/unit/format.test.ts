// Unit tests for the display formatters — `npm run test:unit`.
//
// `widthRangeText` is here rather than in Cypress because the interesting part
// is the collapse rule, and a screenshot can't tell "24–26 mm" (correct) from
// "24 mm" (the old behaviour: the minimum passed off as the whole truth). The
// DOM contract — that a weblock card actually renders it — is in
// cypress/e2e/gear_cards.cy.ts.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { widthRangeText } from '../../src/utils/format.ts'

describe('widthRangeText', () => {
  test('renders both bounds when the device takes a range of widths', () => {
    assert.equal(widthRangeText({ width_min: 24, width_max: 26 }), '24–26 mm')
  })

  test('collapses to one figure when the bounds are equal', () => {
    // 12 of the 127 weblocks are single-width; "26–26 mm" is noise.
    assert.equal(widthRangeText({ width_min: 26, width_max: 26 }), '26 mm')
  })

  test('collapses to one figure when there is no max', () => {
    assert.equal(widthRangeText({ width_min: 25, width_max: null }), '25 mm')
    assert.equal(widthRangeText({ width_min: 25 }), '25 mm')
  })

  test('is empty when there is no min — the row/segment drops out', () => {
    assert.equal(widthRangeText({ width_min: null, width_max: 26 }), '')
    assert.equal(widthRangeText({}), '')
  })

  test('takes a custom unit', () => {
    assert.equal(widthRangeText({ width_min: 2, width_max: 5 }, 'cm'), '2–5 cm')
  })

  test('uses an en dash, not a hyphen', () => {
    assert.match(widthRangeText({ width_min: 19, width_max: 20 }), /19–20/)
  })
})
