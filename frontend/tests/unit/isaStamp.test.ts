// Certificate number → official ISA stamp file. Here rather than in Cypress
// because the mapping is invisible on screen until it picks the wrong stamp —
// an A+ webbing wearing the C graphic looks just as official.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { ISA_STAMP_FILES, isaStampPath } from '../../src/utils/isaStamp.ts'

test('a lettered webbing certificate picks its own class, not the derived one', () => {
  assert.equal(isaStampPath('ISA:41:A+', 'C'), '/isa-labels/ISA41Aplus.png')
  assert.equal(isaStampPath('ISA:41:A', null), '/isa-labels/ISA41A.png')
  assert.equal(isaStampPath('ISA:41:C'), '/isa-labels/ISA41C.png')
})

test('a letterless ISA:41 certificate uses the strength-derived class', () => {
  assert.equal(isaStampPath('ISA:41', 'A+'), '/isa-labels/ISA41Aplus.png')
  assert.equal(isaStampPath('ISA:41', 'B'), '/isa-labels/ISA41B.png')
})

test('other standards map by number and ignore any class', () => {
  assert.equal(isaStampPath('ISA:51'), '/isa-labels/ISA51.png')
  assert.equal(isaStampPath('ISA:37', 'A'), '/isa-labels/ISA37.png')
  assert.equal(isaStampPath('ISA:61'), '/isa-labels/ISA61.png')
})

test('anything without a file falls back (null), never a broken path', () => {
  assert.equal(isaStampPath(null), null)
  assert.equal(isaStampPath(undefined, 'A'), null)
  assert.equal(isaStampPath(''), null)
  assert.equal(isaStampPath('ISA:41'), null) // no letter from anywhere
  assert.equal(isaStampPath('ISA:41', 'D'), null)
  assert.equal(isaStampPath('ISA:99'), null)
  assert.equal(isaStampPath('not a certificate'), null)
})

test('every mapped file exists in public/isa-labels, and nothing there is unmapped', () => {
  const onDisk = readdirSync(new URL('../../public/isa-labels/', import.meta.url))
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/\.png$/, ''))
    .sort()
  assert.deepEqual(onDisk, [...ISA_STAMP_FILES].sort())
})

test('every certificate in isa_certified.json resolves to a stamp', () => {
  const data = JSON.parse(
    readFileSync(new URL('../../../isa_certified.json', import.meta.url), 'utf8'),
  ) as { items: { certificate: string }[] }
  // Letterless ISA:41 certificates get their letter from the gear row, so any
  // class stands in for it here; the rest must resolve on the number alone.
  for (const { certificate } of data.items) {
    assert.notEqual(isaStampPath(certificate, 'C'), null, certificate)
  }
})
