// The slider domain behind every numeric min/max filter (and the webbing
// stretch %). Lives apart from RangeSlider so both the sidebar's range groups
// and the stretch widget derive their domain the same way — see RangeSlider.tsx
// for the control this feeds.

/**
 * The [lo, hi] domain a set of values should be sliderable over, plus the step.
 *
 * A native range input can only land on `min + n * step`, so a domain whose max
 * is off that grid has a top end no drag can reach: the thumb parks a sliver
 * short of the track, and because it never equals the domain max, the callers'
 * "thumb at its bound means no constraint" test never fires — the max thumb
 * looks maxed while still excluding the priciest item. Authored fields (widths,
 * weights, kN) already land on the grid; a converted price never does. So both
 * bounds are snapped onto it.
 *
 * Snapping to the *nearest* grid point, not outward: the bounds then read as the
 * cheapest and priciest items actually read on their cards (a 0.5753 item is
 * $0.58 in both places). A bound understated by less than one step hides
 * nothing, because a thumb parked at a bound imposes no constraint at all.
 *
 * `step` defaults to 1 for integer-only data, else 0.5 (no 0.1 noise). Callers
 * that know their field's real granularity pass it — money steps by the cent.
 */
export function rangeDomain(
  values: number[],
  step?: number,
): { lo: number; hi: number; step: number } {
  // No data yet (still loading) → a zero-width domain so consumers can tell it
  // isn't ready.
  if (!values.length) return { lo: 0, hi: 0, step: step ?? 1 }
  const s = step ?? (values.every(Number.isInteger) ? 1 : 0.5)
  const lo = snap(Math.min(...values), s)
  const hi = snap(Math.max(...values), s)
  // All values equal → a one-step-wide domain rather than a dead slider.
  return { lo, hi: hi > lo ? hi : lo + s, step: s }
}

// Nearest grid point, divided rather than multiplied back: `58 / 100` is the
// double nearest 0.58, while `58 * 0.01` is not — and that dust would anchor
// the whole grid, so every value a drag wrote to the URL would carry it.
function snap(v: number, step: number): number {
  const perUnit = 1 / step
  return Math.round(v * perUnit) / perUnit
}
