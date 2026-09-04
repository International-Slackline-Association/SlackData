// Webbing stretch on the compare page, as a chart — DESIGN.md § Compare View →
// "Stretch is a chart, not a table". A curve is a shape, and four columns of
// "5.9% @ 10 kN · 7.1% @ 15 kN · …" is exactly the reading this view exists to
// spare people. On the DETAIL page the curve stays a table (one item, and the
// numbers are the answer there) — see SpecTable.
//
// This is the webbing adapter over the generic chart: compared items → series,
// plus the legend, the note naming any pick with no curve, and the Chart|Table
// toggle. The plotting itself is components/charts/LineChart.tsx.

import { useMemo, useState } from 'react'
import LineChart from '@/components/charts/LineChart'
import { SERIES_COLORS, seriesColor, xUnion, type Series } from '@/utils/chart'
import { displayPoints } from '@/utils/stretch'
import type { AnyItem } from '@/utils/format'

// One curve is a detail-page question, not a comparison; the chart earns its
// space at two.
export const STRETCH_CHART_MIN_SERIES = 2

// The default window. Slackline working loads live in 1–20 kN, and that is the
// range people compare on; a curve measured out to 37 kN otherwise squashes the
// interesting part of every line into the first half of the plot. Curves that
// run past it are reachable through the expand control, never lost.
export const DEFAULT_MAX_KN = 20

// Up to ten items can be compared, but eight is where a validated categorical
// colour scale ends — a ninth line would either repeat a hue that already means
// something else or arrive as an indistinguishable gray. So the plot draws the
// first eight curves in column order and names the rest, which the table view
// shows in full. Ten overlapping lines is not a readable chart anyway.
export const MAX_PLOTTED_SERIES = SERIES_COLORS.length

export function stretchSeries(items: AnyItem[], maxKn = Infinity): Series[] {
  return items
    .map((item, i) => ({
      item,
      // Colour is assigned by COLUMN position, not by position among the
      // plotted series, so narrowing the window — or removing an unplotted
      // pick — never repaints the survivors.
      color: seriesColor(i),
      points: displayPoints(item.stretch)
        .filter(p => p.kn <= maxKn)
        .map(p => ({ x: p.kn, y: p.percent })),
    }))
    .filter(({ points }) => points.length > 0)
    .map(({ item, color, points }) => ({
      id: String(item.id),
      label: String(item.name),
      color,
      points,
    }))
}

const kn = (v: number) => `${v} kN`
const pct = (v: number) => `${v}%`

export default function StretchChart({ items }: { items: AnyItem[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  // null = follow the default rule below; a click pins it either way.
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null)

  // Every curve there is, before either limit is applied.
  const allCurves = useMemo(() => stretchSeries(items), [items])
  const inWindow = useMemo(() => stretchSeries(items, DEFAULT_MAX_KN), [items])

  // Clamping must never turn a comparison into a single line: if only one
  // webbing was measured inside the window, open on the full range instead.
  const expanded = expandedChoice ?? inWindow.length < STRETCH_CHART_MIN_SERIES
  // The table shows every curve in the current window; the plot shows the first
  // eight of them, because that is where a validated colour scale ends.
  const tableSeries = expanded ? allCurves : inWindow
  const series = useMemo(() => tableSeries.slice(0, MAX_PLOTTED_SERIES), [tableSeries])
  const loads = useMemo(() => xUnion(tableSeries), [tableSeries])
  const beyondWindow = allCurves.some(s => s.points.some(p => p.x > DEFAULT_MAX_KN))

  if (allCurves.length < STRETCH_CHART_MIN_SERIES) return null

  // Named, not dropped: a compared webbing missing from the plot with no
  // explanation reads as "flat at 0%". Each note names the control that reveals
  // its items — the expand link for the window, the Table view for the cap.
  const missing = items.filter(it => displayPoints(it.stretch).length === 0)
  const inTable = new Set(tableSeries.map(s => s.id))
  const outOfRange = items.filter(
    it => displayPoints(it.stretch).length > 0 && !inTable.has(String(it.id)),
  )
  const overCap = tableSeries.slice(MAX_PLOTTED_SERIES).map(s => s.label)

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`

  return (
    <section
      data-cy="stretch-chart"
      className="mt-8 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#00897B' }} />
          Stretch under load
        </h2>
        <div className="flex items-center gap-3">
          {/* The window applies to the whole panel, table included: it says which
              loads are under discussion, not how the plot is zoomed. */}
          {beyondWindow && (
            <button
              type="button"
              data-cy="stretch-chart-expand"
              data-expanded={String(expanded)}
              onClick={() => setExpandedChoice(!expanded)}
              className="whitespace-nowrap text-xs font-medium text-teal-primary hover:underline"
            >
              {expanded ? `Show 1–${DEFAULT_MAX_KN} kN` : 'Show all loads →'}
            </button>
          )}
          {/* The table is the accessible equivalent of the plot, not a fallback
              for a failure — two palette hues sit below 3:1 on white, and some
              readers want the numbers regardless. */}
          <div data-cy="stretch-chart-toggle" className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              data-cy="stretch-view-chart"
              data-active={String(view === 'chart')}
              onClick={() => setView('chart')}
              className={tab(view === 'chart')}
            >
              Chart
            </button>
            <button
              type="button"
              data-cy="stretch-view-table"
              data-active={String(view === 'table')}
              onClick={() => setView('table')}
              className={tab(view === 'table')}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {view === 'chart' ? (
        <div className="mt-3">
          <LineChart
            cy="stretch-chart"
            series={series}
            xTitle="Load (kN)"
            yTitle="Stretch (%)"
            formatX={kn}
            formatY={pct}
            ariaLabel="Stretch percentage against load, one line per compared webbing"
          />
        </div>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table data-cy="stretch-chart-table" className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-normal text-gray-500">
                  Load
                </th>
                {loads.map(load => (
                  <th
                    key={load}
                    data-cy="stretch-table-load"
                    data-kn={load}
                    className="whitespace-nowrap px-2.5 py-2 text-right text-xs font-normal text-gray-500"
                  >
                    {kn(load)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableSeries.map(s => (
                <tr key={s.id} className="border-t border-gray-100">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[10rem] truncate bg-white px-2 py-2 text-left text-sm font-medium text-gray-900"
                  >
                    <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </th>
                  {loads.map(load => {
                    const pt = s.points.find(p => p.x === load)
                    return (
                      <td
                        key={load}
                        data-cy="stretch-table-cell"
                        data-id={s.id}
                        data-kn={load}
                        className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-gray-900"
                      >
                        {/* Never 0 — this webbing simply wasn't measured there. */}
                        {pt ? pct(pt.y) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Identity is never colour alone: the legend names every line. */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {series.map(s => (
          <li
            key={s.id}
            data-cy="stretch-chart-legend-item"
            data-id={s.id}
            className="flex items-center gap-2 text-xs text-gray-600"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      {overCap.length > 0 && view === 'chart' && (
        <p data-cy="stretch-chart-over-cap" className="mt-3 text-xs text-gray-400">
          Not plotted — {MAX_PLOTTED_SERIES} lines is the readable limit: {overCap.join(', ')}. They
          are in the Table view.
        </p>
      )}

      {outOfRange.length > 0 && (
        <p data-cy="stretch-chart-out-of-range" className="mt-3 text-xs text-gray-400">
          Measured only above {DEFAULT_MAX_KN} kN: {outOfRange.map(it => String(it.name)).join(', ')}
        </p>
      )}

      {missing.length > 0 && (
        <p data-cy="stretch-chart-missing" className="mt-3 text-xs text-gray-400">
          No stretch data: {missing.map(it => String(it.name)).join(', ')}
        </p>
      )}
    </section>
  )
}
