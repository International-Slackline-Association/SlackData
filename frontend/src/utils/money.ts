// Currency conversion + money formatting for the display layer.
//
// The catalogue stores every price as sold, in the seller's own currency —
// nothing here writes anything back. Conversion is normalize-then-convert
// against an EUR-based rate table (see DESIGN.md § Currency & Prices):
//
//     base    = price / rates[from]
//     display = base * rates[to]
//
// Normalizing first is what makes cross-currency comparison possible at all:
// a listing that mixes a 5377 RUB grip with an 89 USD one cannot be sorted,
// filtered or compared on the raw numbers.

export interface FxRates {
  base: string
  date: string
  stale: boolean
  rates: Record<string, number>
  detected_currency?: string | null
}

// Symbols for the currencies the selector offers. Anything unlisted falls back
// to its ISO code, which is always a correct (if plainer) label.
const SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$',
  JPY: '¥', CNY: '¥', CZK: 'Kč', PLN: 'zł', DKK: 'kr', SEK: 'kr', ILS: '₪',
  INR: '₹', BRL: 'R$', MXN: 'MX$', ZAR: 'R', RUB: '₽', TRY: '₺', SGD: 'S$',
  HKD: 'HK$', KRW: '₩',
}

export function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? currency
}

function rateFor(currency: unknown, rates: FxRates | null): number | null {
  if (!rates || typeof currency !== 'string') return null
  const rate = rates.rates[currency]
  return typeof rate === 'number' && rate > 0 ? rate : null
}

/**
 * A price expressed in the rate table's base currency, or null when it can't
 * be — no price, no currency, or a currency the table doesn't cover.
 *
 * This is the value sort and filter run on. It is deliberately NOT rounded:
 * rounding here would make two prices that differ by a cent compare equal.
 */
export function toBase(
  price: unknown,
  currency: unknown,
  rates: FxRates | null,
): number | null {
  if (price == null || price === '') return null
  const amount = Number(price)
  if (!Number.isFinite(amount)) return null
  const rate = rateFor(currency, rates)
  return rate == null ? null : amount / rate
}

/** Convert between two currencies via the base. Null when either side is unknown. */
export function convertPrice(
  price: unknown,
  from: unknown,
  to: string,
  rates: FxRates | null,
): number | null {
  const base = toBase(price, from, rates)
  const rate = rateFor(to, rates)
  return base == null || rate == null ? null : base * rate
}

/**
 * How finely a price control should move in a given currency: its step and the
 * decimal places that match it.
 *
 * The dollar is the baseline — cents, two decimals. A currency whose numbers run
 * an order of magnitude larger says the same thing with one digit fewer: ¥1,683
 * is as precise as $10.56, and a JPY slider crawling in hundredths would be tens
 * of thousands of steps of pure noise across the same catalogue. So drop a
 * decimal per factor of ten against USD, stopping at whole units for anything
 * 100× the dollar or beyond. Never finer than the dollar's own cents: a strong
 * currency doesn't earn a third decimal.
 *
 * Falls back to the dollar's precision whenever the ratio isn't knowable (rates
 * still loading, or a currency the table doesn't cover).
 */
export function moneyPrecision(
  currency: string,
  rates: FxRates | null,
): { step: number; decimals: number } {
  const rate = rateFor(currency, rates)
  const usd = rateFor('USD', rates)
  const decimals =
    rate == null || usd == null
      ? 2
      : Math.min(2, Math.max(0, 2 - Math.floor(Math.log10(rate / usd))))
  return { step: 10 ** -decimals, decimals }
}

/**
 * Format an amount as money in the viewer's locale.
 *
 * Whole units above 100 — nobody comparing a €340 roller cares about the
 * cents, and the extra digits make a grid of prices harder to scan. Below
 * that the cents matter: webbing is priced per meter, often under €3.
 */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  const digits = Math.abs(amount) >= 100 ? 0 : 2
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    // Intl throws on a currency code it doesn't recognize. A price rendered
    // plainly is worth more than a component that crashes.
    return `${amount.toFixed(digits)} ${currency}`
  }
}
