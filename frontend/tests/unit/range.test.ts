// Unit tests for the slider domain — `npm run test:unit`.
//
// These exist because the bug they cover is invisible in a screenshot: a domain
// whose max is off the step grid renders a slider that LOOKS maxed while still
// excluding the priciest item, because the thumb can never reach the bound the
// caller compares against. Everything here is pure arithmetic, so it is tested
// here rather than in Cypress; the DOM contract is covered by
// cypress/e2e/price_slider.cy.ts.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rangeDomain } from '../../src/utils/range.ts'

// The value a native <input type="range"> lands on when dragged fully right:
// the largest `min + n * step` that does not exceed max. This is the rule the
// whole module exists to satisfy — if it returns anything below `hi`, the top of
// the slider is unreachable and "parked at the bound" never fires.
function maxReachable({ lo, hi, step }: { lo: number; hi: number; step: number }): number {
  const n = Math.floor((hi - lo) / step + 1e-9)
  return lo + n * step
}

// Renders without float dust: "0.58", not "0.5800000000000001". Dust in a bound
// anchors the entire grid, so every value a drag writes to the URL inherits it.
function isClean(v: number, decimals: number): boolean {
  const fraction = decimals > 0 ? `(\\.\\d{1,${decimals}})?` : ''
  return new RegExp(`^-?\\d+${fraction}$`).test(String(v))
}

// Realistic display-currency price sets, measured off the seeded catalogue at
// live rates. Every one of these had an unreachable max before snapping.
const PRICES = {
  webbingUsd: [0.5753, 1.04, 2.31, 3.4657, 6.9245, 10.56],
  webbingEur: [0.4985, 0.9, 2.0, 3.0, 5.9, 9.15],
  weblockEur: [0.3629, 12.5, 89.0, 130.4, 229.95],
  gripUsd: [41.8095, 92.0, 180.5, 378.4287],
  starterkitEur: [31.9839, 120.0, 349.9, 511.7215],
}

describe('rangeDomain — step derivation', () => {
  test('integer-only data steps by 1', () => {
    assert.equal(rangeDomain([16, 25, 50]).step, 1)
  })

  test('fractional data steps by 0.5, not 0.1 — the finer grid is noise', () => {
    assert.equal(rangeDomain([19, 41.6, 177]).step, 0.5)
  })

  test('an explicit step overrides the derived one', () => {
    assert.equal(rangeDomain([19, 41.6, 177], 0.01).step, 0.01)
    // Money steps by the cent even when every price happens to be whole.
    assert.equal(rangeDomain([75, 200, 750], 0.01).step, 0.01)
  })

  test('no data yet → a zero-width domain consumers can detect', () => {
    assert.deepEqual(rangeDomain([]), { lo: 0, hi: 0, step: 1 })
  })

  test('no data yet keeps the caller\'s step, so the control does not flip grids on load', () => {
    assert.deepEqual(rangeDomain([], 0.01), { lo: 0, hi: 0, step: 0.01 })
  })
})

describe('rangeDomain — bounds land on the grid', () => {
  test('the max is exactly reachable for every realistic price set', () => {
    for (const [name, prices] of Object.entries(PRICES)) {
      const d = rangeDomain(prices, 0.01)
      assert.ok(
        Math.abs(maxReachable(d) - d.hi) < d.step / 2,
        `${name}: top of track reports ${maxReachable(d)}, domain max is ${d.hi}`,
      )
    }
  })

  test('the span is a whole number of steps', () => {
    for (const [name, prices] of Object.entries(PRICES)) {
      const d = rangeDomain(prices, 0.01)
      const units = (d.hi - d.lo) / d.step
      assert.ok(Math.abs(units - Math.round(units)) < 1e-6, `${name}: ${units} steps`)
    }
  })

  test('the regression is real: the raw data range is NOT reachable', () => {
    // Without snapping, webbing-in-USD ran 0.5753–10.56 on a 0.5 grid, so a
    // full-right drag stopped at 10.0753 — a bound, not "no constraint".
    const raw = { lo: 0.5753, hi: 10.56, step: 0.5 }
    assert.ok(maxReachable(raw) < raw.hi - raw.step / 2)
  })

  test('snapping goes to the NEAREST cent, so bounds match the price on the card', () => {
    // 0.5753 renders as $0.58 on its card; the slider must not read $0.57.
    assert.equal(rangeDomain([0.5753, 9], 0.01).lo, 0.58)
    // …and rounds down when that is nearer.
    assert.equal(rangeDomain([0.5749, 9], 0.01).lo, 0.57)
  })

  test('bounds carry no float dust', () => {
    for (const [name, prices] of Object.entries(PRICES)) {
      const d = rangeDomain(prices, 0.01)
      assert.ok(isClean(d.lo, 2), `${name}: lo is ${String(d.lo)}`)
      assert.ok(isClean(d.hi, 2), `${name}: hi is ${String(d.hi)}`)
    }
  })

  test('bounds carry no float dust at the coarser money grids either', () => {
    const czk = rangeDomain([12.0942, 221.8734], 0.1)
    assert.ok(isClean(czk.lo, 1) && isClean(czk.hi, 1), `${String(czk.lo)}..${String(czk.hi)}`)
    const jpy = rangeDomain([91.6, 1682.4], 1)
    assert.ok(isClean(jpy.lo, 0) && isClean(jpy.hi, 0), `${String(jpy.lo)}..${String(jpy.hi)}`)
  })
})

describe('rangeDomain — authored fields are left alone', () => {
  // Every non-money field in the catalogue already sits on its own grid. The
  // snap must be a no-op there, or a "fix" for price silently moves widths.
  const authored: Array<[string, number[], number, number]> = [
    ['webbing width (int)', [16, 19, 25, 50], 16, 50],
    ['webbing weight', [19, 41.5, 177], 19, 177],
    ['webbing breaking strength', [10, 32.5, 75], 10, 75],
    ['weblock width_min', [0, 25, 49], 0, 49],
    ['leashring outer diameter', [69, 80.5, 104], 69, 104],
    ['starterkit weight (int)', [1040, 3000, 5000], 1040, 5000],
  ]

  for (const [name, values, lo, hi] of authored) {
    test(`${name} keeps its exact [min, max]`, () => {
      const d = rangeDomain(values)
      assert.equal(d.lo, lo)
      assert.equal(d.hi, hi)
      assert.equal(maxReachable(d), hi)
    })
  }
})

describe('rangeDomain — degenerate input', () => {
  test('all values equal → one step wide, never a dead slider', () => {
    const d = rangeDomain([50, 50, 50])
    assert.equal(d.lo, 50)
    assert.equal(d.hi, 51)
    assert.ok(d.hi > d.lo)
  })

  test('all values equal on the cent grid widens by a cent', () => {
    const d = rangeDomain([12.3, 12.3], 0.01)
    assert.equal(d.lo, 12.3)
    assert.equal(d.hi, 12.31)
  })

  test('a single value still yields a usable domain', () => {
    const d = rangeDomain([7.5])
    assert.ok(d.hi > d.lo)
    assert.equal(maxReachable(d), d.hi)
  })

  test('values that snap onto each other still widen', () => {
    // Two prices a tenth of a cent apart both round to 4.20.
    const d = rangeDomain([4.2001, 4.2003], 0.01)
    assert.equal(d.lo, 4.2)
    assert.equal(d.hi, 4.21)
  })

  test('input order does not matter', () => {
    assert.deepEqual(rangeDomain([9.15, 0.4985, 3.2], 0.01), rangeDomain([3.2, 9.15, 0.4985], 0.01))
  })

  test('negative values snap the same way', () => {
    const d = rangeDomain([-3.75, 12.2], 0.5)
    assert.equal(d.lo, -3.5)
    assert.equal(maxReachable(d), d.hi)
  })
})
