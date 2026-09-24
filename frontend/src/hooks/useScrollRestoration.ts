// Scroll restoration for back/forward navigation.
//
// Without it every navigation lands at the top of the page — so opening the
// 180th webbing and pressing Back drops you back at webbing #1, with 180 cards
// to scroll through again. That is the single most-repeated action on the site.
//
// react-router ships <ScrollRestoration>, but ONLY for a data router
// (createBrowserRouter). main.tsx mounts a plain <BrowserRouter>, so this is the
// hook version of the same idea. Moving the app to a data router just to get it
// would rewrite App.tsx's whole route table for one behaviour.
//
// Three things make it work rather than nearly work:
//
//  1. `history.scrollRestoration = 'manual'`. The browser's own restoration
//     fires before React has rendered the list, so it restores against a page
//     that is still one spinner tall and silently clamps to 0. Ours is the only
//     restoration; the browser's is turned off.
//  2. Keyed by `location.key`, not by pathname. Two visits to /webbings with
//     different filters are different entries and must not inherit each other's
//     offset. `key` is exactly react-router's identity for a history entry, and
//     it survives back/forward.
//  3. Retried across frames. The listing fetches its items, so at restore time
//     the document is usually far too short to hold the saved offset. Setting it
//     once would clamp to the bottom of a spinner. Instead we re-apply on every
//     animation frame until the offset actually sticks or the budget runs out —
//     which also covers images loading in and changing the layout underneath.
//
// PUSH navigations still go to the top, which is what a fresh navigation should
// do — unless the URL carries a fragment (/safety#isa-certification), in which
// case they land on that element. With the browser's restoration turned off
// (point 1), nothing else would honour the fragment. POP (back/forward) restores. REPLACE stays exactly where it is — see the
// note on the restore effect below.

import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// sessionStorage, not a module Map: a full page reload keeps the history stack,
// so the entries you can still press Back to must keep their offsets. Scoped by
// a prefix so it cannot collide with anything else the app stores.
const KEY_PREFIX = 'slackdata:scroll:'

// How long to keep trying to reach the saved offset. Generous, because the
// budget is only ever spent on a page that has not finished growing; the loop
// exits the frame the offset lands.
const RESTORE_BUDGET_MS = 1500

function save(key: string, y: number) {
  try {
    sessionStorage.setItem(KEY_PREFIX + key, String(y))
  } catch {
    // Private mode / storage disabled. Losing scroll position is not worth an
    // exception on a navigation.
  }
}

function load(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export default function useScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()

  // The key of the entry currently on screen. Held in a ref so the scroll
  // listener — registered once — always writes against the CURRENT entry rather
  // than the one that was current when it was attached.
  const currentKey = useRef(location.key)
  currentKey.current = location.key

  useEffect(() => {
    const prior = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = prior
    }
  }, [])

  // Record the offset continuously rather than on unmount: React may not run a
  // cleanup before the browser has already moved on, and a passive scroll
  // listener writing a number is cheap.
  useEffect(() => {
    const onScroll = () => save(currentKey.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // A REPLACE is never a navigation in this app: every URL-state write —
    // compare selection, filter pills, search, sort, view — goes through
    // `setParams(..., { replace: true })` on the listing you are already
    // reading. But react-router mints a fresh `location.key` for a replace just
    // as it does for a push, so this effect saw a brand-new entry and sent the
    // window to the top: ticking Compare on the 40th card threw you back to the
    // 1st, undoing the scroll that found it. Same page, same scroll.
    //
    // The offset is carried onto the new key first. Nothing has scrolled, so no
    // scroll listener will fire to record it, and without this the entry you are
    // standing on has no saved offset at all — open an item from it, press Back,
    // and you would land at the top by the other route.
    if (navigationType === 'REPLACE') {
      save(location.key, window.scrollY)
      return
    }

    const target = navigationType === 'POP' ? load(location.key) : 0

    // No offset to restore, but the URL names a fragment (/safety#isa-certification
    // — a link click, or a deep link opened cold, which arrives as a POP with
    // nothing saved): land on that element. Retried across frames for the same
    // reason as the restore below — it may not have rendered on the first one.
    if (!target && location.hash) {
      const id = decodeURIComponent(location.hash.slice(1))
      let raf = 0
      const deadline = performance.now() + RESTORE_BUDGET_MS
      const tick = () => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView()
          return
        }
        if (performance.now() > deadline) {
          window.scrollTo(0, 0)
          return
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }

    if (!target) {
      window.scrollTo(0, 0)
      return
    }

    let raf = 0
    const deadline = performance.now() + RESTORE_BUDGET_MS
    const tick = () => {
      window.scrollTo(0, target)
      // Landed (within a pixel of rounding), or out of budget. Anything short of
      // the target means the document is still growing, so try again next frame.
      if (Math.abs(window.scrollY - target) <= 1 || performance.now() > deadline) return
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // location.key alone identifies the entry; pathname/search are implied by it.
    // hash is too, but is read above, so it is listed rather than suppressed.
  }, [location.key, location.hash, navigationType])
}
