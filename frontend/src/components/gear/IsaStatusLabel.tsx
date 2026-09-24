// The certification statement beside the ISA stamp — the webbing class letter
// when certified, the red "Not ISA Certified" pill when not. Two labels only,
// and both come from the ISA's approved-gear list (isa_certified.json), never
// from anything we compute about the gear ourselves.
//
//  1. Certified — the stamp itself is IsaApprovedBadge, drawn beside this by
//     the caller. On webbing this adds the class letter (`isa_class`: the
//     certificate's own letter, else the loader's strength-derived one). Other
//     types carry no letter, so nothing renders here.
//  2. Not certified, on a `certifiable` type (GearTypeMeta.certifiable) — the
//     solid "Not ISA Certified" pill. Anything we hold no ISA record for reads
//     this way: there is no third, "unknown" state.
//  3. Kits and tree protectors — nothing. The ISA does not certify either.
//
// Whether the MANUFACTURER says an item is not for highlining is a different
// fact, researched rather than computed, and lives on the detail page only
// (see GearDetailBody). The card no longer draws a strength-based warning.
//
// Letter colors are sampled from the ISA's own webbing-type graphic
// (slacklineinternational.org/.../webbing_type_graphic.png) so ours match the
// chart people already know: A+ dark green, A light green, B yellow, C orange.
// The letter is dark ink on every fill: white fails WCAG AA on all four
// (1.37–2.87), while #1F2937 clears AA on each (5.12–10.74).
//
// The red pill uses the Historic badge's colour scheme — `bg-red-600` with white
// text, the same Tailwind classes rather than a copied hex, so the two reds
// cannot drift apart. Same 10px type and padding as that badge too, so the
// two read as one family of labels. White on red-600 is ~4.8:1, which clears WCAG AA.

const CLASS_COLORS: Record<string, string> = {
  'A+': '#6AA84F',
  A: '#93C47D',
  B: '#FFD966',
  C: '#F6B26B',
}

const INK = '#1F2937'

export default function IsaStatusLabel({
  certified,
  isaClass,
  showNotCertified = false,
}: {
  certified: unknown
  isaClass: unknown
  // Draw the red pill when not certified. The card passes the type's
  // `certifiable`; the detail page leaves it off, because its certification
  // block already says "Not ISA Certified" in full.
  showNotCertified?: boolean
}) {
  if (certified === true) {
    const cls = typeof isaClass === 'string' && isaClass !== '' ? isaClass : null
    return cls === null ? null : classPill(cls)
  }

  if (!showNotCertified) return null

  return (
    <span
      data-cy="isa-not-certified-pill"
      title="Not ISA certified — not on the ISA's approved-gear list"
      className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
    >
      Not ISA Certified
    </span>
  )
}

function classPill(cls: string) {
  return (
    <span
      data-cy="isa-class-pill"
      data-isa-class={cls}
      title={`ISA Type ${cls}`}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold"
      // An unrecognised letter still renders, in neutral gray, rather than
      // vanishing — the certificate said it.
      style={{ backgroundColor: CLASS_COLORS[cls] ?? '#E5E7EB', color: INK }}
    >
      {cls}
    </span>
  )
}
