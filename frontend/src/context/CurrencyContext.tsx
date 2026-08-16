// The display currency for the whole site, and everything derived from it.
//
// One currency is chosen per viewer and every price obeys it — cards, detail,
// compare, the price filter, the price sort. The catalogue itself is untouched:
// each item keeps the price and currency it is sold in, and conversion happens
// here, on read. See DESIGN.md § Currency & Prices.
//
// Precedence (highest first): explicit choice in localStorage → ?cur= in the
// URL → detected → USD. The explicit choice wins because someone who has picked
// a currency has said what they want; ?cur= sits above detection so a shared
// link carrying a price filter means the same thing to whoever opens it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchRates } from '@/api/fx'
import { detectCurrency } from '@/utils/detectCurrency'
import { convertPrice, formatMoney, toBase, type FxRates } from '@/utils/money'
import { isSelectableCurrency } from '@/types/enums'
import type { AnyItem } from '@/utils/format'

export const CURRENCY_STORAGE_KEY = 'slackdata.currency'

export interface PriceParts {
  text: string          // what to show, e.g. "≈ $96" or "€89"
  approx: boolean       // true when the number is a conversion, not the sticker price
  original: string | null // the as-sold amount, e.g. "89 EUR" — null when not converted
}

interface CurrencyValue {
  display: string
  detected: string
  isAuto: boolean
  /** Pass null to go back to following detection. */
  setDisplay: (code: string | null) => void
  rates: FxRates | null
  /** No usable rates, or rates the backend flagged as stale. */
  stale: boolean
  /** Price in the rate table's base currency — what sort and filter run on. */
  basePrice: (item: AnyItem) => number | null
  /** Price in the display currency, as a number. */
  displayPrice: (item: AnyItem) => number | null
  /** Fully formatted price, or null when the item has no price at all. */
  priceText: (item: AnyItem, slug: string, opts?: { qualifier?: boolean }) => PriceParts | null
}

const CurrencyContext = createContext<CurrencyValue | null>(null)

function readStored(): string | null {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY)
    return stored && isSelectableCurrency(stored) ? stored : null
  } catch {
    return null
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams()
  const [rates, setRates] = useState<FxRates | null>(null)
  // Rates start out null because they haven't arrived yet, which looks exactly
  // like "rates failed". Without this flag the stale banner flashes on every
  // cold load before settling.
  const [loaded, setLoaded] = useState(false)
  // null = auto (follow detection). A string = an explicit choice.
  const [chosen, setChosen] = useState<string | null>(readStored)

  useEffect(() => {
    let cancelled = false
    fetchRates().then(payload => {
      if (cancelled) return
      setRates(payload)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The backend can only detect when CloudFront passes a viewer-country header,
  // which never happens locally — so browser detection is the floor, not the
  // fallback.
  const detected = useMemo(() => {
    const fromBackend = rates?.detected_currency
    if (fromBackend && isSelectableCurrency(fromBackend)) return fromBackend
    return detectCurrency()
  }, [rates])

  // An unrecognized ?cur= is ignored rather than honoured — a typo in a shared
  // link must not blank every price on the page.
  const fromUrl = params.get('cur')
  const urlCurrency = fromUrl && isSelectableCurrency(fromUrl) ? fromUrl : null

  const display = chosen ?? urlCurrency ?? detected

  const setDisplay = useCallback((code: string | null) => {
    setChosen(code)
    try {
      if (code) localStorage.setItem(CURRENCY_STORAGE_KEY, code)
      else localStorage.removeItem(CURRENCY_STORAGE_KEY)
    } catch {
      // Private mode — the choice still holds for this session.
    }
  }, [])

  const value = useMemo<CurrencyValue>(() => {
    const basePrice = (item: AnyItem) => toBase(item.price, item.currency, rates)
    const displayPrice = (item: AnyItem) => convertPrice(item.price, item.currency, display, rates)

    const priceText = (
      item: AnyItem,
      slug: string,
      opts?: { qualifier?: boolean },
    ): PriceParts | null => {
      if (item.price == null || item.price === '') return null

      const currency = typeof item.currency === 'string' ? item.currency : null
      // Webbing is priced per meter (the seed's `priceMeter`), which the model
      // field name doesn't say. Without this suffix a €2.40 webbing reads like
      // a €2.40 product next to an €89 weblock.
      const perMeter = slug === 'webbings' ? ' /m' : ''
      const qualifier =
        opts?.qualifier && item.price_unit ? ` per ${String(item.price_unit)}` : ''
      const suffix = `${perMeter}${qualifier}`

      const converted = displayPrice(item)
      // No rates, an uncovered currency, or the item is already in the display
      // currency — either way there is nothing to convert and nothing to hedge.
      if (converted == null || currency === display) {
        const asSold =
          currency != null
            ? formatMoney(Number(item.price), currency)
            : String(item.price)
        return { text: `${asSold}${suffix}`, approx: false, original: null }
      }

      return {
        text: `≈ ${formatMoney(converted, display)}${suffix}`,
        approx: true,
        // The exact amount as sold, unrounded — the whole point of keeping it
        // visible is that it is the number the manufacturer actually charges.
        original: `${item.price} ${currency}`,
      }
    }

    return {
      display,
      detected,
      isAuto: chosen == null,
      setDisplay,
      rates,
      stale: loaded && (rates == null || rates.stale === true),
      basePrice,
      displayPrice,
      priceText,
    }
  }, [display, detected, chosen, rates, loaded, setDisplay])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used inside a CurrencyProvider')
  return ctx
}
