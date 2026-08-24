// Unit tests for the admin queue's relative timestamps — `npm run test:unit`.
//
// This exists because the obvious implementation has an off-by-one that is
// invisible on screen: step up a unit and label the value with the unit you
// just left, and 120 seconds renders as "2 seconds ago". It reads as plausible
// text, so nobody notices until the queue claims a week-old submission arrived
// minutes ago. Pure arithmetic over a timestamp, so it belongs here rather than
// in Cypress.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { relativeAge } from '../../src/utils/age.ts'

// A fixed "now" so the suite doesn't depend on the wall clock.
const NOW = Date.parse('2026-08-19T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

describe('relativeAge', () => {
  test('counts seconds below a minute', () => {
    assert.equal(relativeAge(ago(5 * SECOND), NOW), '5 seconds ago')
    assert.equal(relativeAge(ago(59 * SECOND), NOW), '59 seconds ago')
  })

  test('promotes to the next unit at the boundary', () => {
    // The off-by-one this module exists for: 120s is two MINUTES, not two seconds.
    assert.equal(relativeAge(ago(60 * SECOND), NOW), '1 minute ago')
    assert.equal(relativeAge(ago(120 * SECOND), NOW), '2 minutes ago')
    assert.equal(relativeAge(ago(HOUR), NOW), '1 hour ago')
    assert.equal(relativeAge(ago(DAY), NOW), '1 day ago')
    assert.equal(relativeAge(ago(WEEK), NOW), '1 week ago')
  })

  test('keeps the larger unit until the next one is reached', () => {
    assert.equal(relativeAge(ago(3 * DAY), NOW), '3 days ago')
    assert.equal(relativeAge(ago(6 * DAY), NOW), '6 days ago')
    assert.equal(relativeAge(ago(3 * WEEK), NOW), '3 weeks ago')
  })

  test('singular has no plural s', () => {
    assert.equal(relativeAge(ago(SECOND), NOW), '1 second ago')
    assert.equal(relativeAge(ago(DAY), NOW), '1 day ago')
  })

  test('months and years are reached, not skipped', () => {
    assert.match(relativeAge(ago(60 * DAY), NOW), /^1 month(s)? ago$|^2 months ago$/)
    assert.equal(relativeAge(ago(400 * DAY), NOW), '1 year ago')
  })

  test('a future timestamp clamps to zero rather than going negative', () => {
    // Clock skew between the submitter's browser and the server is real, and
    // "-3 seconds ago" is a worse answer than "0 seconds ago".
    assert.equal(relativeAge(ago(-60 * SECOND), NOW), '0 seconds ago')
  })

  test('an unparseable timestamp renders nothing, not "NaN ago"', () => {
    assert.equal(relativeAge('not a date', NOW), '')
    assert.equal(relativeAge('', NOW), '')
  })
})
