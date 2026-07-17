// Dual-thumb range slider — the modern replacement for min/max text boxes, used
// by every numeric min/max filter (and the webbing stretch %). Two overlaid
// native range inputs keep it accessible and easy for tests to drive; the min
// thumb is data-cy="range-min", the max thumb data-cy="range-max". step="any"
// preserves exact float values (breaking strength etc.).
//
// Presentational + controlled: callers supply the domain, the current [lo, hi],
// and an onChange. This component clamps the thumbs so they can't cross.
//
// The two bound labels below the track are click-to-edit: a single click turns
// the value into a numeric input you can type into (committed on Enter/blur,
// reverted on Escape), so the exact bound can be set without dragging a thumb.

import { useEffect, useRef, useState } from 'react'

export default function RangeSlider({
  domainLo,
  domainHi,
  lo,
  hi,
  unit,
  step = 1,
  onMinChange,
  onMaxChange,
}: {
  domainLo: number
  domainHi: number
  lo: number
  hi: number
  unit?: string
  step?: number // 1 for integer-only fields, 0.5 when the data has fractional values
  // Per-thumb so a single change only writes its own bound — writing both would
  // let a stale `lo`/`hi` prop (async URL echo) clobber the other thumb.
  onMinChange: (v: number) => void
  onMaxChange: (v: number) => void
}) {
  // Degenerate domain (all values equal / no data): render disabled thumbs.
  const span = domainHi - domainLo || 1
  const pct = (v: number) => `${((v - domainLo) / span) * 100}%`

  const thumb =
    'pointer-events-none absolute inset-0 h-1.5 w-full appearance-none bg-transparent ' +
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 ' +
    '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none ' +
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border ' +
    '[&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-teal-primary ' +
    '[&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto ' +
    '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full ' +
    '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-teal-primary'

  return (
    <div>
      <div className="relative h-4">
        {/* track */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gray-200" />
        {/* selected span */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})`, background: '#00897B' }}
        />
        <input
          data-cy="range-min"
          type="range"
          min={domainLo}
          max={domainHi}
          step={step}
          value={lo}
          onChange={e => onMinChange(Math.min(Number(e.target.value), hi))}
          className={`${thumb} top-1/2 -translate-y-1/2`}
          aria-label="minimum"
        />
        <input
          data-cy="range-max"
          type="range"
          min={domainLo}
          max={domainHi}
          step={step}
          value={hi}
          onChange={e => onMaxChange(Math.max(Number(e.target.value), lo))}
          className={`${thumb} top-1/2 -translate-y-1/2`}
          aria-label="maximum"
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500">
        <EditableBound
          cy="range-min-value"
          value={lo}
          unit={unit}
          min={domainLo}
          max={hi}
          step={step}
          onCommit={v => onMinChange(Math.min(Math.max(v, domainLo), hi))}
        />
        <EditableBound
          cy="range-max-value"
          value={hi}
          unit={unit}
          min={lo}
          max={domainHi}
          step={step}
          onCommit={v => onMaxChange(Math.max(Math.min(v, domainHi), lo))}
        />
      </div>
    </div>
  )
}

// A single bound label that swaps to a numeric input on click. Controlled by the
// parent for its resting value; owns only the transient draft string while being
// edited so keystrokes don't fight the async URL echo (same race the sliders avoid).
function EditableBound({
  cy,
  value,
  unit,
  min,
  max,
  step,
  onCommit,
}: {
  cy: string
  value: number
  unit?: string
  min: number
  max: number
  step: number
  onCommit: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const start = () => {
    setDraft(String(value))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const n = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-cy={cy}
        data-editing="true"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setEditing(false)
        }}
        className="w-14 rounded border border-teal-primary px-1 py-0.5 text-[11px] text-gray-700 focus:outline-none"
        aria-label={cy}
      />
    )
  }

  return (
    <button
      data-cy={cy}
      data-editing="false"
      type="button"
      onClick={start}
      className="cursor-text rounded px-1 hover:bg-gray-100"
    >
      {formatBound(value)}{unit ? ` ${unit}` : ''}
    </button>
  )
}

function formatBound(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
