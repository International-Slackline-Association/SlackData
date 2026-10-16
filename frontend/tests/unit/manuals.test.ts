// A stored document -> the row a reader sees (utils/manuals.ts).
//
// Here rather than in Cypress because none of it is visible on screen as a
// separate thing: the title comes from the stored entry, the URL from its key,
// and a range-wide row differs from a product's only by its caption.
//
// Which documents exist is data now (GET /media/manifest, phase 4); that every
// key the seeds name is a file in the dev snapshot is checked on the backend
// (tests/test_media_migrate.py).

import test from 'node:test'
import assert from 'node:assert/strict'
import { brandManualEntries, manualEntries, titleFromFilename } from '../../src/utils/manuals.ts'

const url = (key: string) => `/media/${key}`

test('a row is titled by its stored title and linked by its key', () => {
  const [row] = manualEntries([{ file: 'webbings/255/abc-product-archive.pdf', title: 'Product archive' }], url)
  assert.equal(row.label, 'Product archive')
  assert.equal(row.url, '/media/webbings/255/abc-product-archive.pdf')
  assert.equal(row.appliesTo, undefined)
})

test('rows keep their stored order — the first is the one embedded', () => {
  const rows = manualEntries(
    [
      { file: 'a.pdf', title: 'User manual' },
      { file: 'b.pdf', title: 'Test certificate' },
    ],
    url,
  )
  assert.deepEqual(rows.map(r => r.label), ['User manual', 'Test certificate'])
})

test('every range-wide row carries the scope caption', () => {
  // The caption is the whole difference between the two kinds of row: an
  // untitled brand PDF renders "User manual" on a page about one product, and
  // without the caption that reads as a claim about that product.
  const [row] = brandManualEntries([{ file: 'brands/3/webbings/x.pdf', title: 'User manual' }], url, 'Applies to all X webbings')
  assert.equal(row.appliesTo, 'Applies to all X webbings')
  assert.equal(row.url, '/media/brands/3/webbings/x.pdf')
})

test('no documents, no rows', () => {
  assert.deepEqual(manualEntries([], url), [])
  assert.deepEqual(brandManualEntries([], url, 'Applies to all'), [])
})

test('a new upload starts with a title from its filename', () => {
  assert.equal(titleFromFilename('user-manual.pdf'), 'User manual')
  assert.equal(titleFromFilename('German_user-manual_v2.pdf'), 'German user manual v2')
  assert.equal(titleFromFilename('.pdf'), 'Document')
})
