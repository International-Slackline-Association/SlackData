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
  // Bumped on clearAll so inputs holding local state can reset themselves without
  // reacting to every async param echo (which would race in-progress typing).
  const [resetNonce, setResetNonce] = useState(0)

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
    setResetNonce(n => n + 1)
  }, [setParams])

  return {
    params,
    resetNonce,
    q,
    setQ,
    sort,
    setSort,
    getPillValues,
    setPillValues,
    togglePill,
    getRange,
    setRangeBound,
    setRange,
    clearAll,
  }
}
