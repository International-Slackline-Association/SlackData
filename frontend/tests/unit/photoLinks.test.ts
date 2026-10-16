// How the triage page labels a manufacturer's photo links — `npm run test:unit`.
// The links are opened by an admin, who adds the photos on the item's page.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { photoLabel } from '../../src/utils/photoLinks.ts'

describe('photoLabel', () => {
  test("is the URL's last path segment, without the query", () => {
    assert.equal(photoLabel('https://bc.example/img/aero-1.jpg?v=2'), 'aero-1.jpg')
  })

  test('decodes an escaped filename', () => {
    assert.equal(photoLabel('https://bc.example/img/aero%201.jpg'), 'aero 1.jpg')
  })

  test('falls back to the host when there is no filename', () => {
    assert.equal(photoLabel('https://bc.example/'), 'bc.example')
  })

  test('falls back to the raw string when it does not parse', () => {
    assert.equal(photoLabel('not a url'), 'not a url')
  })
})
