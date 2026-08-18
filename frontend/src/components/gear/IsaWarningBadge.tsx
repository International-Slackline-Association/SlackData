// ISA gear warning, as a bubble on the card and as the palette behind the
// detail page's banner. DESIGN.md § ISA Warnings.
//
// The ISA publishes recalls and cautions on specific products; where an entry
// maps onto gear we hold, the row carries an `isa_warning` status. Five types
// have the field (webbing, weblock, roller, leashring, grip) — the rest never
// render any of this.
//
// Three rules live here rather than at the call sites, so the card and the
// detail page cannot drift apart on them:
//
//  1. `null` and the `No Warning` enum member both mean "nothing to show".
//     "No Warning" is a valid member of ISAWarning, and rendering it would put
//     an empty bubble on ~450 cards.
//  2. Severity picks the colour, and only from this table — red recall, amber
//     warning, neutral notice. A Notice is shown rather than dropped (hiding
//     safety information to keep the grid calm is the wrong trade) but is
//     deliberately the quietest thing in the stack.
//  3. The status WORD is always rendered. Severity is never carried by colour
//     alone, which also means the badge survives a monochrome print and a
//     colour-blind reader.
//
// Ink is #1F2937 on the amber and gray fills for the same reason
// ClassificationBubble uses it: white text fails WCAG AA on both.

const INK = '#1F2937'

export interface IsaWarningStyle {
  /** Card bubble: solid severity fill. */
  bubbleBg: string
  bubbleFg: string
  /** Detail banner: tinted ground, matching border, dark readable text. */
  bannerBg: string
  bannerBorder: string
  bannerFg: string
}

export const ISA_WARNING_STYLES: Record<string, IsaWarningStyle> = {
  Recall: {
    bubbleBg: '#DC2626', // same red as the Legacy pill — they never share a corner
    bubbleFg: '#FFFFFF',
    bannerBg: '#FEF2F2',
    bannerBorder: '#FCA5A5',
    bannerFg: '#7F1D1D',
  },
  Warning: {
    bubbleBg: '#FBBF24',
    bubbleFg: INK,
    bannerBg: '#FFFBEB',
    bannerBorder: '#FCD34D',
    bannerFg: '#78350F',
  },
  Notice: {
    bubbleBg: '#E5E7EB',
    bubbleFg: INK,
    bannerBg: '#F9FAFB',
    bannerBorder: '#D1D5DB',
    bannerFg: '#374151',
  },
}

/** The status word, or null when there is nothing to show. */
export function isaWarningStatus(value: unknown): string | null {
  if (value == null || value === '') return null
  const status = String(value)
  return status in ISA_WARNING_STYLES ? status : null
}

export default function IsaWarningBadge({
  value,
  className = '',
}: {
  value: unknown
  className?: string
}) {
  const status = isaWarningStatus(value)
  if (status === null) return null
  const style = ISA_WARNING_STYLES[status]

  return (
    <span
      data-cy="isa-warning-badge"
      data-isa-warning={status}
      title={`ISA ${status.toLowerCase()} — see the ISA gear warnings database`}
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${className}`}
      style={{ backgroundColor: style.bubbleBg, color: style.bubbleFg }}
    >
      {status}
    </span>
  )
}
