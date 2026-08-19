// Unit tests for dual-thumb drag-role assignment — `npm run test:unit`.
//
// The bug these cover: the two range inputs are stacked, so where the thumbs
// overlap only the top one (range-max) receives the pointer. Both parked on the
// same value, max cannot go below min and min cannot be grabbed at all — at the
// top of the domain that is unrecoverable without clearing the filter. The fix
// (DESIGN.md § Range slider → "Overlapping thumbs") is to let the drag DIRECTION
// pick the bound while the thumbs overlap, sticky for the rest of the gesture.
//
// The decision is pure arithmetic on (source, value, bounds, overlap), so it is
// tested here; the DOM wiring is covered by cypress/e2e/range_slider.cy.ts.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDragRole, thumbsOverlap, THUMB_PX } from '../../src/utils/rangeDrag.ts'

describe('thumbsOverlap — overlap is measured in pixels, not values', () => {
  test('identical bounds always overlap', () => {
    assert.equal(thumbsOverlap(50, 50, 0, 100, 280), true)
  })

  test('one step apart on a wide domain is still one circle', () => {
    // 0.01 apart over a 0–500 domain on a 280px track: 0.0056px of separation.
    assert.equal(thumbsOverlap(120, 120.01, 0, 500, 280), true)
  })

  test('thumbs a clear distance apart do not overlap', () => {
    assert.equal(thumbsOverlap(20, 80, 0, 100, 280), false)
  })

  test('the threshold is one thumb width', () => {
    // A gap of exactly THUMB_PX px on a 100-wide domain over a 100px track.
    assert.equal(thumbsOverlap(10, 10 + THUMB_PX + 1, 0, 100, 100), false)
    assert.equal(thumbsOverlap(10, 10 + THUMB_PX - 1, 0, 100, 100), true)
  })

  test('an unmeasured track (0px, pre-layout) never reports overlap for distinct bounds', () => {
    // Nothing is rendered yet, so a redirect would be guesswork — except for
    // exactly-equal bounds, which are stuck regardless of how wide the track is.
    assert.equal(thumbsOverlap(20, 80, 0, 100, 0), false)
    assert.equal(thumbsOverlap(50, 50, 0, 100, 0), true)
  })

  test('a degenerate domain does not divide by zero', () => {
    assert.equal(thumbsOverlap(5, 5, 5, 5, 280), true)
  })
})

describe('resolveDragRole — separated thumbs move their own bound', () => {
  const sep = { lo: 20, hi: 80, overlapping: false, active: null } as const

  test('the max input moves max', () => {
    assert.equal(resolveDragRole({ ...sep, source: 'max', value: 60 }), 'max')
  })

  test('the min input moves min', () => {
    assert.equal(resolveDragRole({ ...sep, source: 'min', value: 40 }), 'min')
  })

  test('no redirect even when a value would cross', () => {
    // Separated thumbs are individually grabbable, so a crossing value is just
    // a clamp — never a role swap, which would teleport the thumb mid-drag.
    assert.equal(resolveDragRole({ ...sep, source: 'max', value: 5 }), 'max')
    assert.equal(resolveDragRole({ ...sep, source: 'min', value: 95 }), 'min')
  })
})

describe('resolveDragRole — overlapping thumbs are assigned by direction', () => {
  const both = (at: number) => ({ lo: at, hi: at, overlapping: true, active: null }) as const

  test('dragging the stack left moves min, not max', () => {
    assert.equal(resolveDragRole({ ...both(50), source: 'max', value: 30 }), 'min')
  })

  test('dragging the stack right moves max', () => {
    assert.equal(resolveDragRole({ ...both(50), source: 'max', value: 70 }), 'max')
  })

  test('a stack parked at the top of the domain is escapable', () => {
    // The unrecoverable state: both thumbs at domainHi. Max cannot move (it is
    // clamped by lo), so the leftward drag has to become a min change.
    assert.equal(resolveDragRole({ ...both(100), source: 'max', value: 88 }), 'min')
  })

  test('a stack parked at the bottom of the domain is escapable', () => {
    assert.equal(resolveDragRole({ ...both(0), source: 'max', value: 12 }), 'max')
  })

  test('a keyboard user on the min thumb pushes max when moving right', () => {
    assert.equal(resolveDragRole({ ...both(50), source: 'min', value: 51 }), 'max')
  })

  test('a keyboard user on the min thumb moving left moves min', () => {
    assert.equal(resolveDragRole({ ...both(50), source: 'min', value: 49 }), 'min')
  })

  test('no movement keeps the source input its own bound', () => {
    assert.equal(resolveDragRole({ ...both(50), source: 'max', value: 50 }), 'max')
    assert.equal(resolveDragRole({ ...both(50), source: 'min', value: 50 }), 'min')
  })

  test('overlapping but not identical: leftward past min redirects', () => {
    assert.equal(resolveDragRole({ lo: 40, hi: 41, overlapping: true, active: null, source: 'max', value: 25 }), 'min')
  })

  test('overlapping but not identical: a move inside the gap is not a redirect', () => {
    assert.equal(resolveDragRole({ lo: 40, hi: 45, overlapping: true, active: null, source: 'max', value: 42 }), 'max')
  })
})

describe('resolveDragRole — the role is sticky for the rest of the gesture', () => {
  test('a redirected gesture keeps moving min when the pointer comes back right', () => {
    // Without stickiness the thumb you are dragging would change identity
    // mid-stroke as soon as the pointer re-entered [lo, hi].
    assert.equal(
      resolveDragRole({ lo: 30, hi: 50, overlapping: false, active: 'min', source: 'max', value: 45 }),
      'min',
    )
  })

  test('an established max gesture is not redirected by a later leftward move', () => {
    assert.equal(
      resolveDragRole({ lo: 50, hi: 50, overlapping: true, active: 'max', source: 'max', value: 10 }),
      'max',
    )
  })

  test('a change outside a gesture is decided fresh, not against a stale role', () => {
    // Callers that set a bound programmatically (and the Cypress helpers that
    // drive a thumb without a pointerdown) pass active: null, so two successive
    // writes cannot land on the same bound just because the first one did.
    assert.equal(
      resolveDragRole({ lo: 20, hi: 80, overlapping: false, active: null, source: 'max', value: 60 }),
      'max',
    )
  })

  test('the sticky role wins over the source input', () => {
    assert.equal(
      resolveDragRole({ lo: 0, hi: 100, overlapping: false, active: 'max', source: 'min', value: 20 }),
      'max',
    )
  })
})
