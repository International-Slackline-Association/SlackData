// Unit tests for the ISA admin page's helpers — `npm run test:unit`.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { entryTitle, isMatched, landsOn, matchTargets, sortEntries } from '../../src/utils/isaEntries.ts'
import type { IsaEntry } from '../../src/types/isa.ts'

const block = (gearType: string | null, gearIds: number[]) => ({ gearType, gearIds, gearNames: [], confidence: 'exact' })
const entry = (key: string, match?: IsaEntry['entry']['match'], extra: Record<string, unknown> = {}): IsaEntry => ({
  key,
  rev: 1,
  entry: { manufacturer: 'Gibbon', model: 'Jibline', ...extra, match },
})

describe('matchTargets', () => {
  test('the block and its also targets, empty ones dropped', () => {
    const match = { ...block('weblock', [4]), also: [block('connector', [1]), block(null, [])] }
    assert.deepEqual(matchTargets(match).map(t => t.gearType), ['weblock', 'connector'])
    assert.deepEqual(matchTargets(undefined), [])
  })
})

describe('isMatched and landsOn', () => {
  test('an empty block is unmatched', () => {
    assert.equal(isMatched(entry('1', block(null, []))), false)
    assert.equal(isMatched(entry('1', block('webbing', [62]))), true)
  })
  test('lands on a product by slug and id, through also too', () => {
    const e = entry('1', { ...block('weblock', [4]), also: [block('connector', [1])] })
    assert.equal(landsOn(e, 'weblocks', 4), true)
    assert.equal(landsOn(e, 'connectors', 1), true)
    assert.equal(landsOn(e, 'webbings', 4), false)
  })
})

describe('sortEntries', () => {
  test('unmatched first, then by the number in the key, ours last', () => {
    const entries = [
      entry('approved_gear_12', block('webbing', [1])),
      entry('slackdata-1', block(null, [])),
      entry('approved_gear_2', block(null, [])),
      entry('approved_gear_3', block('grip', [3])),
    ]
    assert.deepEqual(sortEntries(entries).map(e => e.key), ['approved_gear_2', 'slackdata-1', 'approved_gear_3', 'approved_gear_12'])
  })
})

describe('entryTitle', () => {
  test('the product as the ISA names it, and the certificate or status', () => {
    assert.equal(entryTitle('certificates', entry('a', undefined, { certificate: 'ISA:41:A' })), 'Gibbon Jibline — ISA:41:A')
    assert.equal(entryTitle('warnings', entry('b', undefined, { status: 'Recall' })), 'Gibbon Jibline — Recall')
  })
})
