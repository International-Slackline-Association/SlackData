// The listing's A→Z name order (src/utils/compare.ts). Numbers inside a name
// rank as numbers, so a range of sizes reads smallest first — the reason
// connector names lead with type, then size.

import test from 'node:test'
import assert from 'node:assert/strict'
import { compareByName } from '../../src/utils/compare.ts'

const sorted = (names: string[]) =>
  names.map(name => ({ name })).sort(compareByName).map(item => item.name)

test('10 sorts after 9, not before 2', () => {
  assert.deepEqual(
    sorted(['D Shackle 10mm', 'D Shackle 2mm', 'D Shackle 9mm']),
    ['D Shackle 2mm', 'D Shackle 9mm', 'D Shackle 10mm'],
  )
})

test('decimal tonnages rank by their whole part, then the fraction', () => {
  assert.deepEqual(
    sorted(['Bow Shackle 3.25 t', 'Bow Shackle 1.5 t', 'Bow Shackle 1 t', 'Bow Shackle 0.5 t']),
    ['Bow Shackle 0.5 t', 'Bow Shackle 1 t', 'Bow Shackle 1.5 t', 'Bow Shackle 3.25 t'],
  )
})

test('a type groups before its sizes are compared', () => {
  assert.deepEqual(
    sorted(['Twisted Shackle 8mm', 'D Shackle 12mm', 'D Shackle 8mm', 'Bow Shackle 10mm']),
    ['Bow Shackle 10mm', 'D Shackle 8mm', 'D Shackle 12mm', 'Twisted Shackle 8mm'],
  )
})
