// The shard packer (scripts/pack-shards.mjs): reading Cypress's summary table,
// merging measured times, and the longest-first split. The job is only as fast
// as its slowest shard, so the packing arithmetic is what these pin down.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNMEASURED_SECONDS, formatDuration, mergeDurations, pack, parseCypressSummary, toSeconds,
} from '../../scripts/pack-shards.mjs'
import { readManifest, specsOnDisk } from '../../scripts/check-shards.mjs'

test('durations read as Cypress prints them', () => {
  assert.equal(toSeconds('05:25'), 325)
  assert.equal(toSeconds('0:04'), 4)
  assert.equal(toSeconds('1:02:03'), 3723)
  assert.equal(toSeconds('913ms'), 1) // a sub-second spec still costs something
  assert.equal(formatDuration(325), '5:25')
  assert.equal(formatDuration(4), '0:04')
  assert.throws(() => toSeconds('soon'))
})

test("a run's summary table, colour codes and all", () => {
  // Two rows as GitHub's job log stores them: timestamp, ANSI colours, box rules.
  const log = [
    '2026-10-21T17:56:29.8488389Z \x1b[90m  │\x1b[39m \x1b[32m✔\x1b[39m  \x1b[0mfilters.cy.ts\x1b[0m'
      + '                            \x1b[90m05:25\x1b[39m      \x1b[0m495\x1b[0m      \x1b[32m495\x1b[39m'
      + '        \x1b[90m-\x1b[39m        \x1b[90m-\x1b[39m        \x1b[90m-\x1b[39m \x1b[90m│\x1b[39m',
    '2026-10-21T18:22:28.1Z   │ ✖  gear_cards.cy.ts     29:33      401      397        4        -        - │',
    '2026-10-21T18:22:28.2Z   Running:  gear_cards.cy.ts       (1 of 5)',
  ].join('\n')
  assert.deepEqual(parseCypressSummary(log), [
    { spec: 'filters', seconds: 325, passed: true },
    { spec: 'gear_cards', seconds: 1773, passed: false },
  ])
})

test('a spec takes its time from the first run it passed in', () => {
  const latest = [
    { spec: 'a', seconds: 100, passed: true },
    { spec: 'b', seconds: 900, passed: false }, // retries, not the spec's cost
  ]
  const older = [
    { spec: 'a', seconds: 50, passed: true },
    { spec: 'b', seconds: 80, passed: true },
  ]
  const { durations, kept, unmeasured } = mergeDurations({}, [latest, older], ['a', 'b'])
  assert.deepEqual(durations, { a: 100, b: 80 })
  assert.deepEqual([kept, unmeasured], [[], []])
})

test('a spec no run measured keeps its stored time, or gets the default', () => {
  const runs = [[{ spec: 'a', seconds: 10, passed: false }]]
  const { durations, kept, unmeasured } = mergeDurations({ a: 70, gone: 5 }, runs, ['a', 'new'])
  // `gone` is no longer on disk, so it drops out of the manifest.
  assert.deepEqual(durations, { a: 70, new: UNMEASURED_SECONDS })
  assert.deepEqual(kept, ['a'])
  assert.deepEqual(unmeasured, ['new'])
})

test('longest first, onto the lightest shard', () => {
  const shards = pack({ a: 6, b: 5, c: 4, d: 3, e: 2 }, 2)
  // a→1, b→2, c→2 (5<6), d→1 (6<9), e→1 or 2 at 9/9: the first one.
  assert.deepEqual(shards, [
    { name: 'a', estimate: '0:11', specs: ['a', 'd', 'e'] },
    { name: 'b', estimate: '0:09', specs: ['b', 'c'] },
  ])
})

test('the same numbers always give the same split', () => {
  const durations = { x: 5, y: 5, z: 5, w: 5 }
  assert.deepEqual(pack(durations, 3), pack({ ...durations }, 3))
  assert.deepEqual(pack(durations, 3).map((s: { specs: string[] }) => s.specs), [['w', 'z'], ['x'], ['y']])
})

test('more shards than specs leaves no empty shard', () => {
  assert.deepEqual(pack({ a: 1 }, 3).map((s: { specs: string[] }) => s.specs), [['a']])
  assert.throws(() => pack({ a: 1 }, 0))
})

test('the committed shards are the packing of the committed durations', () => {
  // A hand edit to shards.json is allowed (adding a spec by hand is how the
  // checker's message says to do it), so this only holds while every spec has
  // a duration. It catches a durations edit that was never repacked.
  const { durations, shards } = readManifest()
  const onDisk: string[] = specsOnDisk()
  if (!onDisk.every(spec => spec in durations)) return
  const seconds = Object.fromEntries(onDisk.map(spec => [spec, toSeconds(durations[spec])]))
  assert.deepEqual(pack(seconds, shards.length), shards)
})
