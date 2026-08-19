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
//
// Where the thumbs overlap, only the top input (max) receives the pointer, so
// the drag's direction picks which bound moves — see utils/rangeDrag.ts.

import { useEffect, useRef, useState } from 'react'
import { resolveDragRole, thumbsOverlap } from '../../utils/rangeDrag'

export default function RangeSlider({
  domainLo,
  domainHi,
  lo,
  hi,
  unit,
  step = 1,
  decimals,
  onMinChange,
  onMaxChange,
}: {
  domainLo: number
  domainHi: number
  lo: number
  hi: number
  unit?: string
  step?: number // 1 for integer-only fields, 0.5 for fractional data, 0.01 for money
  // Fixed decimal places for the bound labels. Money passes 2 — a price reads as
  // "9.50 €", never "9.5 €" — and gets cent-precision typing in the edit box.
  // Everything else leaves it unset and keeps the terse "as many as it needs".
  decimals?: number
  // Per-thumb so a single change only writes its own bound — writing both would
  // let a stale `lo`/`hi` prop (async URL echo) clobber the other thumb.
  onMinChange: (v: number) => void
  onMaxChange: (v: number) => void
}) {
  // Degenerate domain (all values equal / no data): render disabled thumbs.
  const span = domainHi - domainLo || 1
  const pct = (v: number) => `${((v - domainLo) / span) * 100}%`

  // A drag lands on `domainLo + n · step`, and with cent-sized steps that
  // arithmetic carries float dust: the very top of the track can report
  // 10.559999… for a 10.56 domain, which the caller then reads as a real upper
  // bound rather than "no constraint" — quietly hiding the priciest item behind
  // a slider that looks maxed. No interior grid point is within half a step of
  // an end, so snapping that close is unambiguous.
  const atEnd = (v: number) =>
    v <= domainLo + step / 2 ? domainLo : v >= domainHi - step / 2 ? domainHi : v

  // The track element, measured at event time so overlap can be judged in
  // pixels. Read on demand rather than observed — it is only ever needed inside
  // a change handler, which is long after layout.
  const trackRef = useRef<HTMLDivElement>(null)

  // The bound the in-flight gesture is moving, held until it ends so a reversal
  // mid-drag keeps moving the same thumb. Null between gestures.
  //
  // `dragging` scopes that stickiness to a real pointer gesture. A keyboard
  // arrow or a programmatic write arrives with no pointerdown around it, and
  // must be judged on its own merits — carrying a role between two such writes
  // would land the second one on the bound the first just moved.
  const dragRole = useRef<'min' | 'max' | null>(null)
  const dragging = useRef(false)
  const startGesture = () => {
    dragging.current = true
    dragRole.current = null
  }
  const endGesture = () => {
    dragging.current = false
    dragRole.current = null
  }

  // One change from either input: decide whose bound it is, then clamp so the
  // thumbs still cannot cross.
  const apply = (source: 'min' | 'max', raw: number) => {
    const value = atEnd(raw)
    const role = resolveDragRole({
      source,
      value,
      lo,
      hi,
      overlapping: thumbsOverlap(lo, hi, domainLo, domainHi, trackRef.current?.offsetWidth ?? 0),
      active: dragging.current ? dragRole.current : null,
    })
    if (dragging.current) dragRole.current = role
    if (role === 'min') onMinChange(Math.min(Math.max(value, domainLo), hi))
    else onMaxChange(Math.max(Math.min(value, domainHi), lo))
  }

  // Every gesture starts fresh: a pointer press, or a key press for the keyboard
  // path (each arrow is its own gesture).
  const gestureProps = {
    onPointerDown: startGesture,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onKeyDown: endGesture,
  }

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
      <div ref={trackRef} className="relative h-4">
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
          onChange={e => apply('min', Number(e.target.value))}
          {...gestureProps}
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
          onChange={e => apply('max', Number(e.target.value))}
          {...gestureProps}
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
          decimals={decimals}
          onCommit={v => onMinChange(Math.min(Math.max(v, domainLo), hi))}
        />
        <EditableBound
          cy="range-max-value"
          value={hi}
          unit={unit}
          min={lo}
          max={domainHi}
          step={step}
          decimals={decimals}
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
  decimals,
  onCommit,
}: {
  cy: string
  value: number
  unit?: string
  min: number
  max: number
  step: number
  decimals?: number
  onCommit: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const start = () => {
    setDraft(formatBound(value, decimals))
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
        // The thumb's coarse grid must not stop you typing an exact bound, so a
        // money field accepts cents here even though a drag lands on the grid.
        step={decimals != null ? 10 ** -decimals : step}
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
      {formatBound(value, decimals)}{unit ? ` ${unit}` : ''}
    </button>
  )
}

// Both labels on one slider are formatted the same way — a money slider reading
// "31.50" on the left and "512" on the right looks broken, so `decimals` (when
// given) applies to every value regardless of size.
function formatBound(v: number, decimals?: number): string {
  if (decimals != null) return v.toFixed(decimals)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
