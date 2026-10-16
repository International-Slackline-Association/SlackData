// Unit tests for the rate cap's message — `npm run test:unit`.
//
// The 429 carries a UTC instant; the reader needs a time on their own clock,
// and the day only when it is not today. Locale formatting varies by machine,
// so these pin the structure, not the exact string.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { capMessage, isCapDetail } from '../../src/utils/rateCap.ts'

const NOW = new Date('2026-10-15T12:00:00.000Z')

describe('isCapDetail', () => {
  test('recognises the 429 detail', () => {
    assert.equal(isCapDetail({ limit: 20, window: 'hour', retry_at: '2026-10-15T12:30:00Z', message: 'x' }), true)
  })
  test('ignores other error details', () => {
    assert.equal(isCapDetail({ message: 'it changed since you opened it', current: {} }), false)
    assert.equal(isCapDetail(undefined), false)
    assert.equal(isCapDetail('a string'), false)
  })
})

describe('capMessage', () => {
  test('names the limit and the window, and says nothing typed is lost', () => {
    const text = capMessage({ limit: 20, window: 'hour', retry_at: '2026-10-15T12:30:00Z' }, NOW)
    assert.match(text, /saved 20 changes in the last hour/)
    assert.match(text, /You can save again at /)
    assert.match(text, /still here/)
  })
  test('gives the time alone today, with the weekday on another day', () => {
    const today = capMessage({ limit: 20, window: 'hour', retry_at: '2026-10-15T12:30:00Z' }, NOW)
    const later = capMessage({ limit: 100, window: '24 hours', retry_at: '2026-10-17T12:30:00Z' }, NOW)
    const weekday = new Date('2026-10-17T12:30:00Z').toLocaleDateString([], { weekday: 'long' })
    assert.ok(!today.includes(weekday))
    assert.ok(later.includes(weekday), later)
  })
})
