// The ISA highline class as a colored bubble, shown beside the webbing name.
//
// Two things can put a bubble on a webbing, and only these two:
//
//  1. It is ISA certified — then the bubble is its granted class (A+/A/B/C).
//     A+/A/B/C is an ISA grant, so an uncertified webbing never shows one, even
//     though the backend computes a class for every webbing from fibers +
//     strength: a class ISA never granted, drawn in ISA's own colors, would
//     read as certification.
//  2. Its breaking strength is under HIGHLINE_MIN_KN — then the bubble is the
//     gray "Not for Highline", certified or not. That is not a withheld grant
//     but a fact about the webbing: below the Type C floor no fiber is
//     highline-rated, so the warning is worth carrying on every such item.
//
// Everything else shows nothing — including an uncertified webbing that is
// "Not for Highline" at 22 kN or more (a 25 kN polyester, say, which misses
// Type C only because ISA does not certify PES that low). Unknown strength is
// not "under 22": no data, no claim.
//
// Both gates live here rather than at the call sites so the card and the detail
// page cannot drift apart on them.
//
// Colors are sampled from the ISA's own webbing-type graphic
// (slacklineinternational.org/.../webbing_type_graphic.png) so ours match the
// chart people already know: A+ dark green, A light green, B yellow, C orange.
// "Not for Highline" isn't on that chart — it gets a neutral gray.
//
// The letter is dark ink on every fill: white text fails WCAG AA on all four
// ISA colors (1.37–2.87), while #1F2937 clears AA on each (5.12–10.74). The
// letter itself carries the meaning, so identity is never color-alone, and the
// title attribute spells it out for screen readers.

const CLASS_COLORS: Record<string, string> = {
  'A+': '#6AA84F',
  A: '#93C47D',
  B: '#FFD966',
  C: '#F6B26B',
  'Not for Highline': '#E5E7EB',
}

const INK = '#1F2937'

const NOT_FOR_HIGHLINE = 'Not for Highline'

// The Type C floor in _classify_fiber() (slack_data/models/webbing.py): under
// this, no fiber earns any ISA class, so the webbing is not for highline no
// matter what it's woven from.
const HIGHLINE_MIN_KN = 22

export default function ClassificationBubble({
  value,
  certified,
  breakingStrength,
}: {
  value: unknown
  certified: unknown
  breakingStrength: unknown
}) {
  if (value == null || value === '') return null
  const cls = String(value)

  // null/undefined/non-numeric strength → not below the floor; we make no claim.
  const kn = typeof breakingStrength === 'number' ? breakingStrength : null
  const belowFloor = kn !== null && kn < HIGHLINE_MIN_KN
  const isNotForHighline = cls === NOT_FOR_HIGHLINE

  if (certified !== true && !(isNotForHighline && belowFloor)) return null

  const bg = CLASS_COLORS[cls] ?? CLASS_COLORS[NOT_FOR_HIGHLINE]

  // A+/A/B/C are short enough to read as a round bubble; the long "Not for
  // Highline" stays a pill so it isn't truncated into nonsense.
  const isLetter = cls.length <= 2

  return (
    <span
      data-cy="classification-pill"
      data-classification={cls}
      // An uncertified sub-22 kN bubble is a strength warning, not an ISA type —
      // don't put "ISA Type" in front of it.
      title={
        isNotForHighline
          ? `Not for highline — breaking strength under ${HIGHLINE_MIN_KN} kN`
          : `ISA Type ${cls}`
      }
      className={
        isLetter
          ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold'
          : 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'
      }
      style={{ backgroundColor: bg, color: INK }}
    >
      {cls}
    </span>
  )
}
