// Unit tests for the edit form's value handling — `npm run test:unit`.
//
// A draft is what an input holds; a value is what the API stores. The round
// trip must be exact for every kind the API describes (types/edits.ts), and an
// empty draft must mean "unset", never 0 or "".

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  asDrafted,
  dateToMs,
  display,
  fromDraft,
  humanize,
  msToDate,
  sameValue,
  toDraft,
} from '../../src/utils/fieldDraft.ts'

describe('round trip', () => {
  const cases: [Parameters<typeof toDraft>[0], unknown][] = [
    ['text', 'Core 2 HS'],
    ['longtext', 'line one\nline two'],
    ['number', 44.5],
    ['integer', 2007],
    ['date', Date.UTC(2017, 11, 1)],
    ['boolean', false],
    ['boolean', true],
    ['choice', 'Polyester'],
    ['choices', ['Polyester', 'Dyneema/HMPE']],
    ['list', ['ISA:52', 'EN 362']],
    ['curve', [{ kn: 4, percent: 1.1 }, { kn: 8, percent: 3 }]],
    ['rings', [{ leashring_id: 35, count: 2 }, { leashring_id: 25, count: 1 }]],
  ]
  for (const [kind, value] of cases) {
    test(`${kind}: ${JSON.stringify(value)}`, () => {
      assert.deepEqual(fromDraft(kind, toDraft(kind, value)).value, value)
    })
  }
})

describe('empty means unset', () => {
  for (const kind of ['text', 'number', 'integer', 'boolean', 'choice', 'list', 'curve', 'rings'] as const) {
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
  test('rings: a name instead of an id', () => assert.ok(fromDraft('rings', 'Vortex x 1').error))
  test('rings: none of a ring', () => assert.ok(fromDraft('rings', '35 x 0').error))
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

describe('dates (stored as Unix ms, edited as a calendar date)', () => {
  test('a stored local midnight reads as the day it meant', () => {
    // SlackDB stored 1 Dec 2017 as midnight in UTC+2: 22:00 UTC on 30 Nov.
    assert.equal(msToDate(1512079200000), '2017-12-01')
    // Midnight in UTC+3, and in UTC+5:30.
    assert.equal(msToDate(1501534800000), '2017-08-01')
    assert.equal(msToDate(1577817000000), '2020-01-01')
    // Midnight west of UTC: 05:00 UTC is midnight in UTC-5.
    assert.equal(msToDate(Date.UTC(2020, 5, 3, 5)), '2020-06-03')
  })

  test('a saved date is midnight UTC', () => {
    assert.equal(fromDraft('date', '2017-12-01').value, Date.UTC(2017, 11, 1))
  })

  test('an impossible or malformed date is refused, and empty is unset', () => {
    assert.equal(dateToMs('2017-02-30'), null)
    assert.equal(fromDraft('date', '1.12.2017').error, 'a date')
    assert.deepEqual(fromDraft('date', ''), { value: null })
  })

  test('an untouched date is not a change, whatever time it was stored at', () => {
    const stored = 1512079200000
    const unchanged = fromDraft('date', toDraft('date', stored)).value
    assert.ok(sameValue(asDrafted('date', stored), unchanged))
    assert.ok(!sameValue(asDrafted('date', stored), fromDraft('date', '2017-12-02').value))
    assert.equal(asDrafted('integer', 7), 7)
  })

  test('the change log shows a date field as a date', () => {
    assert.equal(display(1512079200000, 'release_date'), '2017-12-01')
    assert.equal(display(1512079200000, 'weight'), '1512079200000')
    assert.equal(display(null, 'release_date'), '—')
  })
})

describe('ring options', () => {
  test('a picked option line reads as its ring, one of it', () => {
    assert.deepEqual(fromDraft('rings', '35 — SlackTech 2 5/16" Steel Leash Ring').value, [{ leashring_id: 35, count: 1 }])
  })
  test('"x" and "×" both give the count', () => {
    assert.deepEqual(fromDraft('rings', '35 x 2\n26×1').value, [
      { leashring_id: 35, count: 2 },
      { leashring_id: 26, count: 1 },
    ])
  })
  test('the change log reads them as rings', () => {
    assert.equal(display([{ leashring_id: 35, count: 2 }]), '2× ring 35')
  })
})
