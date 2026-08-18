import { GEAR_TYPES } from '../support/gear_types'

// Price slider precision and reachability — DESIGN.md § Left Filter Sidebar
// ("Price is the first group in every gear type's sidebar").
//
// Two contracts live here, and both were once broken:
//
//   1. REACHABILITY. A native <input type="range"> can only land on
//      `min + n · step`. The price domain is a currency conversion, so its max
//      never sits on that grid by accident — and an off-grid max is a top the
//      thumb cannot reach. The slider then LOOKS maxed while still writing a
//      real upper bound to the URL, quietly hiding the priciest item.
//   2. PRECISION FOLLOWS THE CURRENCY. The dollar is the baseline: cents, two
//      decimals. A currency an order of magnitude larger drops a decimal, down
//      to whole units past 100x — ¥1,683 is as precise as $10.56, and a JPY
//      slider crawling in hundredths would be tens of thousands of dead steps.
//
// The arithmetic behind both is unit-tested in src/utils/{range,money}.test.ts
// (`npm run test:unit`); this spec pins the DOM the viewer actually touches.

// DETERMINISM RULE (same as currency.cy.ts): every assertion on an exact
// converted number goes through this stub, because live rates move daily. USD
// at 1.10 puts CZK at 22.7x the dollar (tenths) and JPY at 163x (whole units).
const STUB_RATES: Record<string, number> = {
  EUR: 1.0, USD: 1.10, GBP: 0.85, CHF: 0.95, CAD: 1.50, NZD: 1.80,
  CZK: 25.0, PLN: 4.30, ILS: 4.00, BRL: 6.00, ZAR: 20.0, MXN: 20.0,
  RUB: 100.0, INR: 92.0, JPY: 180.0,
}

const STUB_BODY = {
  base: 'EUR',
  date: '2026-08-07',
  source: 'stub',
  stale: false,
  rates: STUB_RATES,
  detected_currency: null,
}

// [currency, step attribute, decimals in the bound labels]
const TIERS: Array<[string, string, number]> = [
  ['USD', '0.01', 2], // the baseline
  ['EUR', '0.01', 2], // 0.91x the dollar — a stronger currency earns no 3rd decimal
  ['CZK', '0.1', 1],  // 22.7x
  ['JPY', '1', 0],    // 163x
]

const PRICE = '[data-cy="filter-group"][data-group="price"]'

function stubRates() {
  cy.intercept('GET', '**/fx/rates*', { statusCode: 200, body: STUB_BODY }).as('fx')
}

function selectCurrency(code: string) {
  cy.get('[data-cy="currency-selector"]').click()
  cy.get(`[data-cy="currency-option"][data-currency="${code}"]`).click()
}

// The slider domain is data-driven, so every assertion waits for it to load.
function awaitDomain(scope = PRICE) {
  cy.get(scope).find('[data-cy="range-max"]').should($el => {
    expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
  })
}

// React ignores jQuery .val(), so drive the thumb the way filters.cy.ts does:
// native setter + a real input event.
function setSlider(which: 'min' | 'max', value: number, scope = PRICE) {
  cy.get(scope).find(`[data-cy="range-${which}"]`).then($el => {
    const input = $el[0] as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// Drag a thumb to the very end of its track, whatever that end is.
function slideToEnd(which: 'min' | 'max', scope = PRICE) {
  cy.get(scope).find(`[data-cy="range-${which}"]`).invoke('attr', which === 'min' ? 'min' : 'max')
    .then(bound => setSlider(which, Number(bound), scope))
}

// Every price on screen, in the display currency — the same numbers the slider
// domain is derived from. Cards with no price carry an empty attribute.
function displayedPrices(): Cypress.Chainable<number[]> {
  return cy.get('[data-cy="gear-card"]').then($cards =>
    [...$cards]
      .map(el => el.getAttribute('data-price-display'))
      .filter((v): v is string => v != null && v !== '')
      .map(Number),
  )
}

// "10.56 $" → "10.56". The unit is the display currency's symbol and follows a
// space, so the first token is always the number.
function boundText($el: JQuery<HTMLElement>): string {
  return ($el.text() ?? '').trim().split(/\s+/)[0]
}

describe('Price slider — precision follows the display currency', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  TIERS.forEach(([code, step, decimals]) => {
    it(`${code}: thumbs step by ${step}`, () => {
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-min"]').should('have.attr', 'step', step)
      cy.get(PRICE).find('[data-cy="range-max"]').should('have.attr', 'step', step)
    })

    it(`${code}: both bound labels show ${decimals} decimal places`, () => {
      const shape = decimals > 0 ? new RegExp(`^\\d+\\.\\d{${decimals}}$`) : /^\d+$/
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-min-value"]').should($el => {
        expect(boundText($el)).to.match(shape)
      })
      cy.get(PRICE).find('[data-cy="range-max-value"]').should($el => {
        expect(boundText($el)).to.match(shape)
      })
    })

    it(`${code}: the edit box accepts values at the same precision`, () => {
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-min-value"]').click()
      cy.get(PRICE).find('input[data-cy="range-min-value"]').should('have.attr', 'step', step)
    })
  })

  it('re-scales the moment the viewer switches currency', () => {
    cy.visit('/webbings?cur=USD')
    awaitDomain()
    cy.get(PRICE).find('[data-cy="range-max"]').should('have.attr', 'step', '0.01')

    selectCurrency('JPY')
    cy.get(PRICE).find('[data-cy="range-max"]').should('have.attr', 'step', '1')
    cy.get(PRICE).find('[data-cy="range-max-value"]').should($el => {
      expect(boundText($el)).to.match(/^\d+$/)
    })

    selectCurrency('USD')
    cy.get(PRICE).find('[data-cy="range-max"]').should('have.attr', 'step', '0.01')
    cy.get(PRICE).find('[data-cy="range-max-value"]').should($el => {
      expect(boundText($el)).to.match(/^\d+\.\d{2}$/)
    })
  })

  it('leaves every other slider on its own data-derived step', () => {
    // Money precision must not leak: widths are whole millimetres, weights come
    // in halves. If these move, the price change reached too far.
    cy.visit('/webbings?cur=JPY')
    awaitDomain()
    cy.get('[data-cy="filter-group"][data-group="width"]')
      .find('[data-cy="range-min"]').should('have.attr', 'step', '1')
    cy.get('[data-cy="filter-group"][data-group="weight"]')
      .find('[data-cy="range-min"]').should('have.attr', 'step', '0.5')
  })
})

describe('Price slider — the domain is the catalogue', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('starts at the cheapest item, not at a rounded-down zero', () => {
    cy.visit('/webbings?cur=USD')
    awaitDomain()
    displayedPrices().then(prices => {
      const cheapest = Math.min(...prices)
      cy.get(PRICE).find('[data-cy="range-min"]').invoke('attr', 'min').then(min => {
        // Snapped to the nearest cent, so within half a step of the real min.
        expect(Number(min)).to.be.closeTo(cheapest, 0.005 + 1e-9)
        expect(Number(min)).to.be.greaterThan(0)
      })
    })
  })

  it('ends at the priciest item', () => {
    cy.visit('/webbings?cur=USD')
    awaitDomain()
    displayedPrices().then(prices => {
      const priciest = Math.max(...prices)
      cy.get(PRICE).find('[data-cy="range-max"]').invoke('attr', 'max').then(max => {
        expect(Number(max)).to.be.closeTo(priciest, 0.005 + 1e-9)
      })
    })
  })

  it('expresses the domain at the currency\'s own precision', () => {
    // CZK moves in tenths, so both ends land on a tenth.
    cy.visit('/webbings?cur=CZK')
    awaitDomain()
    cy.get(PRICE).find('[data-cy="range-max"]').should($el => {
      const min = Number($el.attr('min'))
      const max = Number($el.attr('max'))
      expect(Number((min * 10).toFixed(6)) % 1).to.equal(0)
      expect(Number((max * 10).toFixed(6)) % 1).to.equal(0)
    })
  })

  it('spans a whole number of steps, so no step is stranded at the top', () => {
    TIERS.forEach(([code]) => {
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-max"]').should($el => {
        const min = Number($el.attr('min'))
        const max = Number($el.attr('max'))
        const step = Number($el.attr('step'))
        const units = (max - min) / step
        expect(Math.abs(units - Math.round(units)), `${code}: ${units} steps`).to.be.lessThan(1e-6)
      })
    })
  })
})

describe('Price slider — both ends are reachable', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  TIERS.forEach(([code]) => {
    it(`${code}: the max thumb parks exactly at the top of the track`, () => {
      // The original bug in one assertion: the browser clamps a value that is
      // off the step grid, so a domain max it cannot represent shows up here as
      // a thumb value below the max attribute.
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-max"]').should($el => {
        expect(Number($el.val())).to.equal(Number($el.attr('max')))
      })
    })

    it(`${code}: the min thumb parks exactly at the floor`, () => {
      cy.visit(`/webbings?cur=${code}`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-min"]').should($el => {
        expect(Number($el.val())).to.equal(Number($el.attr('min')))
      })
    })
  })

  GEAR_TYPES.forEach(({ slug, label }) => {
    it(`${label}: the price domain is reachable at both ends`, () => {
      cy.visit(`/${slug}?cur=USD`)
      awaitDomain()
      cy.get(PRICE).find('[data-cy="range-max"]').should($el => {
        expect(Number($el.val()), 'max thumb').to.equal(Number($el.attr('max')))
      })
      cy.get(PRICE).find('[data-cy="range-min"]').should($el => {
        expect(Number($el.val()), 'min thumb').to.equal(Number($el.attr('min')))
      })
    })
  })

  it('the webbing stretch % slider is grid-aligned too', () => {
    // Same helper, same failure mode — its % domain is measured data, not a
    // conversion, but it lands off the 0.5 grid just as easily.
    const STRETCH = '[data-cy="filter-group"][data-group="stretch"]'
    cy.visit('/webbings')
    cy.get(STRETCH).find('[data-cy="stretch-kn-pill"]').first().click()
    awaitDomain(STRETCH)
    cy.get(STRETCH).find('[data-cy="range-max"]').should($el => {
      expect(Number($el.val())).to.equal(Number($el.attr('max')))
    })
  })
})

describe('Price slider — a thumb at its bound means no constraint', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
    cy.visit('/webbings?cur=USD')
    awaitDomain()
  })

  it('dragging the max thumb back to the top drops price_max from the URL', () => {
    displayedPrices().then(prices => {
      const middle = Math.min(...prices) + (Math.max(...prices) - Math.min(...prices)) / 2
      setSlider('max', Number(middle.toFixed(2)))
      cy.url().should('include', 'price_max=')

      slideToEnd('max')
      cy.url().should('not.include', 'price_max=')
    })
  })

  it('and brings the priciest item back with it', () => {
    // The functional half of the reachability bug: a max thumb that cannot
    // reach the top leaves a bound in place that excludes the dearest gear.
    cy.get('[data-cy="gear-card"]').its('length').then(total => {
      displayedPrices().then(prices => {
        const priciest = Math.max(...prices)
        setSlider('max', Number((priciest - 1).toFixed(2)))
        cy.get('[data-cy="gear-card"]').should('have.length.lessThan', total)

        slideToEnd('max')
        cy.get('[data-cy="gear-card"]').should('have.length', total)
        cy.get(`[data-cy="gear-card"][data-price-display="${priciest}"]`).should('exist')
      })
    })
  })

  it('dragging the min thumb back to the floor drops price_min from the URL', () => {
    displayedPrices().then(prices => {
      const middle = Math.min(...prices) + (Math.max(...prices) - Math.min(...prices)) / 2
      setSlider('min', Number(middle.toFixed(2)))
      cy.url().should('include', 'price_min=')

      slideToEnd('min')
      cy.url().should('not.include', 'price_min=')
    })
  })

  it('one step below the top is still a real bound', () => {
    // The converse of the rule above: only the end itself means "no constraint".
    cy.get(PRICE).find('[data-cy="range-max"]').then($el => {
      const max = Number($el.attr('max'))
      const step = Number($el.attr('step'))
      setSlider('max', Number((max - step).toFixed(2)))
    })
    cy.url().should('include', 'price_max=')
    cy.get(PRICE).find('[data-cy="range-max"]').should($el => {
      expect(Number($el.val())).to.be.lessThan(Number($el.attr('max')))
    })
  })
})

describe('Price slider — typed bounds', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('accepts an exact cent that no drag would land on', () => {
    cy.visit('/webbings?cur=USD')
    awaitDomain()
    cy.get(PRICE).find('[data-cy="range-min-value"]').click()
    cy.focused().clear().type('3.47{enter}')

    cy.url().should('include', 'price_min=3.47')
    cy.get('[data-cy="gear-card"]').each($card => {
      const raw = $card.attr('data-price-display')
      if (raw) expect(Number(raw)).to.be.gte(3.47)
    })
  })

  it('keeps the typed bound readable in the label', () => {
    cy.visit('/webbings?cur=USD')
    awaitDomain()
    cy.get(PRICE).find('[data-cy="range-max-value"]').click()
    cy.focused().clear().type('5{enter}')
    // Typed as "5", shown as money.
    cy.get(PRICE).find('[data-cy="range-max-value"]').should($el => {
      expect(boundText($el)).to.equal('5.00')
    })
  })

  it('writes the bound and ?cur= together in whole units for a 100x currency', () => {
    cy.visit('/webbings?cur=JPY')
    awaitDomain()
    cy.get(PRICE).find('[data-cy="range-min-value"]').click()
    cy.focused().clear().type('200{enter}')

    cy.url().should('include', 'price_min=200')
    cy.url().should('include', 'cur=JPY')
    cy.get(PRICE).find('[data-cy="range-min-value"]').should($el => {
      expect(boundText($el)).to.equal('200')
    })
  })
})
