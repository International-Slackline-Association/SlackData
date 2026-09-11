// Where the reader came from — the thing a back link needs and a route param
// cannot hold.
//
// A gear detail page is reached from at least four places: a filtered listing, a
// manufacturer's inventory, the compare table, or a bare link someone was sent.
// Its back link used to be `/${slug}` in every one of those cases, so opening a
// webbing from Balance Community's page and pressing it landed you in the
// unfiltered webbing listing — the filters, the sort and the manufacturer all
// gone. The URL of the page you were on is the only thing that says otherwise,
// so links to a detail page carry it in `location.state`.
//
// history.state, not sessionStorage or a module variable: it belongs to ONE
// history entry, which is exactly the lifetime wanted. It survives a reload and
// back/forward, and two tabs on two different detail pages can't overwrite each
// other's idea of "back".
//
// Everything here is deliberately paranoid about what comes out of that state:
// it is attacker-influenceable in principle (a link can push arbitrary state),
// and it ends up as an href.

export interface Origin {
  /** Path + query of the page linked FROM, e.g. "/webbings?q=core&sort=name-desc". */
  path: string
  /** What to call it in the back link, e.g. "Webbings", "Balance Community". */
  label: string
}

/** True for a same-site absolute path we're willing to turn into an href.
 *
 *  "/webbings?q=a" yes; "//evil.example" and "/\evil.example" no — browsers read
 *  both of those as protocol-relative URLs, so they would leave the site. */
export function isSafeOriginPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 2000) return false
  if (path[0] !== '/') return false
  if (path[1] === '/' || path[1] === '\\') return false
  return true
}

/** The `state` to hang on a <Link>, or undefined when there is nothing to say.
 *  Undefined rather than null so react-router leaves the entry's state alone. */
export function originState(origin: Origin | null | undefined): { origin: Origin } | undefined {
  if (!origin || !origin.label || !isSafeOriginPath(origin.path)) return undefined
  return { origin: { path: origin.path, label: origin.label } }
}

/** Read an Origin back out of `location.state`, or null if there isn't a valid
 *  one. Every caller has a fallback; a malformed origin uses it. */
export function readOrigin(state: unknown): Origin | null {
  if (typeof state !== 'object' || state === null) return null
  const raw = (state as { origin?: unknown }).origin
  if (typeof raw !== 'object' || raw === null) return null
  const { path, label } = raw as { path?: unknown; label?: unknown }
  if (!isSafeOriginPath(path)) return null
  if (typeof label !== 'string' || label === '') return null
  return { path, label }
}
