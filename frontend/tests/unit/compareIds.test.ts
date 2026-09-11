// The compare selection as it travels in a URL (src/utils/compare.ts →
// parseIdList). It backs two params — the listing's ?compare= and the compare
// page's ?ids= — and both of them are whatever someone pasted, so the parser's
// job is to be unsurprising about junk rather than to trust it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIdList } from '../../src/utils/compare.ts'

test('parses a comma-separated list, preserving selection order', () => {
  // Order is the column order downstream — never sorted.
  assert.deepEqual(parseIdList('3,1,9'), [3, 1, 9])
  assert.deepEqual(parseIdList('7'), [7])
})

test('an absent or empty param is an empty selection', () => {
  assert.deepEqual(parseIdList(null), [])
  assert.deepEqual(parseIdList(undefined), [])
  assert.deepEqual(parseIdList(''), [])
  assert.deepEqual(parseIdList(','), [])
})

test('an id is never repeated — two identical columns compare nothing', () => {
  assert.deepEqual(parseIdList('3,3,1,3'), [3, 1])
})

test('junk entries are dropped, not fatal', () => {
  assert.deepEqual(parseIdList('3,abc,1'), [3, 1])
  assert.deepEqual(parseIdList('3,,1'), [3, 1])
  assert.deepEqual(parseIdList('3, ,1'), [3, 1])
  assert.deepEqual(parseIdList('abc'), [])
})

test('a blank field does not become id 0', () => {
  // Number('') and Number(' ') are both 0, which would be a real id.
  assert.equal(parseIdList('  ').length, 0)
  assert.deepEqual(parseIdList('0,1'), [0, 1])
})

test('whitespace around a real id is tolerated', () => {
  assert.deepEqual(parseIdList(' 3 , 1 '), [3, 1])
})
