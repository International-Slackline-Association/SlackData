// Chart geometry — the arithmetic behind every SVG chart on the site, kept
// pure so it can be unit-tested (`tests/unit/chart.test.ts`) rather than
// eyeballed. Nothing here imports React, touches the DOM, or knows what a
// webbing is: the first consumer is the compare page's stretch chart
// (components/charts/LineChart.tsx + components/gear/StretchChart.tsx), and a
// second chart should extend this rather than fork it.

export interface Point {
  x: number
  y: number
}

export interface Series {
  id: string
  label: string
  color: string
  points: Point[]
}

// A resolved axis: the rounded domain actually drawn, plus the tick values on
// it. `lo`/`hi` are always tick multiples, so the axis ends on a labelled line
// instead of a bare stub.
export interface Scale {
  lo: number
  hi: number
  step: number
  ticks: number[]
}

// The "nice" step for a span: 1, 2 or 5 times a power of ten, chosen so the axis
// lands near `targetTicks` intervals. Anything else prints ticks like 3.7, 7.4,
// 11.1 — arithmetic nobody reads off a chart.
export function niceStep(span: number, targetTicks = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const rough = span / Math.max(1, targetTicks)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / magnitude
  const factor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return factor * magnitude
}

// Round [min, max] outward onto a nice grid and enumerate the ticks. Pass
// `zeroBased` for any magnitude axis (stretch %, weight, price): starting a
// magnitude axis anywhere but zero exaggerates every difference on it.
export function niceScale(
  min: number,
  max: number,
  { targetTicks = 5, zeroBased = false }: { targetTicks?: number; zeroBased?: boolean } = {},
): Scale {
  let lo = zeroBased ? Math.min(0, min) : min
  let hi = max
  // A flat series (one point, or every y equal) has no span to divide — give it
  // a symmetric one so the line lands mid-plot instead of on a division by zero.
  if (!(hi > lo)) {
    const pad = Math.abs(hi) > 0 ? Math.abs(hi) * 0.5 : 1
    hi = hi + pad
    if (!zeroBased) lo = lo - pad
  }
  const step = niceStep(hi - lo, targetTicks)
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  const ticks: number[] = []
  // Count the ticks rather than accumulating, so float dust cannot drop the
  // last one (0.1 + 0.2 + … never lands exactly on the bound).
  const n = Math.round((hi - lo) / step)
  for (let i = 0; i <= n; i++) ticks.push(round(lo + i * step))
  return { lo: round(lo), hi: round(hi), step, ticks }
}

// Kill binary float dust so ticks render as "0.3", never "0.30000000000000004".
function round(v: number): number {
  return Number(v.toPrecision(12))
}

// value → pixel, along an axis running from `px0` to `px1`. For y, pass them
// inverted (bottom pixel first) — SVG's origin is top-left and up is negative.
export function project(value: number, scale: Scale, px0: number, px1: number): number {
  const t = (value - scale.lo) / (scale.hi - scale.lo)
  return px0 + t * (px1 - px0)
}

// An SVG `points` list for a <polyline>. Straight segments between MEASURED
// points, never a spline: a smoothed curve invents readings between two loads
// that nobody measured, which on a stretch chart is a claim about the product.
export function polylinePoints(pts: { px: number; py: number }[]): string {
  return pts.map(p => `${fmt(p.px)},${fmt(p.py)}`).join(' ')
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100)
}

// The categorical palette, in fixed slot order — validated as a set against a
// white surface (worst adjacent pair: CVD ΔE 9.1, normal-vision ΔE 19.6). The
// order IS the safety mechanism, so never sort, shuffle or cycle it: a colour is
// assigned by column position and stays with that item, and slot 9+ falls back
// to gray rather than repeating a hue that already means something else on the
// plot. Eight is where a validated categorical scale ends; a chart with more
// series than this should be plotting fewer, not inventing hues (see
// MAX_PLOTTED_SERIES in StretchChart).
export const SERIES_COLORS = [
  '#2A78D6', // blue
  '#EB6834', // orange
  '#1BAF7A', // aqua
  '#EDA100', // yellow
  '#E87BA4', // magenta
  '#008300', // green
  '#4A3AA7', // violet
  '#E34948', // red
] as const
export const SERIES_FALLBACK = '#6B7280'

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? SERIES_FALLBACK
}

// The union of every x present across the series, ascending — the loads a
// crosshair can snap to, and the columns of the equivalent table view.
export function xUnion(series: Series[]): number[] {
  const xs = new Set<number>()
  for (const s of series) for (const p of s.points) xs.add(p.x)
  return [...xs].sort((a, b) => a - b)
}

// The x from `candidates` nearest a value, or null if there are none. Used to
// snap the hover crosshair onto a real measured load rather than tracking the
// pointer continuously across places where nothing was measured.
export function nearestX(candidates: number[], value: number): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const x of candidates) {
    const d = Math.abs(x - value)
    if (d < bestDist) {
      bestDist = d
      best = x
    }
  }
  return best
}

// The extent of every plotted point, or null when there is nothing to draw.
export function extent(series: Series[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const pts = series.flatMap(s => s.points)
  if (pts.length === 0) return null
  return {
    minX: Math.min(...pts.map(p => p.x)),
    maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxY: Math.max(...pts.map(p => p.y)),
  }
}

// ─── Direct-label placement ──────────────────────────────────────────────────
// A direct label belongs beside the point it names — parking it in a gutter
// with a leader back to the endpoint puts a horizontal stroke in the series
// colour on the plot, which on a webbing measured at a single load is
// indistinguishable from a flat curve. So labels stay next to their endpoint,
// and collisions are solved by SEARCHING for a free spot instead: a handful of
// candidate offsets around the anchor, scored against every plotted segment and
// every label already placed.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad && b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
  )
}

// Segment vs. axis-aligned box, by the slab method — exact, and cheap enough to
// run for every candidate against every segment on the plot.
export function segmentHitsBox(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  box: Box,
): boolean {
  let t0 = 0
  let t1 = 1
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0 // parallel to this slab: inside it, or nothing to clip
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  return (
    clip(-dx, p1.x - box.x) &&
    clip(dx, box.x + box.w - p1.x) &&
    clip(-dy, p1.y - box.y) &&
    clip(dy, box.y + box.h - p1.y)
  )
}

// Candidate offsets from the anchor, best first: to the right at the same
// height, then right-and-up / right-and-down, then the same to the LEFT (for a
// curve that ends at the right edge of the plot). `dx` is the gap from the
// anchor; a negative one places the box to the left of it.
const LABEL_OFFSETS: { dx: number; dy: number }[] = [
  { dx: 8, dy: 0 },
  { dx: 8, dy: -13 }, { dx: 8, dy: 13 },
  { dx: 8, dy: -24 }, { dx: 8, dy: 24 },
  { dx: -8, dy: 0 },
  { dx: -8, dy: -13 }, { dx: -8, dy: 13 },
  { dx: 8, dy: -36 }, { dx: 8, dy: 36 },
]

export interface LabelAnchor {
  x: number
  y: number
  w: number
  h: number
}

// Place each label near its anchor without covering a plotted line or another
// label. Anchors are placed in order (so slot 1 gets first pick, and the result
// is deterministic across renders), each taking the first candidate that
// collides with nothing; if every candidate collides, the least-bad one wins —
// a crowded chart should still print every name, just imperfectly.
export function placeLabels(
  anchors: LabelAnchor[],
  segments: [{ x: number; y: number }, { x: number; y: number }][],
  bounds: Box,
): Box[] {
  const placed: Box[] = []
  for (const a of anchors) {
    let best: Box | null = null
    let bestScore = Infinity
    for (const off of LABEL_OFFSETS) {
      const box: Box = {
        x: off.dx >= 0 ? a.x + off.dx : a.x + off.dx - a.w,
        y: a.y + off.dy - a.h / 2,
        w: a.w,
        h: a.h,
      }
      // Off the canvas is never acceptable, however crowded the plot is.
      if (
        box.x < bounds.x || box.x + box.w > bounds.x + bounds.w ||
        box.y < bounds.y || box.y + box.h > bounds.y + bounds.h
      ) continue
      let score = 0
      for (const [p1, p2] of segments) if (segmentHitsBox(p1, p2, box)) score += 2
      for (const other of placed) if (boxesOverlap(box, other, 2)) score += 3
      // A nudged placement is a last resort: prefer the label beside its point.
      score += Math.abs(off.dy) / 100
      if (score < bestScore) {
        bestScore = score
        best = box
      }
      if (score < 1) break
    }
    placed.push(best ?? { x: a.x + 8, y: a.y - a.h / 2, w: a.w, h: a.h })
  }
  return placed
}

// Every drawn segment of a set of series, in pixel space — what a label has to
// avoid. A single-point series contributes none, which is the whole reason it
// must not be given a leader line: it has no line.
export function segmentsOf(
  series: Series[],
  px: (v: number) => number,
  py: (v: number) => number,
): [{ x: number; y: number }, { x: number; y: number }][] {
  const out: [{ x: number; y: number }, { x: number; y: number }][] = []
  for (const s of series) {
    for (let i = 1; i < s.points.length; i++) {
      out.push([
        { x: px(s.points[i - 1].x), y: py(s.points[i - 1].y) },
        { x: px(s.points[i].x), y: py(s.points[i].y) },
      ])
    }
  }
  return out
}

