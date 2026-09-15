// Unit tests for the triage page's photo command — `npm run test:unit`.
//
// An approved manufacturer record with `image_urls` shows the exact command that
// files those photos (scripts/fetch_submission_images.py). The admin copies it
// into a shell, and every argument in it came from outside: the brand's name,
// the product's name, and URLs the brand chose. So the quoting is tested rather
// than trusted. The other thing that can go wrong invisibly is the NAME: images
// are keyed by it, so a record that renames the product must file its photos
// under the new name or they never render.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { imageFetchCommand, photoLabel, shellQuote } from '../../src/utils/imageFetch.ts'
import type { Submission } from '../../src/types/submission.ts'

function record(overrides: Partial<Submission> = {}): Submission {
  return {
    submission_id: '01J0000000000000000000PHOTO',
    kind: 'manufacturer',
    gear_type: 'webbings',
    gear_id: 42,
    gear_name: 'Aero 1',
    gear_brand: 'Balance Community',
    changes: {},
    image_urls: ['https://bc.example/img/aero-1.jpg'],
    note: null,
    source_url: null,
    submitter_email: null,
    submitted_by: 'brand-client:abc',
    brand_id: 17,
    batch_id: '01J0000000000000000000BATCH',
    manufacturer_sku: null,
    status: 'approved',
    created_at: '2026-09-15T10:00:00.000Z',
    reviewed_at: null,
    review_note: null,
    expires_at: null,
    ...overrides,
  }
}

describe('shellQuote', () => {
  test('wraps a plain word in single quotes', () => {
    assert.equal(shellQuote('webbings'), "'webbings'")
  })

  test('escapes an embedded single quote', () => {
    assert.equal(shellQuote("Slackliner's Pro"), "'Slackliner'\\''s Pro'")
  })

  test('leaves shell metacharacters inert inside the quotes', () => {
    assert.equal(shellQuote('$(rm -rf ~); `id` & "x"'), `'$(rm -rf ~); \`id\` & "x"'`)
  })

  test('an empty string is still an argument', () => {
    assert.equal(shellQuote(''), "''")
  })
})

describe('imageFetchCommand', () => {
  test('names the script, the gear type, the brand, the name and every URL in order', () => {
    const command = imageFetchCommand(
      record({ image_urls: ['https://bc.example/b.png', 'https://bc.example/a.jpg'] }),
    )
    assert.equal(
      command,
      "python3 scripts/fetch_submission_images.py --gear-type 'webbings'" +
        " --brand 'Balance Community' --name 'Aero 1'" +
        " 'https://bc.example/b.png' 'https://bc.example/a.jpg'",
    )
  })

  test('uses the name the product will have after a rename in the patch', () => {
    const command = imageFetchCommand(record({ changes: { name: 'Aero 2', weight: '61' } }))
    assert.ok(command?.includes("--name 'Aero 2'"), command ?? 'null')
    assert.ok(!command?.includes("'Aero 1'"), command ?? 'null')
  })

  test('quotes a URL carrying shell syntax', () => {
    const command = imageFetchCommand(
      record({ image_urls: ["https://bc.example/a.jpg?x=1&y=$(id)'"] }),
    )
    assert.ok(command?.endsWith(" 'https://bc.example/a.jpg?x=1&y=$(id)'\\'''"), command ?? 'null')
  })

  test('there is no command for a record without photos', () => {
    assert.equal(imageFetchCommand(record({ image_urls: [] })), null)
  })

  test('there is no command when the product cannot be named', () => {
    // The key is `<brand>_<name>`; without both there is nowhere to file it.
    assert.equal(imageFetchCommand(record({ gear_name: null })), null)
    assert.equal(imageFetchCommand(record({ gear_brand: null })), null)
  })
})

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
