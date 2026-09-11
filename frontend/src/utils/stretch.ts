// Helpers for the webbing `stretch` field — a JSON string encoding a curve of
// {kn, percent} points, e.g. '[{"kn":0,"percent":0},{"kn":10,"percent":5.9}]'.
// See models/webbing.py and the Stretch widget in filters.cy.ts.

export interface StretchPoint {
  kn: number
  percent: number
}

// Parsed curves, keyed by the raw JSON string. The catalogue holds 230 distinct
// curves and the strings are stable object fields, so this is bounded by the
// dataset, not by how long the page has been open.
//
// It exists because the table view asks the same question thousands of times per
// render: forty per-kN columns x 258 rows is ~10,000 parses of the same 230
// strings, every time anything re-renders the table.
//
// Callers must not mutate what comes back — it is now shared. The three here
// don't: knValues maps, percentAt* find, displayPoints copies before sorting.
const parsed = new Map<string, StretchPoint[]>()

export function parseStretch(json: unknown): StretchPoint[] {
  if (typeof json !== 'string' || json === '') return []
  const hit = parsed.get(json)
  if (hit) return hit
  const points = parseUncached(json)
  parsed.set(json, points)
  return points
}

function parseUncached(json: string): StretchPoint[] {
  try {
    const pts = JSON.parse(json)
    if (!Array.isArray(pts)) return []
    return pts.filter(
      (p): p is StretchPoint =>
        p && typeof p === 'object' && typeof p.kn === 'number' && typeof p.percent === 'number',
    )
  } catch {
    return []
  }
}

// Distinct kN values present in one item's curve.
export function knValues(json: unknown): number[] {
  return parseStretch(json).map(p => p.kn)
}

// The stretch % at an exact kN, or null if the curve has no point there.
// Exact, deliberately: this drives the listing's kN filter pills, and a pill
// that says "10 kN" must select the webbings that were MEASURED at 10 kN.
export function percentAtKn(json: unknown, kn: number): number | null {
  const match = parseStretch(json).find(p => p.kn === kn)
  return match ? match.percent : null
}

// The stretch % for an integer-kN COLUMN in the table view — and for sorting on
// one, which is why the two must share this function: a column that displays a
// rounded reading and ranks on an exact one is a table that lies.
//
// An exact reading always wins. Failing that, a reading that rounds to this kN
// counts: 14 of the 230 curves we hold were recorded at a non-integer load
// (2.5, 5.34, 6.67, 13.3 …), and without this they would appear in no column at
// all. Nearest wins when a curve somehow has two in the same bucket. 0 kN never
// participates — every curve reads 0% there.
export function percentAtRoundedKn(json: unknown, kn: number): number | null {
  const pts = parseStretch(json)
  const exact = pts.find(p => p.kn === kn)
  if (exact) return exact.percent
  let best: StretchPoint | null = null
  for (const p of pts) {
    if (p.kn === 0 || Math.round(p.kn) !== kn) continue
    if (!best || Math.abs(p.kn - kn) < Math.abs(best.kn - kn)) best = p
  }
  return best ? best.percent : null
}

// The points one item's curve should DISPLAY, ascending by load. 0 kN is dropped
// (every curve reads 0% there — a useless column), unless it's all there is, so
// the spec row still renders for any webbing with non-null `stretch`. Only real
// measured points are returned — nothing is interpolated or padded.
export function displayPoints(json: unknown): StretchPoint[] {
  const all = parseStretch(json)
  const pts = all.filter(p => p.kn !== 0)
  return [...(pts.length ? pts : all)].sort((a, b) => a.kn - b.kn)
}

// Across a set of webbings: the sorted union of every kN present (for the pills)
// and the kN appearing in the most curves (the default reference).
export function knFrequency(items: { stretch?: unknown }[]): Map<number, number> {
  const freq = new Map<number, number>()
  for (const item of items) {
    for (const kn of new Set(knValues(item.stretch))) {
      freq.set(kn, (freq.get(kn) ?? 0) + 1)
    }
  }
  return freq
}

export function allKnValues(items: { stretch?: unknown }[]): number[] {
  return [...knFrequency(items).keys()].sort((a, b) => a - b)
}

// The reference kN points offered in the UI (filter pills + stretch sort).
// Rules: 0 kN is dropped (every curve reads 0% there — a useless data point);
// only integer kN values qualify; and we keep the TOP `n` by how many webbings
// carry a data point at that kN. Ties in count break toward the smaller kN so
// the set is deterministic. Each entry carries that webbing `count`.
export function topKnPoints(
  items: { stretch?: unknown }[],
  n = 5,
): { kn: number; count: number }[] {
  return [...knFrequency(items).entries()]
    .filter(([kn]) => kn !== 0 && Number.isInteger(kn))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([kn, count]) => ({ kn, count }))
}

// The default reference kN: the most common among the top points (or null if
// there are none). Kept in sync with topKnPoints so the default is always a
// point the UI actually renders.
export function mostCommonKn(items: { stretch?: unknown }[]): number | null {
  return topKnPoints(items, 1)[0]?.kn ?? null
}
