// The arithmetic of resizing a photo in the browser (utils/photoResize.ts,
// D44, D45, P4-D) — the drawing itself needs a canvas, so it is Cypress's.

import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, manualProblem, MB, photoProblem } from '../../src/utils/photoResize.ts'

test('the long edge is brought down to the size, keeping the shape', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 })
  assert.deepEqual(fitWithin(3000, 4000, 480), { width: 360, height: 480 })
})

test('a photo smaller than the size is never enlarged', () => {
  assert.deepEqual(fitWithin(300, 200, 1600), { width: 300, height: 200 })
})

test('a sliver of a photo still gets a pixel', () => {
  assert.deepEqual(fitWithin(10000, 2, 480), { width: 480, height: 1 })
})

test('a photo is JPEG, PNG or WebP, at most 10 MB as picked', () => {
  assert.equal(photoProblem({ type: 'image/jpeg', size: 10 * MB, name: 'a.jpg' }), null)
  assert.match(photoProblem({ type: 'image/jpeg', size: 10 * MB + 1, name: 'a.jpg' }) ?? '', /10 MB/)
  assert.match(photoProblem({ type: 'image/svg+xml', size: 10, name: 'a.svg' }) ?? '', /JPEG, PNG or WebP/)
  assert.match(photoProblem({ type: 'image/heic', size: 10, name: 'a.heic' }) ?? '', /JPEG, PNG or WebP/)
})

test('a manual is a PDF of at most 25 MB', () => {
  assert.equal(manualProblem({ type: 'application/pdf', size: 25 * MB, name: 'm.pdf' }), null)
  assert.match(manualProblem({ type: 'application/pdf', size: 25 * MB + 1, name: 'm.pdf' }) ?? '', /25 MB/)
  assert.match(manualProblem({ type: 'text/html', size: 10, name: 'm.html' }) ?? '', /PDF/)
})
