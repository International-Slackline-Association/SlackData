import { GEAR_TYPES } from '../support/gear_types'

// Currency standardization — DESIGN.md § Currency & Prices.
//
// The catalogue stores every price as sold, in the seller's own currency (471
// priced items across 14 currencies). The viewer picks ONE display currency and
// the whole site speaks it: cards, detail, compare, the price filter, the price
// sort. Conversion is a display layer — nothing is rewritten in the database.
//
// DETERMINISM RULE: exchange rates move daily, so every assertion on an exact
// converted number goes through the stubbed /fx/rates below. Only the invariance
// tests (ordering, presence, persistence) are allowed to run on live rates —
// they hold for any table, which is the point of testing them that way.

// A fixed, deliberately round rate table. EUR-based, same shape the backend
// serves. Round numbers mean the expected value of a conversion can be worked
// out by hand when a test fails.
const STUB_RATES: Record<string, number> = {
  EUR: 1.0, USD: 1.10, GBP: 0.85, CHF: 0.95, CAD: 1.50, NZD: 1.80,
  CZK: 25.0, PLN: 4.30, ILS: 4.00, BRL: 6.00, ZAR: 20.0, MXN: 20.0,
  RUB: 100.0, INR: 92.0,
}

const STUB_BODY = {
  base: 'EUR',
  date: '2026-08-07',
  source: 'stub',
  stale: false,
  rates: STUB_RATES,
  detected_currency: null,
}

const STORAGE_KEY = 'slackdata.currency'

// price / rate[from] * rate[to] — the same normalize-then-convert the app does.
function convert(price: number, from: string, to: string): number {
  return (price / STUB_RATES[from]) * STUB_RATES[to]
}

function stubRates(body: Partial<typeof STUB_BODY> = {}) {
  cy.intercept('GET', '**/fx/rates*', { statusCode: 200, body: { ...STUB_BODY, ...body } }).as('fx')
}

// Pick the display currency from the top-nav selector.
function selectCurrency(code: string) {
  cy.get('[data-cy="currency-selector"]').click()
  cy.get(`[data-cy="currency-option"][data-currency="${code}"]`).click()
}

// Cards carry no id attribute, so identity in order/membership assertions is the
// product name — which is unique within a gear type and is what the rest of the
// suite matches on too.
function cardNames($cards: JQuery<HTMLElement>): string[] {
  return [...$cards].map(el => el.querySelector('[data-cy="gear-card-name"]')?.textContent ?? '')
}

describe('Currency selector', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
    cy.visit('/webbings')
  })

  it('lives in the top nav on every page', () => {
    cy.get('[data-cy="currency-selector"]').should('be.visible')
    // Prices appear on detail and compare too, so the selector must follow.
    cy.visit('/webbings/1')
    cy.get('[data-cy="currency-selector"]').should('be.visible')
  })

  it('offers an "Auto (detected)" entry first', () => {
    cy.get('[data-cy="currency-selector"]').click()
    cy.get('[data-cy="currency-option"]').first()
      .should('have.attr', 'data-currency', 'auto')
  })

  it('offers every currency the catalogue actually prices in', () => {
    cy.get('[data-cy="currency-selector"]').click()
    Object.keys(STUB_RATES).forEach(code => {
      cy.get(`[data-cy="currency-option"][data-currency="${code}"]`).should('exist')
    })
  })

  it('does not offer currencies with no gear behind them', () => {
    // The Currency enum has 30 members; only 14 have priced items. Offering the
    // rest is a list of dead ends.
    cy.get('[data-cy="currency-selector"]').click()
    cy.get('[data-cy="currency-option"][data-currency="IRR"]').should('not.exist')
    cy.get('[data-cy="currency-option"][data-currency="BYN"]').should('not.exist')
  })

  it('marks exactly one option active', () => {
    cy.get('[data-cy="currency-selector"]').click()
    cy.get('[data-cy="currency-option"][data-active="true"]').should('have.length', 1)
  })

  it('shows the active currency code in the closed selector', () => {
    selectCurrency('USD')
    cy.get('[data-cy="currency-selector"]').should('contain.text', 'USD')
  })
})

describe('Display-currency precedence', () => {
  beforeEach(() => stubRates())

  it('defaults to the detected currency on a first visit', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings')
    // Detection resolves from the browser locale; whatever it picks, the
    // selector must reflect it rather than sitting on a hardcoded currency.
    cy.get('[data-cy="currency-selector"]')
      .should('have.attr', 'data-detected')
      .then(detected => {
        cy.get('[data-cy="currency-selector"]').should('contain.text', String(detected))
      })
  })

  it('persists an explicit choice across a reload', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings')
    selectCurrency('CHF')
    cy.reload()
    cy.get('[data-cy="currency-selector"]').should('contain.text', 'CHF')
  })

  it('persists an explicit choice across gear-type navigation', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings')
    selectCurrency('CHF')
    cy.get('[data-cy="nav-tab"][href="/weblocks"]').click()
    cy.get('[data-cy="currency-selector"]').should('contain.text', 'CHF')
  })

  it('lets an explicit choice win over detection', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings')
    selectCurrency('ZAR')
    cy.window().its('localStorage').invoke('getItem', STORAGE_KEY).should('eq', 'ZAR')
  })

  it('honours ?cur= from the URL', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings?cur=BRL')
    cy.get('[data-cy="currency-selector"]').should('contain.text', 'BRL')
  })

  it('ignores a nonsense ?cur= rather than breaking every price', () => {
    cy.clearLocalStorage()
    cy.visit('/webbings?cur=NOTACURRENCY')
    cy.get('[data-cy="gear-card-price"]').first().should('be.visible')
  })
})

describe('Converted prices on cards', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('renders each card price in the display currency', () => {
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency === 'EUR')
      if (!item) return

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', item.name as string)
        .closest('[data-cy="gear-card"]')
        .find('[data-cy="gear-card-price"]')
        .should('contain.text', convert(item.price as number, 'EUR', 'USD').toFixed(2).replace(/\.?0+$/, ''))
    })
  })

  it('marks a converted price approximate with ≈', () => {
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency === 'EUR')
      if (!item) return

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', item.name as string)
        .closest('[data-cy="gear-card"]')
        .find('[data-cy="gear-card-price"]')
        .should('contain.text', '≈')
    })
  })

  it('drops the ≈ when the item is already priced in the display currency', () => {
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency === 'EUR')
      if (!item) return

      cy.visit('/webbings?cur=EUR')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', item.name as string)
        .closest('[data-cy="gear-card"]')
        .find('[data-cy="gear-card-price"]')
        .should('not.contain.text', '≈')
    })
  })

  it('re-renders every price when the currency changes', () => {
    cy.visit('/webbings?cur=EUR')
    cy.get('[data-cy="gear-card-price"]').first().invoke('text').then(before => {
      selectCurrency('RUB') // 100x EUR in the stub table — unmissably different
      cy.get('[data-cy="gear-card-price"]').first().invoke('text').should('not.eq', before)
    })
  })

  it('still omits the price element entirely when the item has no price', () => {
    cy.fetchAllItems('webbing').then(all => {
      const noPrice = (all as Record<string, unknown>[]).find(i => i.price == null)
      if (!noPrice) return

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', noPrice.name as string)
        .closest('[data-cy="gear-card"]')
        .find('[data-cy="gear-card-price"]')
        .should('not.exist')
    })
  })

  // ── Card data attributes ──────────────────────────────────────────────────
  // `data-price` keeps its existing meaning (the raw as-sold number) so the rest
  // of the suite stays valid; `data-price-base` is the new normalized value that
  // sort and filter actually run on.

  it('keeps data-price as the raw as-sold amount', () => {
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Record<string, unknown>[]).find(i => i.price != null)
      if (!item) return

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', item.name as string)
        .closest('[data-cy="gear-card"]')
        .should('have.attr', 'data-price', String(item.price))
    })
  })

  it('exposes the item currency and the normalized price as data attributes', () => {
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency != null)
      if (!item) return

      const expected = (item.price as number) / STUB_RATES[item.currency as string]

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', item.name as string)
        .closest('[data-cy="gear-card"]')
        .should('have.attr', 'data-currency', item.currency as string)
        .and($el => {
          expect(Number($el.attr('data-price-base'))).to.be.closeTo(expected, 0.01)
        })
    })
  })

  it('leaves data-price-base empty for an item with no price', () => {
    cy.fetchAllItems('webbing').then(all => {
      const noPrice = (all as Record<string, unknown>[]).find(i => i.price == null)
      if (!noPrice) return

      cy.visit('/webbings?cur=USD')
      cy.get('[data-cy="gear-card"]')
        .contains('[data-cy="gear-card-name"]', noPrice.name as string)
        .closest('[data-cy="gear-card"]')
        .should('have.attr', 'data-price-base', '')
    })
  })
})

describe('Converted prices on the detail page', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('shows the as-sold original beneath a converted price', () => {
    cy.fetchAllItems('weblock').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency === 'EUR')
      if (!item) return

      cy.visit(`/weblocks/${item.id}?cur=USD`)
      cy.get('[data-cy="detail-price"]').should('contain.text', '≈')
      cy.get('[data-cy="detail-price-original"]')
        .should('be.visible')
        .and('contain.text', String(item.price))
        .and('contain.text', 'EUR')
    })
  })

  it('omits the as-sold line when no conversion happened', () => {
    cy.fetchAllItems('weblock').then(all => {
      const item = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.currency === 'EUR')
      if (!item) return

      cy.visit(`/weblocks/${item.id}?cur=EUR`)
      cy.get('[data-cy="detail-price-original"]').should('not.exist')
    })
  })
})

describe('Units survive conversion', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('appends /m to webbing prices — they are priced per meter', () => {
    cy.visit('/webbings?cur=USD')
    cy.get('[data-cy="gear-card-price"]').first().should('contain.text', '/m')
  })

  it('does not append /m to gear that is priced per item', () => {
    cy.visit('/weblocks?cur=USD')
    cy.get('[data-cy="gear-card-price"]').first().should('not.contain.text', '/m')
  })

  it('keeps the per-pair qualifier on tree protectors', () => {
    cy.fetchAllItems('treepro').then(all => {
      const pair = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.price_unit === 'pair')
      if (!pair) return

      cy.visit(`/treepros/${pair.id}?cur=USD`)
      cy.get('[data-cy="detail-price"]').should('contain.text', 'pair')
    })
  })

  it('does not halve a pair price', () => {
    cy.fetchAllItems('treepro').then(all => {
      const pair = (all as Record<string, unknown>[])
        .find(i => i.price != null && i.price_unit === 'pair' && i.currency != null)
      if (!pair) return

      const expected = convert(pair.price as number, pair.currency as string, 'EUR')
      cy.visit(`/treepros/${pair.id}?cur=EUR`)
      cy.get('[data-cy="detail-price"]').invoke('text').then(text => {
        const shown = Number(text.replace(/[^0-9.]/g, ''))
        expect(shown).to.be.closeTo(expected, 1)
      })
    })
  })
})

describe('Price filter', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  // The filter must exist for every gear type — price is the one axis that is
  // meaningful for all 8.
  GEAR_TYPES.forEach(({ slug, label }) => {
    it(`offers a price range filter on ${label}`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="filter-group"][data-group="price"]').should('exist')
    })
  })

  it('is the first filter group in the sidebar', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"]').first()
      .should('have.attr', 'data-group', 'price')
  })

  it('is labelled "Price per meter" on webbings', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="price"]')
      .should('contain.text', 'Price per meter')
  })

  it('is labelled "Price" on gear sold by the item', () => {
    cy.visit('/weblocks')
    cy.get('[data-cy="filter-group"][data-group="price"]')
      .should('contain.text', 'Price')
      .and('not.contain.text', 'per meter')
  })

  it('narrows the grid to items inside the bounds', () => {
    cy.visit('/weblocks?cur=EUR&price_min=50&price_max=100')
    cy.get('[data-cy="gear-card"]').each($card => {
      const base = Number($card.attr('data-price-base'))
      expect(base).to.be.within(50, 100)
    })
  })

  it('excludes items with no price once a bound is set', () => {
    cy.visit('/weblocks?cur=EUR&price_min=1')
    cy.get('[data-cy="gear-card"]').each($card => {
      expect($card.attr('data-price-base')).to.not.equal('')
    })
  })

  it('writes the bounds and ?cur= to the URL together', () => {
    cy.visit('/weblocks?cur=USD')
    cy.get('[data-cy="filter-group"][data-group="price"]')
      .find('[data-cy="range-min-value"]').click()
    cy.focused().clear().type('60{enter}')

    cy.url().should('include', 'price_min=60')
    cy.url().should('include', 'cur=USD')
  })

  it('expresses the slider domain in the display currency', () => {
    // Same catalogue, two currencies: the domain scales by the rate. RUB is 100x
    // EUR in the stub table, so the max must move by roughly that factor.
    cy.visit('/weblocks?cur=EUR')
    cy.get('[data-cy="filter-group"][data-group="price"]')
      .find('[data-cy="range-max"]').invoke('attr', 'max').then(eurMax => {
        cy.visit('/weblocks?cur=RUB')
        cy.get('[data-cy="filter-group"][data-group="price"]')
          .find('[data-cy="range-max"]').invoke('attr', 'max').then(rubMax => {
            expect(Number(rubMax)).to.be.closeTo(Number(eurMax) * 100, Number(eurMax) * 5)
          })
      })
  })

  it('converts an active bound when the currency changes, keeping the same items', () => {
    // The sharp edge: switching currency must re-express the bound, not reapply
    // the same number in a different currency — that would silently change the
    // result set behind the viewer's back.
    // Clearing storage needs an origin to clear, and beforeEach runs before the
    // first visit of the test — so establish the page, THEN clear, then deep-link.
    // Otherwise an explicit pick left by an earlier test outranks ?cur= here.
    cy.visit('/weblocks')
    cy.clearLocalStorage()
    cy.visit('/weblocks?cur=EUR&price_min=50&price_max=100')

    cy.get('[data-cy="currency-selector"]').should('contain.text', 'EUR')
    cy.get('[data-cy="gear-card"]').then($before => {
      const before = cardNames($before)

      selectCurrency('USD')

      cy.url().should('include', 'price_min=55') // 50 EUR * 1.10
      // Retryable: the grid re-renders after the URL commits, so a bare .then()
      // can read the DOM one commit early.
      cy.get('[data-cy="gear-card"]').should($after => {
        expect(cardNames($after)).to.deep.equal(before)
      })
    })
  })
})

describe('Price sort', () => {
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('orders by the normalized value, not the raw number', () => {
    // The bug this whole phase fixes: unsorted, "Price Low→High" ranked a
    // 5377 RUB grip against an 89 USD one numerically.
    cy.visit('/grips?cur=EUR&sort=price-asc')
    cy.get('[data-cy="gear-card"]').then($cards => {
      const bases = [...$cards]
        .map(el => el.getAttribute('data-price-base'))
        .filter(v => v !== '')
        .map(Number)
      expect(bases).to.deep.equal([...bases].sort((a, b) => a - b))
    })
  })

  it('produces the same order in every display currency', () => {
    // Converting all prices to any target is one global scalar multiply, so the
    // order is currency-independent. Cheap test, strong guarantee.
    cy.visit('/weblocks?cur=EUR&sort=price-asc')
    cy.get('[data-cy="gear-card"]').then($eur => {
      const eurOrder = cardNames($eur)

      cy.visit('/weblocks?cur=INR&sort=price-asc')
      cy.get('[data-cy="gear-card"]').then($inr => {
        expect(cardNames($inr)).to.deep.equal(eurOrder)
      })
    })
  })

  it('keeps items with no price last in both directions', () => {
    ;['asc', 'desc'].forEach(direction => {
      cy.visit(`/webbings?cur=EUR&sort=price-${direction}`)
      cy.get('[data-cy="gear-card"]').then($cards => {
        const hasPrice = [...$cards].map(el => el.getAttribute('data-price-base') !== '')
        const firstNull = hasPrice.indexOf(false)
        if (firstNull === -1) return
        expect(hasPrice.slice(firstNull).every(v => v === false)).to.equal(true)
      })
    })
  })

  it('labels the webbing sort per meter', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"][data-field="price"]').first()
      .should('contain.text', 'meter')
  })
})

describe('Price in the compare table', () => {
  // Compare cells currently render as bare <td>s. Addressing one cell needs a
  // handle, so this phase adds data-cy="compare-cell" + data-id to them — a new
  // contract, not an existing one.
  beforeEach(() => {
    stubRates()
    cy.clearLocalStorage()
  })

  it('has a price row — until now you could not compare gear on cost', () => {
    cy.fetchAllItems('weblock').then(all => {
      const priced = (all as Record<string, unknown>[]).filter(i => i.price != null).slice(0, 2)
      if (priced.length < 2) return

      cy.visit(`/weblocks/compare?ids=${priced.map(i => i.id).join(',')}&cur=USD`)
      cy.get('[data-cy="compare-row"][data-field="price"]').should('exist')
    })
  })

  it('puts price first in the compare table', () => {
    cy.fetchAllItems('weblock').then(all => {
      const priced = (all as Record<string, unknown>[]).filter(i => i.price != null).slice(0, 2)
      if (priced.length < 2) return

      cy.visit(`/weblocks/compare?ids=${priced.map(i => i.id).join(',')}&cur=USD`)
      cy.get('[data-cy="compare-row"]').first()
        .should('have.attr', 'data-field', 'price')
    })
  })

  it('shows compared prices in one currency', () => {
    cy.fetchAllItems('weblock').then(all => {
      const items = all as Record<string, unknown>[]
      const eur = items.find(i => i.price != null && i.currency === 'EUR')
      const other = items.find(i => i.price != null && i.currency !== 'EUR' && i.currency != null)
      if (!eur || !other) return

      cy.visit(`/weblocks/compare?ids=${eur.id},${other.id}&cur=USD`)
      cy.get('[data-cy="compare-row"][data-field="price"]')
        .find('[data-cy="compare-cell"]')
        .each($cell => {
          expect($cell.text()).to.match(/\$|USD/)
        })
    })
  })

  it('shows an empty cell for an item with no price', () => {
    cy.fetchAllItems('webbing').then(all => {
      const items = all as Record<string, unknown>[]
      const priced = items.find(i => i.price != null)
      const unpriced = items.find(i => i.price == null)
      if (!priced || !unpriced) return

      cy.visit(`/webbings/compare?ids=${priced.id},${unpriced.id}&cur=USD`)
      cy.get('[data-cy="compare-row"][data-field="price"]')
        .find(`[data-cy="compare-cell"][data-id="${unpriced.id}"]`)
        .should('have.text', '—')
    })
  })
})

describe('Degraded mode — rates unavailable', () => {
  beforeEach(() => cy.clearLocalStorage())

  it('still renders the catalogue when /fx/rates fails', () => {
    cy.intercept('GET', '**/fx/rates*', { statusCode: 500, body: {} }).as('fxFail')
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })

  it('falls back to as-sold prices with no ≈', () => {
    cy.intercept('GET', '**/fx/rates*', { statusCode: 500, body: {} })
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card-price"]').first()
      .should('be.visible')
      .and('not.contain.text', '≈')
  })

  it('shows a stale-rates notice', () => {
    cy.intercept('GET', '**/fx/rates*', { statusCode: 500, body: {} })
    cy.visit('/webbings')
    cy.get('[data-cy="fx-stale-notice"]').should('be.visible')
  })

  it('shows the notice when the backend itself reports stale rates', () => {
    stubRates({ stale: true })
    cy.visit('/webbings')
    cy.get('[data-cy="fx-stale-notice"]').should('be.visible')
  })

  it('shows no notice when rates are fresh', () => {
    stubRates()
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('exist')
    cy.get('[data-cy="fx-stale-notice"]').should('not.exist')
  })

  it('keeps filtering and sorting usable without rates', () => {
    // Only cross-currency comparison degrades — the catalogue stays browsable.
    cy.intercept('GET', '**/fx/rates*', { statusCode: 500, body: {} })
    cy.visit('/webbings?sort=weight-asc')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
  })
})
