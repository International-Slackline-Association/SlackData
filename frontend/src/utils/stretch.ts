// Helpers for the webbing `stretch` field — a JSON string encoding a curve of
// {kn, percent} points, e.g. '[{"kn":0,"percent":0},{"kn":10,"percent":5.9}]'.
// See models/webbing.py and the Stretch widget in filters.cy.ts.

export interface StretchPoint {
  kn: number
  percent: number
}

export function parseStretch(json: unknown): StretchPoint[] {
  if (typeof json !== 'string' || json === '') return []
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
export function percentAtKn(json: unknown, kn: number): number | null {
  const match = parseStretch(json).find(p => p.kn === kn)
  return match ? match.percent : null
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
