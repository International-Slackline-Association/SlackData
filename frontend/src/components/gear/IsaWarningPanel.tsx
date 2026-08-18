// The ISA warning(s) against one gear item, in full — DESIGN.md § ISA Warnings.
//
// The card bubble says a warning exists; this says what it is. An entry carries
// what failed, what the ISA says to do about it, when it was published, whether
// the product is still in production, and where it came from — and all of that
// is the point. "This product appears in the ISA gear warnings database" tells a
// rigger nothing they can act on.
//
// An item can carry several warnings (Slack-Inov's Slackibloc 4 has three), so
// this renders a list, newest first. Severity colours the whole strip, from the
// same table as the card bubble.
//
// Two honesty rules are enforced here:
//
//  1. **A less-than-certain match is labelled.** Matches were adjudicated by
//     hand against the ISA's own product naming, and `likely` / `partial` /
//     `ambiguous` ones are shown with the ISA's wording of the product, so the
//     reader can check whether it really is the thing in their hands. Silently
//     presenting an ambiguous match as fact is the failure mode that matters
//     when the subject is a recall.
//  2. **The ISA is the source of truth, we are a mirror.** Every entry links out
//     to the source the ISA published, and the panel never paraphrases the
//     description or the solution — they are rendered verbatim.

import type { IsaGearWarning } from '@/types'
import { ISA_WARNING_STYLES, isaWarningStatus } from './IsaWarningBadge'

// "2020-09-01" → "1 September 2020". Falls back to the raw source string when
// the date could not be parsed at load time (the source has one typo'd value).
function formatDate(warning: IsaGearWarning): string | null {
  if (warning.date_iso) {
    const [y, m, d] = warning.date_iso.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    }
  }
  return warning.date
}

// Only `exact` needs no caveat. Everything else gets the ISA's own naming shown
// alongside, so the reader can confirm it against their own gear.
const HEDGED = new Set(['likely', 'partial', 'ambiguous'])

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function WarningEntry({ warning }: { warning: IsaGearWarning }) {
  const status = isaWarningStatus(warning.status)
  if (status === null) return null
  const style = ISA_WARNING_STYLES[status]
  const date = formatDate(warning)
  const hedged = warning.confidence != null && HEDGED.has(warning.confidence)

  return (
    <div
      data-cy="isa-warning-entry"
      data-isa-warning={status}
      data-source-id={warning.source_id}
      className="rounded-lg border px-4 py-3.5 text-sm"
      style={{
        backgroundColor: style.bannerBg,
        borderColor: style.bannerBorder,
        color: style.bannerFg,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span aria-hidden>⚠</span>
        <span data-cy="isa-warning-status" className="font-bold uppercase tracking-wide">
          ISA {status}
        </span>
        {date && (
          <span data-cy="isa-warning-date" className="text-xs opacity-75">
            {date}
          </span>
        )}
        {warning.in_production === false && (
          <span
            data-cy="isa-warning-production"
            className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-75"
          >
            No longer in production
          </span>
        )}
      </div>

      {warning.description && (
        <p data-cy="isa-warning-description" className="mt-2 leading-relaxed">
          {warning.description}
        </p>
      )}

      {warning.solution && (
        <p data-cy="isa-warning-solution" className="mt-2 leading-relaxed">
          <span className="font-semibold">What to do: </span>
          {warning.solution}
        </p>
      )}

      {/* The ISA's own naming, when our match to it isn't certain. */}
      {hedged && (warning.manufacturer || warning.model) && (
        <p data-cy="isa-warning-hedge" className="mt-2 text-xs opacity-75">
          The ISA lists this warning against{' '}
          <span className="font-medium">
            {[warning.manufacturer, warning.model].filter(Boolean).join(' ')}
          </span>
          {warning.product_type ? ` (${warning.product_type})` : ''} — check it against your own
          gear before relying on the match.
        </p>
      )}

      {warning.links && warning.links.length > 0 && (
        <div data-cy="isa-warning-links" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {warning.links.map(link => (
            <a
              key={link}
              data-cy="isa-warning-source"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              Source: {hostOf(link)} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function IsaWarningPanel({
  status,
  warnings,
}: {
  /** The gear row's own severity — the fallback when details haven't loaded. */
  status: string
  warnings: IsaGearWarning[]
}) {
  const style = ISA_WARNING_STYLES[status]

  return (
    <div data-cy="isa-warning-banner" data-isa-warning={status} className="mt-5 flex flex-col gap-2">
      {warnings.length > 0 ? (
        warnings.map(warning => <WarningEntry key={warning.id} warning={warning} />)
      ) : (
        // Details not loaded (or the entry didn't survive verification). The
        // severity is still known from the gear row, so say that much rather
        // than dropping a safety warning off the page.
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: style.bannerBg,
            borderColor: style.bannerBorder,
            color: style.bannerFg,
          }}
        >
          <span aria-hidden>⚠ </span>
          <span data-cy="isa-warning-status" className="font-bold uppercase tracking-wide">
            ISA {status}
          </span>
        </div>
      )}
    </div>
  )
}
