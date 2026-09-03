// Fields whose value is a *list* — `material` on webbings, weblocks and rollers.
//
// One product is often several metals: the TiLock is a titanium frame with a
// choice of titanium or high-strength steel pins, so its steel build publishes
// ["Titanium", "Steel"]. Nothing on screen announces that the field is an array
// rather than a string — a card renders "Titanium + Steel" either way — so the
// two places it matters are pinned here:
//
//   1. display  — the metals join into one spec segment, not "Titanium,Steel"
//                 and not the bare array's default toString.
//   2. filtering — a pill group over the field must offer each metal once and
//                 match an item that carries ANY of the selected ones. A scalar
//                 comparison would silently drop every multi-metal product from
//                 the results the moment a Material pill is pressed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { formatValue } from '../../src/utils/format.ts'
import { applyFilters, derivePillOptions } from '../../src/utils/filter.ts'
import type { FilterGroupMeta } from '../../src/config/filterGroups.ts'

const MATERIAL: FilterGroupMeta = { group: 'material', label: 'Material', type: 'pill' }

const tilockSteel = { id: 128, name: 'TiLock 19mm - Steel Pins', material: ['Titanium', 'Steel'] }
const tilockTi = { id: 101, name: 'TiLock 19mm - Titanium Pins', material: ['Titanium'] }
const alu = { id: 3, name: 'Alpine WebLock 4.0', material: ['Aluminum'] }

test('a multi-metal spec reads as one value', () => {
  assert.equal(formatValue(['Titanium', 'Steel']), 'Titanium + Steel')
})

test('a single-metal spec loses the separator entirely', () => {
  assert.equal(formatValue(['Titanium']), 'Titanium')
})

test('an empty composition renders nothing, so the row/segment drops out', () => {
  assert.equal(formatValue([]), '')
  assert.equal(formatValue([null, '']), '')
})

test('every metal in the catalogue becomes a pill, listed once', () => {
  const options = derivePillOptions([tilockSteel, tilockTi, alu], MATERIAL).map(o => o.value)
  assert.deepEqual(options.slice().sort(), ['Aluminum', 'Steel', 'Titanium'])
})

test('a pill matches an item that carries that metal among others', () => {
  // The regression this file exists for: filtering by Steel must not hide the
  // steel-pin TiLock just because titanium is listed first.
  const kept = applyFilters([tilockSteel, tilockTi, alu], { material: ['Steel'] }, {})
  assert.deepEqual(kept.map(i => i.id), [128])
})

test('selecting several metals is OR, not AND', () => {
  const kept = applyFilters([tilockSteel, tilockTi, alu], { material: ['Steel', 'Aluminum'] }, {})
  assert.deepEqual(kept.map(i => i.id), [128, 3])
})

test('an unselected metal filters the multi-metal product out', () => {
  const kept = applyFilters([tilockSteel, tilockTi, alu], { material: ['Aluminum'] }, {})
  assert.deepEqual(kept.map(i => i.id), [3])
})
