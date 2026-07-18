// Persistent top navigation, two tiers:
//   Tier 1 (fixed height): wordmark + manufacturers link — the stable upper area.
//   Tier 2: gear-category tabs. Fixed-size tabs that WRAP onto more rows on
//           narrow/mobile widths (the header grows downward) rather than
//           scrolling horizontally.
//
// Contract (navigation.cy.ts + manufacturers.cy.ts):
//   [data-cy="nav-tab"]            one per data-backed gear type (exactly 8)
//     data-type="{slug}", data-active="true"|"false"
//   [data-cy="nav-tab-upcoming"]   coming-soon categories (not counted as tabs)
//   [data-cy="manufacturers-link"] data-active semantics like a tab
//   [data-cy="wordmark"]           "SlackData"
//
// A gear tab is active on its listing page and any nested route (detail/compare).

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ALL_GEAR_TYPES } from '@/config/gearTypes'

function isSectionActive(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

const tabClass = (active: boolean, muted = false) =>
  `whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
    active
      ? 'text-teal-primary border-teal-primary font-semibold'
      : muted
        ? 'text-gray-400 border-transparent hover:text-gray-600'
        : 'text-gray-500 border-transparent hover:text-gray-800'
  }`

export default function TopNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const mfrActive = isSectionActive(pathname, '/manufacturers')

  // Re-clicking the CURRENT gear tab keeps its query string (sort/search/filters
  // persist); clicking a DIFFERENT tab navigates bare, resetting to defaults. We
  // read window.location at click time — not the render-time `active` flag — so
  // the decision can't race React Router's navigation re-render (which flaked the
  // "resets on type switch" test on whichever tab re-rendered a beat late).
  const goToTab = (e: React.MouseEvent, slug: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    const base = `/${slug}`
    const onIt =
      window.location.pathname === base || window.location.pathname.startsWith(`${base}/`)
    navigate({ pathname: base, search: onIt ? window.location.search : '' })
  }

  return (
    <header
      data-cy="top-nav"
      className="bg-white border-b border-gray-200 sticky top-0 z-20"
    >
      {/* Tier 1 — fixed upper area */}
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <Link
          to="/webbings"
          data-cy="wordmark"
          className="font-bold text-gray-900 text-lg shrink-0"
        >
          SlackData
        </Link>
        <Link
          to="/manufacturers"
          data-cy="manufacturers-link"
          data-active={mfrActive ? 'true' : 'false'}
          className={tabClass(mfrActive)}
        >
          Manufacturers
        </Link>
      </div>

      {/* Tier 2 — category tabs, wrap on small screens */}
      <nav
        aria-label="Gear categories"
        className="max-w-7xl mx-auto px-6 flex flex-wrap items-center gap-x-1 border-t border-gray-100"
      >
        {ALL_GEAR_TYPES.map(({ slug, label, available }) => {
          const active = isSectionActive(pathname, `/${slug}`)
          return (
            <Link
              key={slug}
              to={`/${slug}`}
              onClick={e => goToTab(e, slug)}
              data-cy={available ? 'nav-tab' : 'nav-tab-upcoming'}
              data-type={slug}
              data-active={active ? 'true' : 'false'}
              className={tabClass(active, !available)}
              title={available ? undefined : 'Coming soon'}
            >
              {label}
              {!available && (
                <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-300">
                  soon
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
