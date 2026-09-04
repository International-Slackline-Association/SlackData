// A multi-series line chart, as inline SVG. Gear-agnostic on purpose: it takes
// `{ id, label, color, points }[]` and two axis titles, and knows nothing about
// webbings. The compare page's stretch chart is the first caller
// (components/gear/StretchChart.tsx); a later chart should extend this rather
// than fork it. The geometry lives in utils/chart.ts, where it is unit-tested.
//
// Rules baked in here, from DESIGN.md § Compare View:
//   - straight segments between MEASURED points — never a spline, which would
//     invent readings nobody took
//   - a marker on every measured point, ringed in the surface colour so
//     overlapping points stay countable
//   - a magnitude y axis starts at 0 (`zeroBasedY`), so nothing is exaggerated
//   - identity is never colour alone: every series is direct-labelled at the end
//     of its line (the caller also draws a legend)
//   - the plot scales with its container via viewBox — it never scrolls sideways

import { useMemo, useState } from 'react'
import {
  extent,
  nearestX,
  niceScale,
  placeLabels,
  polylinePoints,
  project,
  segmentsOf,
  xUnion,
  type Series,
} from '@/utils/chart'

// The SVG's internal coordinate space. The element itself is width:100% — these
// are aspect ratio and relative type size, not pixels on screen.
const W = 760
const H = 420
const PAD = { top: 16, right: 116, bottom: 44, left: 52 }
// Direct-label metrics, in viewBox units. Width is estimated from the character
// count (~0.55em at 12 units) because SVG text cannot be measured before it is
// laid out, and the estimate only has to be good enough to keep the collision
// search honest — it errs wide.
const LABEL_H = 13
const LABEL_CHAR_W = 6.3
const LABEL_MAX_CHARS = 16

export interface LineChartProps {
  series: Series[]
  xTitle: string
  yTitle: string
  formatX?: (v: number) => string
  formatY?: (v: number) => string
  // Tooltip heading for a snapped x — defaults to `formatX`.
  formatCursor?: (v: number) => string
  zeroBasedY?: boolean
  ariaLabel?: string
  // Prefix for this chart's `data-cy` hooks (`<prefix>-svg`, `-line`, `-point`,
  // `-label`, `-tooltip`, `-x-tick`, `-y-tick`, `-crosshair`). The component is
  // generic; the test contract belongs to the surface that uses it.
  cy?: string
}

export default function LineChart({
  series,
  xTitle,
  yTitle,
  formatX = String,
  formatY = String,
  formatCursor,
  zeroBasedY = true,
  ariaLabel,
  cy = 'chart',
}: LineChartProps) {
  const [cursor, setCursor] = useState<number | null>(null)

  const geom = useMemo(() => {
    const ext = extent(series)
    if (!ext) return null
    const x = niceScale(ext.minX, ext.maxX, { targetTicks: 6 })
    const y = niceScale(ext.minY, ext.maxY, { targetTicks: 5, zeroBased: zeroBasedY })
    const px = (v: number) => project(v, x, PAD.left, W - PAD.right)
    const py = (v: number) => project(v, y, H - PAD.bottom, PAD.top)
    // Labels sit BESIDE their own last point — near the data they name, with
    // nothing drawn between (a leader stroke in the series colour reads as a
    // flat curve, fatally so for a webbing measured at a single load). The
    // collisions are solved by searching instead: each label takes the nearest
    // candidate slot that covers neither a plotted line nor another label.
    const segments = segmentsOf(series, px, py)
    const anchors = series
      .map(s => ({ s, last: s.points[s.points.length - 1] }))
      .filter(a => a.last != null)
      .map(({ s, last }) => ({
        x: px(last.x),
        y: py(last.y),
        w: Math.min(s.label.length, LABEL_MAX_CHARS) * LABEL_CHAR_W,
        h: LABEL_H,
      }))
    const labelBoxes = placeLabels(anchors, segments, {
      x: PAD.left, y: PAD.top - 4, w: W - PAD.left - 4, h: H - PAD.bottom - PAD.top + 8,
    })
    return { x, y, px, py, loads: xUnion(series), labelBoxes }
  }, [series, zeroBasedY])

  if (!geom) return null
  const { x, y, px, py, loads, labelBoxes } = geom

  // Snap the crosshair onto a load something was actually measured at, rather
  // than tracking the pointer across empty space between readings.
  const snap = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect()
    const vx = ((clientX - box.left) / box.width) * W
    const value = x.lo + ((vx - PAD.left) / (W - PAD.right - PAD.left)) * (x.hi - x.lo)
    setCursor(nearestX(loads, value))
  }

  const cursorRows = cursor == null
    ? []
    : series
        .map(s => ({ s, pt: s.points.find(p => p.x === cursor) }))
        .filter((r): r is { s: Series; pt: { x: number; y: number } } => r.pt != null)

  return (
    <div className="relative">
      <svg
        data-cy={`${cy}-svg`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel ?? `${yTitle} against ${xTitle}`}
        onMouseMove={e => snap(e.clientX, e.currentTarget)}
        onMouseLeave={() => setCursor(null)}
      >
        {/* Grid + axis labels. Recessive: the data is the ink here. */}
        {y.ticks.map(t => (
          <g key={`y${t}`}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={py(t)} y2={py(t)}
              stroke="#E5E7EB" strokeWidth={1}
            />
            <text
              data-cy={`${cy}-y-tick`}
              x={PAD.left - 8} y={py(t)} dy="0.32em"
              textAnchor="end" fontSize={12} fill="#6B7280"
            >
              {formatY(t)}
            </text>
          </g>
        ))}
        {x.ticks.map(t => (
          <text
            key={`x${t}`}
            data-cy={`${cy}-x-tick`}
            x={px(t)} y={H - PAD.bottom + 18}
            textAnchor="middle" fontSize={12} fill="#6B7280"
          >
            {formatX(t)}
          </text>
        ))}

        <text x={(PAD.left + W - PAD.right) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="#6B7280">
          {xTitle}
        </text>
        <text
          transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`}
          textAnchor="middle" fontSize={12} fill="#6B7280"
        >
          {yTitle}
        </text>

        {cursor != null && (
          <line
            data-cy={`${cy}-crosshair`}
            x1={px(cursor)} x2={px(cursor)} y1={PAD.top} y2={H - PAD.bottom}
            stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3"
          />
        )}

        {series.map((s, i) => {
          const pts = s.points.map(p => ({ px: px(p.x), py: py(p.y) }))
          const last = s.points[s.points.length - 1]
          const box = labelBoxes[i]
          return (
            <g key={s.id}>
              <polyline
                data-cy={`${cy}-line`}
                data-id={s.id}
                points={polylinePoints(pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map(p => (
                <circle
                  key={p.x}
                  data-cy={`${cy}-point`}
                  data-id={s.id}
                  data-kn={p.x}
                  cx={px(p.x)} cy={py(p.y)} r={4.5}
                  fill={s.color} stroke="#FFFFFF" strokeWidth={2}
                  onMouseOver={() => setCursor(p.x)}
                >
                  <title>{`${s.label} — ${formatY(p.y)} at ${formatX(p.x)}`}</title>
                </circle>
              ))}
              {/* Direct label: two of the four palette hues sit below 3:1 on
                  white, so the line's identity can never rest on colour. Hidden
                  on a phone, where the legend carries it instead. */}
              {/* The white halo is the backstop: on a plot too crowded for any
                  clean slot the search degrades to "least bad", and legibility
                  must not degrade with it. */}
              {last && box && (
                <text
                  data-cy={`${cy}-label`}
                  data-id={s.id}
                  className="hidden sm:block"
                  x={box.x} y={box.y + box.h / 2} dy="0.32em"
                  fontSize={12} fill="#1A1A1A"
                  paintOrder="stroke"
                  stroke="#FFFFFF" strokeWidth={3} strokeLinejoin="round"
                >
                  {truncate(s.label)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* The tooltip is HTML, not SVG — it needs wrapping text and the same type
          scale as the rest of the page. Positioned as a fraction of the plot so
          it tracks the crosshair at any rendered width. */}
      {cursor != null && cursorRows.length > 0 && (
        <div
          data-cy={`${cy}-tooltip`}
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(px(cursor) / W) * 100}%`,
            transform: px(cursor) > W / 2 ? 'translateX(-105%)' : 'translateX(5%)',
          }}
        >
          <div className="mb-1 font-semibold text-gray-900">{(formatCursor ?? formatX)(cursor)}</div>
          {cursorRows.map(({ s, pt }) => (
            <div key={s.id} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="max-w-[10rem] truncate text-gray-600">{s.label}</span>
              <span className="ml-auto pl-2 font-medium tabular-nums text-gray-900">{formatY(pt.y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A long product name would run off the right edge of the gutter (~104 viewBox
// units at 12px); the legend carries the full name.
function truncate(label: string, max = 16): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}
