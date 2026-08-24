// The two entry points into the submission dialog. See DESIGN.md § Entry points.
//
// One component with a `variant`, for the same reason SafetyNotice has one: the
// dialog it opens and the state it carries are identical, and only the framing
// differs. Deliberately NOT placed on the gear card — the card is a scanning
// surface, and a report button there would compete with Compare and invite
// reports from readers who haven't looked at the specs yet.

import { useState } from 'react'
import SubmissionDialog from './SubmissionDialog'
import { isCaptchaRequired } from './TurnstileWidget'
import type { AnyItem } from '@/utils/format'

export default function SuggestButton({
  gearType,
  variant,
  item,
  className = '',
}: {
  gearType: string
  /** `correction` sits under a spec sheet; `new-item` sits in the listing toolbar. */
  variant: 'correction' | 'new-item'
  item?: AnyItem
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const correction = variant === 'correction'

  // Two gates, and the second one matters more than it looks.
  //
  // 1. The feature flag. Gating here rather than at each call site keeps the two
  //    pages that mount this component free of feature-flag plumbing.
  // 2. In a production build, a captcha site key must also be present. The
  //    server requires a Turnstile token whenever it is hosted, so a build with
  //    the flag on and no site key renders a form in which EVERY submission is
  //    rejected with a 400 — and it would look like the feature is broken
  //    rather than misconfigured. Staying dark is the better failure: nothing
  //    is offered that cannot work. See infra/README.md § Turning Phase 2 on.
  if (import.meta.env.VITE_ENABLE_SUBMISSIONS !== 'true') return null
  if (import.meta.env.PROD && !isCaptchaRequired()) {
    console.warn(
      '[SlackData] submissions are enabled but VITE_TURNSTILE_SITE_KEY is unset;' +
        ' the suggestion form stays hidden because the API would reject every submission.',
    )
    return null
  }

  return (
    <>
      <button
        type="button"
        data-cy={correction ? 'suggest-correction' : 'suggest-new-item'}
        onClick={() => setOpen(true)}
        // `cursor-pointer` is explicit because Tailwind v4 dropped the browser
        // default on <button> — without it these read as non-interactive.
        // DESIGN.md § Shared UI Conventions: all interactive elements get it.
        className={
          correction
            ? `cursor-pointer rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-teal-600 hover:text-teal-700 ${className}`
            : `cursor-pointer text-sm font-medium text-teal-700 underline-offset-2 hover:text-teal-800 hover:underline ${className}`
        }
      >
        {correction ? 'Suggest a correction' : 'Missing something?'}
      </button>

      {open && (
        <SubmissionDialog
          gearType={gearType}
          kind={correction ? 'correction' : 'new_item'}
          item={item}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
