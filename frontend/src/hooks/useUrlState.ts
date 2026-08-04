// URL-as-state hook. The listing page keeps search, sort, and every filter in
// the query string so any view is bookmarkable / shareable (see url_state.cy.ts).
//
// Param contract:
//   ?q=term                          search query
//   ?sort=field-direction            e.g. ?sort=weight-asc  (Name A→Z = no param)
//   ?{field}=value1,value2           pill filter (comma-separated multi-select)
//   ?{field}_min=val&{field}_max=val range filter bounds
//
// The hook is generic: `q` and `sort` are fixed keys; pill/range accessors take
// the field name, and the calling page supplies those from its filter config.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export type SortDirection = 'asc' | 'desc'
export interface SortSpec {
  field: string
  direction: SortDirection
}

export function useUrlState() {
  const [params, setParams] = useSearchParams()
  // Bumped on a clear so inputs holding local state can reset themselves without
  // reacting to every async param echo (which would race in-progress typing).
  // It carries the search term the clear INTENDED to leave behind ('' for
  // clearAll, the kept term for clearFilters): the router commits the new params
  // in a later render than this bump, so a listener reading `q` at bump time
  // would still see the pre-clear value.
  const [reset, setReset] = useState({ nonce: 0, q: '' })

  // Mirror of the latest INTENDED params. react-router does not compose rapid
  // functional setParams calls — each `prev` is the last committed location, so
  // back-to-back writes (two slider thumbs, fast typing) clobber each other.
  // Building each mutation from this ref instead composes correctly; the effect
  // resyncs it after every commit (covers clear-all / back-forward).
  const pendingRef = useRef(params)
  useEffect(() => {
    pendingRef.current = params
  }, [params])

  const q = params.get('q') ?? ''

  const sort = useMemo<SortSpec | null>(() => {
    const raw = params.get('sort')
    if (!raw) return null
    const idx = raw.lastIndexOf('-')
    if (idx < 0) return null
    const direction = raw.slice(idx + 1)
    if (direction !== 'asc' && direction !== 'desc') return null
    return { field: raw.slice(0, idx), direction }
  }, [params])

  // All mutations replace history (typing a search term shouldn't spam the
  // back button) and operate on a copy of the current params.
  const mutate = useCallback(
    (fn: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(pendingRef.current)
      fn(next)
      pendingRef.current = next
      setParams(next, { replace: true })
    },
    [setParams],
  )

  const setQ = useCallback(
    (value: string) => mutate(next => (value ? next.set('q', value) : next.delete('q'))),
    [mutate],
  )

  const setSort = useCallback(
    (spec: SortSpec | null) =>
      mutate(next =>
        spec ? next.set('sort', `${spec.field}-${spec.direction}`) : next.delete('sort'),
      ),
    [mutate],
  )

  const getPillValues = useCallback(
    (field: string): string[] => {
      const raw = params.get(field)
      return raw ? raw.split(',') : []
    },
    [params],
  )

  const setPillValues = useCallback(
    (field: string, values: string[]) =>
      mutate(next => (values.length ? next.set(field, values.join(',')) : next.delete(field))),
    [mutate],
  )

  const togglePill = useCallback(
    (field: string, value: string) =>
      mutate(next => {
        const raw = next.get(field)
        const values = raw ? raw.split(',') : []
        const nextValues = values.includes(value)
          ? values.filter(v => v !== value)
          : [...values, value]
        if (nextValues.length) next.set(field, nextValues.join(','))
        else next.delete(field)
      }),
    [mutate],
  )

  // Single-select groups (exactly 2 options): picking a value replaces whatever
  // was there, and re-picking the active value clears the group.
  //
  // The "is this already the only value?" decision MUST be made in here, off
  // `next` (built from the pending mirror), not by the caller off `getPillValues`
  // — which reads the last COMMITTED params. Deciding outside meant a second
  // click landing before the URL echo saw stale state, concluded the value
  // wasn't active, and re-applied it instead of clearing: the pill appeared
  // stuck on. Same reasoning as togglePill above.
  const setPillExclusive = useCallback(
    (field: string, value: string) =>
      mutate(next => {
        const raw = next.get(field)
        const values = raw ? raw.split(',') : []
        const isOnly = values.length === 1 && values[0] === value
        if (isOnly) next.delete(field)
        else next.set(field, value)
      }),
    [mutate],
  )

  const getRange = useCallback(
    (field: string): { min?: number; max?: number } => {
      const min = params.get(`${field}_min`)
      const max = params.get(`${field}_max`)
      return {
        min: min !== null && min !== '' ? Number(min) : undefined,
        max: max !== null && max !== '' ? Number(max) : undefined,
      }
    },
    [params],
  )

  const setRangeBound = useCallback(
    (field: string, bound: 'min' | 'max', value: string) =>
      mutate(next => {
        const key = `${field}_${bound}`
        if (value !== '') next.set(key, value)
        else next.delete(key)
      }),
    [mutate],
  )

  // Sets both bounds of a range in a single write. react-router does not compose
  // rapid functional setParams calls, so writing min and max separately lets one
  // clobber the other while typing; writing both at once (from local state) is
  // clobber-safe.
  const setRange = useCallback(
    (field: string, min: string, max: string) =>
      mutate(next => {
        const minKey = `${field}_min`
        const maxKey = `${field}_max`
        if (min !== '') next.set(minKey, min)
        else next.delete(minKey)
        if (max !== '') next.set(maxKey, max)
        else next.delete(maxKey)
      }),
    [mutate],
  )

  // Clears search + all filters but stays on the current route.
  const clearAll = useCallback(() => {
    pendingRef.current = new URLSearchParams()
    setParams(new URLSearchParams(), { replace: true })
    setReset(r => ({ nonce: r.nonce + 1, q: '' }))
  }, [setParams])

  // Clears the filters but KEEPS the search term (and the sort, which can't
  // empty a result set) — the empty state's "Clear filters" action. Same route,
  // now carrying only ?q=/?sort=. It bumps the same reset nonce as clearAll, so
  // widgets holding local state (the stretch filter) reset either way; the
  // search box re-seeds itself from the surviving `q` rather than blanking.
  const clearFilters = useCallback(() => {
    const next = new URLSearchParams()
    const keptQ = pendingRef.current.get('q')
    const keptSort = pendingRef.current.get('sort')
    if (keptQ) next.set('q', keptQ)
    if (keptSort) next.set('sort', keptSort)
    pendingRef.current = next
    setParams(next, { replace: true })
    setReset(r => ({ nonce: r.nonce + 1, q: keptQ ?? '' }))
  }, [setParams])

  return {
    params,
    resetNonce: reset.nonce,
    resetQuery: reset.q, // the search term the last clear meant to keep
    q,
    setQ,
    sort,
    setSort,
    getPillValues,
    setPillValues,
    togglePill,
    setPillExclusive,
    getRange,
    setRangeBound,
    setRange,
    clearAll,
    clearFilters,
  }
}
