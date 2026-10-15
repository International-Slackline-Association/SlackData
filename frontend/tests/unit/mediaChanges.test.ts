// How the change log words a media change (utils/mediaChanges.ts).

import test from 'node:test'
import assert from 'node:assert/strict'
import { addedPhotos, describeMediaChange } from '../../src/utils/mediaChanges.ts'

const a = { id: 'a', small: 'x/a-480.webp' }
const b = { id: 'b', small: 'x/b-480.webp' }
const c = { id: 'c', small: 'x/c-480.webp' }

test('photos added and removed are counted', () => {
  assert.equal(describeMediaChange('photos', [a], [a, b, c]), 'added 2 photos')
  assert.equal(describeMediaChange('photos', [a, b], [b]), 'removed 1 photo')
  assert.equal(describeMediaChange('photos', null, [a]), 'added 1 photo')
})

test('a new order of the same photos reads as reordered', () => {
  assert.equal(describeMediaChange('photos', [a, b], [b, a]), 'reordered')
  assert.equal(describeMediaChange('photos', [a, b, c], [c, a]), 'removed 1 photo, reordered')
})

test('the photos a change added are its thumbnails', () => {
  assert.deepEqual(addedPhotos([a], [b, a, c]), [b, c])
})

test('documents are named by title, and a retitle says the new one', () => {
  const manual = { id: 'm', title: 'User manual' }
  assert.equal(describeMediaChange('manuals', [], [manual]), 'added “User manual”')
  assert.equal(describeMediaChange('manuals', [manual], [{ ...manual, title: 'Manual (EN)' }]), 'retitled “Manual (EN)”')
})

test("a brand's manuals, by gear type, read as one list", () => {
  const before = { webbings: [{ id: 'm', title: 'Webbing manual' }] }
  const after = { webbings: [{ id: 'm', title: 'Webbing manual' }], grips: [{ id: 'g', title: 'Grip manual' }] }
  assert.equal(describeMediaChange('manuals', before, after), 'added “Grip manual”')
})

test('a logo is added, replaced or removed', () => {
  assert.equal(describeMediaChange('logo', null, 'brands/3/logo-a.png'), 'added a logo')
  assert.equal(describeMediaChange('logo', 'brands/3/logo-a.png', 'brands/3/logo-b.png'), 'replaced the logo')
  assert.equal(describeMediaChange('logo', 'brands/3/logo-a.png', null), 'removed the logo')
})
