// The "← somewhere" link at the top of a detail page.
//
// Where it points is whatever pushed us here (utils/origin.ts), falling back to
// the page's own default — so a webbing opened from Balance Community's page
// goes back to Balance Community, and one opened from a filtered listing goes
// back to that listing with its filters, sort and view intact.
//
// It is a real <Link> with a real href: the destination is a URL, and
// middle-click, ⌘-click and "copy link address" must all work on it.
//
// But a plain left click prefers history.back() when we know the previous entry
// IS the origin — i.e. we arrived here by PUSH. Pushing the origin's URL afresh
// would land at the top of a 245-card listing, throwing away the scroll offset
// useScrollRestoration exists to keep (it only restores on POP), and would grow
// the history stack rather than unwinding it. When we can't know — a reload, a
// pasted link, an entry arrived at by Back — the href does the work.

import { useRef, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { readOrigin, type Origin } from '@/utils/origin'

export default function BackLink({
  fallback,
  className = '',
  'data-cy': dataCy,
}: {
  fallback: Origin
  className?: string
  'data-cy'?: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const origin = readOrigin(location.state) ?? fallback

  // How we arrived at the entry currently on screen. Keyed by location.key
  // because this component stays mounted across a param change (one detail page
  // to another), where the initial navigation type would be stale.
  const arrival = useRef({ key: location.key, pushed: navigationType === 'PUSH' })
  if (arrival.current.key !== location.key) {
    arrival.current = { key: location.key, pushed: navigationType === 'PUSH' }
  }

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Leave every click the browser has its own meaning for alone: new tab, new
    // window, download, and anything but the primary button.
    if (e.defaultPrevented) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!arrival.current.pushed) return
    e.preventDefault()
    navigate(-1)
  }

  return (
    <Link data-cy={dataCy} to={origin.path} onClick={onClick} className={className}>
      ← {origin.label}
    </Link>
  )
}
