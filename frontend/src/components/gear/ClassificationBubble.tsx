// The ISA highline class as a colored bubble, shown beside the webbing name.
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

export default function ClassificationBubble({ value }: { value: unknown }) {
  if (value == null || value === '') return null
  const cls = String(value)
  const bg = CLASS_COLORS[cls] ?? CLASS_COLORS['Not for Highline']

  // A+/A/B/C are short enough to read as a round bubble; the long "Not for
  // Highline" stays a pill so it isn't truncated into nonsense.
  const isLetter = cls.length <= 2

  return (
    <span
      data-cy="classification-pill"
      data-classification={cls}
      title={`ISA Type ${cls}`}
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
