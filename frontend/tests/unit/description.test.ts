// The description's one piece of markup: `[text](/path)` becomes an internal
// link, and nothing else does. The DOM half is gear_detail.cy.ts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { descriptionParts, splitDescription } from '../../src/utils/description.ts'

test('plain text is one text part', () => {
  assert.deepEqual(descriptionParts('Soft edges.'), [{ text: 'Soft edges.' }])
})

test('an internal link is split out with its path', () => {
  assert.deepEqual(descriptionParts('Is [Core 2 HS](/webbings/1), resold.'), [
    { text: 'Is ' },
    { text: 'Core 2 HS', to: '/webbings/1' },
    { text: ', resold.' },
  ])
})

test('external and protocol-relative URLs stay text', () => {
  for (const s of ['[x](https://evil.example)', '[x](//evil.example)', 'a [note] (/x)']) {
    assert.deepEqual(descriptionParts(s), [{ text: s }])
  }
})

test('a final "Note:" paragraph is split off as our note', () => {
  assert.deepEqual(splitDescription('Soft edges.\n\nNote: same as [X](/webbings/1).'), {
    blurb: 'Soft edges.',
    note: 'Note: same as [X](/webbings/1).',
  })
  assert.deepEqual(splitDescription('Note: inline, not a paragraph.'), {
    blurb: 'Note: inline, not a paragraph.',
    note: null,
  })
})
