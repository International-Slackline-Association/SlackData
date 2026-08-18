// Unit tests for the money display layer — `npm run test:unit`.
//
// Focused on moneyPrecision, the rule that decides how finely a price control
// moves in the currency on screen: the dollar is the baseline (cents, two
// decimals), and a currency an order of magnitude larger drops a decimal, down
// to whole units at 100x and beyond. See DESIGN.md § Currency & Prices.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  moneyPrecision,
  perUnit,
  priceSuffix,
  unitCount,
  type FxRates,
} from '../../src/utils/money.ts'
import { rangeDomain } from '../../src/utils/range.ts'

// EUR-based, the shape /fx/rates serves. Values are close to real ones so the
// tier each currency lands in is the tier a viewer actually gets.
const RATES: FxRates = {
  base: 'EUR',
  date: '2026-08-11',
  stale: false,
  rates: {
    EUR: 1.0, USD: 1.154, GBP: 0.855, CHF: 0.936, CAD: 1.607, AUD: 1.635,
    NZD: 1.963, PLN: 4.3, ILS: 3.46, BRL: 5.9, CNY: 7.795, SEK: 10.98,
    CZK: 24.25, MXN: 19.74, ZAR: 18.68, RUB: 95.35, INR: 110.1,
    JPY: 183.82, KRW: 1631.7,
  },
}

function rates(table: Record<string, number>): FxRates {
  return { ...RATES, rates: table }
}

describe('moneyPrecision — the dollar is the baseline', () => {
  test('USD gets cents and two decimals', () => {
    assert.deepEqual(moneyPrecision('USD', RATES), { step: 0.01, decimals: 2 })
  })

  test('a currency stronger than the dollar never earns a third decimal', () => {
    // GBP is ~0.74 per dollar; log10 of that is negative, and unclamped that
    // would ask for three decimals of a filter nobody drags that finely.
    for (const code of ['GBP', 'CHF', 'EUR']) {
      assert.deepEqual(moneyPrecision(code, RATES), { step: 0.01, decimals: 2 }, code)
    }
  })

  test('everything under 10x the dollar keeps cents', () => {
    for (const code of ['EUR', 'CAD', 'AUD', 'NZD', 'PLN', 'ILS', 'BRL', 'CNY', 'SEK']) {
      assert.deepEqual(moneyPrecision(code, RATES), { step: 0.01, decimals: 2 }, code)
    }
  })
})

describe('moneyPrecision — one decimal dropped per factor of ten', () => {
  test('10x to 100x the dollar moves in tenths', () => {
    for (const code of ['CZK', 'MXN', 'ZAR', 'RUB', 'INR']) {
      assert.deepEqual(moneyPrecision(code, RATES), { step: 0.1, decimals: 1 }, code)
    }
  })

  test('beyond 100x the dollar moves in whole units', () => {
    for (const code of ['JPY', 'KRW']) {
      assert.deepEqual(moneyPrecision(code, RATES), { step: 1, decimals: 0 }, code)
    }
  })

  test('the ladder stops at whole units — decimals never go negative', () => {
    // IDR runs ~16,000 to the dollar. Coarser than 1 would filter in hundreds.
    const t = rates({ USD: 1.0, IDR: 16_000 })
    assert.deepEqual(moneyPrecision('IDR', t), { step: 1, decimals: 0 })
  })
})

describe('moneyPrecision — tier boundaries', () => {
  const cases: Array<[number, number]> = [
    [1, 2],       // the dollar itself
    [9.99, 2],    // just inside the cent tier
    [10, 1],      // an order of magnitude up
    [99.9, 1],    // still tenths
    [100, 0],     // two orders up: whole units
    [100.1, 0],
  ]

  for (const [perUsd, decimals] of cases) {
    test(`${perUsd}x the dollar → ${decimals} decimals`, () => {
      const t = rates({ USD: 1.0, XXX: perUsd })
      assert.equal(moneyPrecision('XXX', t).decimals, decimals)
    })
  }

  test('the rate is read against USD, not against the table base', () => {
    // Same currency, two tables whose base differs: the answer must not move.
    const eurBased = rates({ EUR: 1.0, USD: 1.154, JPY: 183.82 })
    const usdBased = rates({ EUR: 0.8666, USD: 1.0, JPY: 159.29 })
    assert.deepEqual(moneyPrecision('JPY', eurBased), moneyPrecision('JPY', usdBased))
  })
})

describe('moneyPrecision — step and decimals always agree', () => {
  test('step is 10 to the minus decimals for every currency in the table', () => {
    for (const code of Object.keys(RATES.rates)) {
      const { step, decimals } = moneyPrecision(code, RATES)
      assert.equal(step, 10 ** -decimals, code)
    }
  })

  test('a bound formatted at `decimals` round-trips through the step grid', () => {
    for (const code of Object.keys(RATES.rates)) {
      const { step, decimals } = moneyPrecision(code, RATES)
      // A price domain in this currency, snapped to its own grid.
      const prices = [0.4985, 3.2, 9.15].map(p => p * RATES.rates[code])
      const d = rangeDomain(prices, step)
      assert.equal(Number(d.lo.toFixed(decimals)), d.lo, `${code} lo ${String(d.lo)}`)
      assert.equal(Number(d.hi.toFixed(decimals)), d.hi, `${code} hi ${String(d.hi)}`)
    }
  })

  test('every currency yields a grid whose top is reachable', () => {
    for (const code of Object.keys(RATES.rates)) {
      const { step } = moneyPrecision(code, RATES)
      const prices = [0.4985, 3.2, 9.15].map(p => p * RATES.rates[code])
      const d = rangeDomain(prices, step)
      const reachable = d.lo + Math.floor((d.hi - d.lo) / d.step + 1e-9) * d.step
      assert.ok(Math.abs(reachable - d.hi) < d.step / 2, `${code}: ${reachable} vs ${d.hi}`)
    }
  })
})

describe('moneyPrecision — falls back to the dollar when the ratio is unknowable', () => {
  test('rates still loading', () => {
    assert.deepEqual(moneyPrecision('JPY', null), { step: 0.01, decimals: 2 })
  })

  test('a currency the table does not cover', () => {
    assert.deepEqual(moneyPrecision('XYZ', RATES), { step: 0.01, decimals: 2 })
  })

  test('a table with no USD to compare against', () => {
    const t = rates({ EUR: 1.0, JPY: 183.82 })
    assert.deepEqual(moneyPrecision('JPY', t), { step: 0.01, decimals: 2 })
  })

  test('a rate that is zero, negative or not a number', () => {
    assert.equal(moneyPrecision('A', rates({ USD: 1, A: 0 })).decimals, 2)
    assert.equal(moneyPrecision('B', rates({ USD: 1, B: -5 })).decimals, 2)
    assert.equal(moneyPrecision('C', rates({ USD: 1, C: NaN })).decimals, 2)
    assert.equal(moneyPrecision('D', rates({ USD: 0, D: 500 })).decimals, 2)
  })
})

describe('moneyPrecision — against the Cypress stub table', () => {
  // cypress/e2e/currency.cy.ts stubs a deliberately round EUR-based table with
  // USD at 1.10. Keeping the two suites' expectations aligned here means a tier
  // that moves shows up as a unit failure before an e2e one.
  const STUB = rates({
    EUR: 1.0, USD: 1.1, GBP: 0.85, CHF: 0.95, CAD: 1.5, NZD: 1.8,
    CZK: 25.0, PLN: 4.3, ILS: 4.0, BRL: 6.0, ZAR: 20.0, MXN: 20.0,
    RUB: 100.0, INR: 92.0, JPY: 180.0,
  })

  const expected: Record<string, number> = {
    EUR: 2, USD: 2, GBP: 2, CHF: 2, CAD: 2, NZD: 2, PLN: 2, ILS: 2, BRL: 2,
    CZK: 1, ZAR: 1, MXN: 1, RUB: 1, INR: 1, JPY: 0,
  }

  for (const [code, decimals] of Object.entries(expected)) {
    test(`${code} → ${decimals} decimals`, () => {
      assert.equal(moneyPrecision(code, STUB).decimals, decimals)
    })
  }

  test('RUB sits just under the whole-unit tier at 90.9x', () => {
    // A reminder that this one is close to the boundary: if the stub's USD
    // moves to 1.0, RUB crosses into whole units and the e2e expectations move.
    assert.equal(moneyPrecision('RUB', STUB).decimals, 1)
    assert.equal(moneyPrecision('RUB', rates({ USD: 1.0, RUB: 100 })).decimals, 0)
  })
})

describe('price units — what one price actually buys', () => {
  test('a pair buys two, everything else buys one', () => {
    assert.equal(unitCount('pair'), 2)
    assert.equal(unitCount('single'), 1)
    assert.equal(unitCount(null), 1)
    assert.equal(unitCount(undefined), 1)
    // Nothing else in the catalogue carries a price_unit; an unknown value must
    // never quietly divide a price.
    assert.equal(unitCount('box of 4'), 1)
  })

  test('perUnit ranks an 80 pair below a 50 single', () => {
    assert.equal(perUnit(80, 'pair'), 40)
    assert.equal(perUnit(50, 'single'), 50)
    assert.ok(perUnit(80, 'pair')! < perUnit(50, 'single')!)
  })

  test('perUnit passes an unpriced item straight through as null', () => {
    assert.equal(perUnit(null, 'pair'), null)
    assert.equal(perUnit(null, null), null)
  })

  test('perUnit leaves gear without a price_unit alone', () => {
    assert.equal(perUnit(89, null), 89)
    assert.equal(perUnit(2.4, undefined), 2.4)
  })

  test('the suffix says what the money buys', () => {
    assert.equal(priceSuffix('webbings', null), ' /m')
    assert.equal(priceSuffix('treepros', 'pair'), ' /pair')
    assert.equal(priceSuffix('treepros', 'single'), ' /single')
  })

  test('no price_unit, no suffix — a weblock price stands alone', () => {
    assert.equal(priceSuffix('weblocks', null), '')
    assert.equal(priceSuffix('treepros', null), '')
    assert.equal(priceSuffix('treepros', ''), '')
  })

  test('webbing is per meter whatever else it carries', () => {
    // The /m rule is about the field mapping (`priceMeter`), not price_unit,
    // so it must not be overridden by one.
    assert.equal(priceSuffix('webbings', 'pair'), ' /m')
  })
})
