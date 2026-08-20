// Viewport queries as React state.
//
// This exists for ONE structural reason: the filter sidebar must be rendered
// exactly once. Below `lg` it lives inside a bottom sheet, at `lg`+ it is an
// inline column — and the naive `hidden lg:block` / `lg:hidden` pair would put
// two `data-cy="filter-sidebar"` elements in the DOM at the same time, which
// breaks the selector contract every Cypress spec is built on. So the switch has
// to happen in JS, not CSS.
//
// Purely presentational responsiveness (gutters, column counts, font sizes)
// should still use Tailwind prefixes — this hook is for cases where the DOM
// itself must differ.

import { useCallback, useSyncExternalStore } from 'react'

// `lg` in Tailwind v4's default scale. Kept as a constant so the sidebar's
// breakpoint and the `lg:` classes around it can never drift apart.
export const DESKTOP_QUERY = '(min-width: 1024px)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot. There is no SSR here, but useSyncExternalStore wants it
    // and `false` is the safer default: it renders the mobile tree, which is a
    // single column and degrades gracefully at any width.
    () => false,
  )
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY)
}
