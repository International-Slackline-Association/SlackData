// Unit tests for the edit form's value handling — `npm run test:unit`.
//
// A draft is what an input holds; a value is what the API stores. The round
// trip must be exact for every kind the API describes (types/edits.ts), and an
// empty draft must mean "unset", never 0 or "".

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { display, fromDraft, humanize, sameValue, toDraft } from '../../src/utils/fieldDraft.ts'

describe('round trip', () => {
  const cases: [Parameters<typeof toDraft>[0], unknown][] = [
    ['text', 'Core 2 HS'],
    ['longtext', 'line one\nline two'],
    ['number', 44.5],
    ['integer', 2007],
    ['boolean', false],
    ['boolean', true],
    ['choice', 'Polyester'],
    ['choices', ['Polyester', 'Dyneema/HMPE']],
    ['list', ['ISA:52', 'EN 362']],
    ['curve', [{ kn: 4, percent: 1.1 }, { kn: 8, percent: 3 }]],
  ]
  for (const [kind, value] of cases) {
    test(`${kind}: ${JSON.stringify(value)}`, () => {
      assert.deepEqual(fromDraft(kind, toDraft(kind, value)).value, value)
    })
  }
})

describe('empty means unset', () => {
  for (const kind of ['text', 'number', 'integer', 'boolean', 'choice', 'list', 'curve'] as const) {
    test(kind, () => assert.equal(fromDraft(kind, '  ').value, null))
  }
  test('choices', () => assert.equal(fromDraft('choices', []).value, null))
  test('a missing value drafts as empty', () => {
    assert.equal(toDraft('number', null), '')
    assert.deepEqual(toDraft('choices', undefined), [])
  })
})

describe('bad input is an error, not a guess', () => {
  test('number', () => assert.ok(fromDraft('number', 'forty').error))
  test('integer', () => assert.ok(fromDraft('integer', '2007.5').error))
  test('curve with three numbers on a line', () => assert.ok(fromDraft('curve', '4 1.1 9').error))
  test('a decimal comma is a decimal', () => assert.equal(fromDraft('number', '44,5').value, 44.5))
})

test('sameValue compares content', () => {
  assert.ok(sameValue([1, 2], [1, 2]))
  assert.ok(sameValue(undefined, null))
  assert.ok(!sameValue(44, 44.5))
})

test('humanize and display', () => {
  assert.equal(humanize('breaking_strength'), 'Breaking strength')
  assert.equal(display(null), '—')
  assert.equal(display(['a', 'b']), 'a, b')
  assert.equal(display([{ kn: 4, percent: 1.1 }]), '4→1.1%')
})
