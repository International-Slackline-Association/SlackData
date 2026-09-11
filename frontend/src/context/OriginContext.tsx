// The current page's identity, offered to every link inside it.
//
// A card doesn't know whether it is being rendered in a filtered listing, on a
// manufacturer's page or in the compare table — and it shouldn't have to. The
// page that mounts it says who it is; the links read that off context and hang
// it on their navigation state (utils/origin.ts), so the destination can offer a
// way back to THIS page rather than to a generic listing.
//
// Context rather than props: the links are three and four components deep
// (GearGrid → GearCard, GearDetailedList → GearDetailBody), and none of the
// layers in between have any business carrying a back label.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { originState, type Origin } from '@/utils/origin'

const OriginContext = createContext<Origin | null>(null)

/** This page as a back-link target: its live URL (query string included, so the
 *  filters in play at click time are what comes back) under the given label. */
export function useCurrentOrigin(label: string): Origin {
  const { pathname, search } = useLocation()
  return useMemo(() => ({ path: pathname + search, label }), [pathname, search, label])
}

export function OriginProvider({ origin, children }: { origin: Origin; children: ReactNode }) {
  return <OriginContext.Provider value={origin}>{children}</OriginContext.Provider>
}

/** Navigation state for a <Link> leaving this page, or undefined outside a
 *  provider — an un-labelled page contributes nothing and the destination falls
 *  back to its own default. */
export function useOriginState(): { origin: Origin } | undefined {
  return originState(useContext(OriginContext))
}
