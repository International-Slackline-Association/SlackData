// The back-link origin carried in history state (src/utils/origin.ts).
//
// It is the one piece of navigation state that arrives from outside the app's
// own code — anything can push arbitrary `location.state` — and it ends up as an
// href. So the interesting cases here are the malformed ones: every rejection
// falls back to the page's own default link, which is what shipped before.

import test from 'node:test'
import assert from 'node:assert/strict'
import { isSafeOriginPath, originState, readOrigin } from '../../src/utils/origin.ts'

test('a listing path with a query string is a valid origin', () => {
  assert.equal(isSafeOriginPath('/webbings?q=core&sort=name-desc'), true)
  assert.equal(isSafeOriginPath('/manufacturers/12'), true)
})

test('anything that could leave the site is not', () => {
  // Protocol-relative: the browser reads both as another host.
  assert.equal(isSafeOriginPath('//evil.example/webbings'), false)
  assert.equal(isSafeOriginPath('/\\evil.example'), false)
  assert.equal(isSafeOriginPath('https://evil.example'), false)
  // Not a path at all.
  assert.equal(isSafeOriginPath('webbings'), false)
  assert.equal(isSafeOriginPath(''), false)
  assert.equal(isSafeOriginPath(null), false)
  assert.equal(isSafeOriginPath(42), false)
})

test('originState round-trips through readOrigin', () => {
  const origin = { path: '/webbings?q=core', label: 'Webbings' }
  const state = originState(origin)
  assert.deepEqual(state, { origin })
  assert.deepEqual(readOrigin(state), origin)
})

test('an origin with no label produces no state — the page has no name to offer', () => {
  // Real case: the listing page computes its origin before `meta` resolves.
  assert.equal(originState({ path: '/webbings', label: '' }), undefined)
  assert.equal(originState(null), undefined)
  assert.equal(originState(undefined), undefined)
})

test('an unsafe path produces no state either', () => {
  assert.equal(originState({ path: '//evil.example', label: 'Webbings' }), undefined)
})

test('readOrigin rejects every shape that is not an origin', () => {
  assert.equal(readOrigin(null), null)
  assert.equal(readOrigin(undefined), null)
  assert.equal(readOrigin('/webbings'), null)
  assert.equal(readOrigin({}), null)
  assert.equal(readOrigin({ origin: null }), null)
  assert.equal(readOrigin({ origin: { path: '/webbings' } }), null)
  assert.equal(readOrigin({ origin: { label: 'Webbings' } }), null)
  assert.equal(readOrigin({ origin: { path: '//evil.example', label: 'x' } }), null)
  assert.equal(readOrigin({ origin: { path: '/webbings', label: 7 } }), null)
})

test('readOrigin keeps only the two fields it knows', () => {
  const read = readOrigin({ origin: { path: '/webbings', label: 'Webbings', extra: 'x' } })
  assert.deepEqual(read, { path: '/webbings', label: 'Webbings' })
})

test('state left by some other feature is ignored, not inherited', () => {
  // react-router state is shared: another feature could be using it.
  assert.equal(readOrigin({ scrollY: 900 }), null)
})
