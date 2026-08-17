// The short-form safety disclaimer. Source text: SAFETY_AND_ACCURACY.md §A1.
//
// One component for both surfaces it appears on — the site footer and the gear
// detail page — so the wording can't drift apart. Only the presentation differs:
//
//   footer  — a muted line, always present, never dismissible
//   callout — an amber panel on the detail page, sitting with the spec numbers
//             someone might actually act on
//
// Deliberately NOT dismissible in either form. A notice you can close is a
// notice most readers have already closed by the time it matters.

import { Link } from 'react-router-dom'

export default function SafetyNotice({
  variant,
  className = '',
}: {
  variant: 'footer' | 'callout'
  className?: string
}) {
  const callout = variant === 'callout'

  return (
    <div
      data-cy={callout ? 'safety-notice-callout' : 'safety-notice-footer'}
      className={
        callout
          ? `rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`
          : `text-sm text-gray-600 ${className}`
      }
    >
      <strong className={callout ? 'font-semibold' : 'font-semibold text-gray-800'}>
        Check manufacturer specifications before you rig.
      </strong>{' '}
      SlackData is a community reference, not a safety authority.{' '}
      <Link
        data-cy="safety-notice-link"
        to="/safety"
        className={
          callout
            ? 'font-medium underline hover:no-underline'
            : 'font-medium text-teal-primary hover:underline'
        }
      >
        See more
      </Link>
    </div>
  )
}
