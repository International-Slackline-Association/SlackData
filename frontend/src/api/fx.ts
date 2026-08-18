// Exchange rates from our own backend (`GET /fx/rates`).
//
// Rates are cached in localStorage with a TTL so a repeat visit paints prices
// immediately instead of waiting on a network round-trip. The backend caches
// too (module-level, TTL'd — see slack_data/utilities/fx.py); this is the
// second tier, per browser.
//
// Failure is not exceptional here. The endpoint is built never to 5xx, but the
// network still can, so a failed load resolves to `null` and the app renders
// prices as sold. Losing cross-currency comparison is a degraded catalogue;
// throwing would be no catalogue at all.

import { API_BASE } from './client'
import type { FxRates } from '@/utils/money'

const CACHE_KEY = 'slackdata.fxRates'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface CachedRates {
  fetchedAt: number
  payload: FxRates
}

function readCache(): FxRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedRates
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null
    return isUsable(cached.payload) ? cached.payload : null
  } catch {
    return null
  }
}

function writeCache(payload: FxRates): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), payload }))
  } catch {
    // Private mode / quota exceeded — the in-memory rates still work.
  }
}

// A table with no usable base rate can't normalize anything, so it is worse
// than no table: it would silently convert every price to NaN.
function isUsable(payload: unknown): payload is FxRates {
  if (!payload || typeof payload !== 'object') return false
  const { base, rates } = payload as FxRates
  return (
    typeof base === 'string' &&
    !!rates &&
    typeof rates === 'object' &&
    typeof rates[base] === 'number' &&
    rates[base] > 0
  )
}

export async function fetchRates(): Promise<FxRates | null> {
  const cached = readCache()
  if (cached) return cached

  try {
    const res = await fetch(`${API_BASE}/fx/rates`)
    if (!res.ok) return null
    const payload = (await res.json()) as unknown
    if (!isUsable(payload)) return null
    // Stale rates are still cacheable — they're what the backend fell back to,
    // and re-asking on every navigation won't make them fresher.
    writeCache(payload)
    return payload
  } catch {
    return null
  }
}
