// Top-nav currency selector. Sets the display currency for the whole site.
//
// It also owns one side effect the context can't: **re-expressing an active
// price filter**. Switching from a $50–$100 filter to EUR must leave the same
// items selected (€46–€92), not reapply the numbers 50 and 100 as euros — that
// would silently change the result set behind the viewer's back. The bounds
// live in the URL, so the rewrite happens here rather than in the context.

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCurrency } from '@/context/CurrencyContext'
import { CATALOGUE_CURRENCIES, EXTRA_CURRENCIES } from '@/types/enums'
import { symbolFor } from '@/utils/money'

const optionClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50'

export default function CurrencySelector() {
  const { display, detected, isAuto, setDisplay, rates } = useCurrency()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Convert any active price bound into the new currency, and keep ?cur= beside
  // it so the link stays meaningful when shared.
  const pick = (code: string | null) => {
    setOpen(false)
    const next = code ?? detected
    const from = rates?.rates[display]
    const to = rates?.rates[next]

    setDisplay(code)

    const hasBound = params.get('price_min') != null || params.get('price_max') != null
    if (!hasBound) {
      // Currency is a viewer preference, not view state — it only earns a place
      // in the URL when a price bound needs it to be readable.
      if (params.get('cur') != null) {
        const updated = new URLSearchParams(params)
        updated.set('cur', next)
        setParams(updated, { replace: true })
      }
      return
    }

    const updated = new URLSearchParams(params)
    updated.set('cur', next)
    if (from && to) {
      // Round OUTWARD — floor the min, ceil the max — so converting a bound can
      // never narrow the result set. An item priced at exactly the bound lands
      // on 110.00000000000001 after the round trip through a float rate; round
      // that to 110 and the item silently disappears the moment you switch
      // currency, which is precisely what this conversion exists to prevent.
      const convert = (amount: number, round: (n: number) => number) =>
        round(((amount / from) * to) * 100) / 100

      for (const [key, round] of [
        ['price_min', Math.floor],
        ['price_max', Math.ceil],
      ] as const) {
        const raw = updated.get(key)
        if (raw == null || raw === '') continue
        const amount = Number(raw)
        if (!Number.isFinite(amount)) continue
        updated.set(key, String(convert(amount, round)))
      }
    }
    setParams(updated, { replace: true })
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        data-cy="currency-selector"
        data-detected={detected}
        data-auto={isAuto ? 'true' : 'false'}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:border-gray-400"
      >
        <span aria-hidden>{symbolFor(display)}</span>
        <span className="font-medium">{display}</span>
        <span aria-hidden className="text-[10px] text-gray-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-80 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            data-cy="currency-option"
            data-currency="auto"
            data-active={isAuto ? 'true' : 'false'}
            type="button"
            onClick={() => pick(null)}
            className={optionClass}
          >
            <span className="text-gray-500">Auto</span>
            <span className="ml-auto text-xs text-gray-400">{detected}</span>
          </button>

          <div className="my-1 border-t border-gray-100" />

          {[...CATALOGUE_CURRENCIES, ...EXTRA_CURRENCIES].map(code => (
            <button
              key={code}
              data-cy="currency-option"
              data-currency={code}
              data-active={!isAuto && code === display ? 'true' : 'false'}
              type="button"
              onClick={() => pick(code)}
              className={optionClass}
            >
              <span className="w-8 text-gray-500">{symbolFor(code)}</span>
              <span>{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
