// Webbing-only "Stretch at X kN" widget. Single-select kN pills (populated from
// the dataset) pick a reference point on the stretch curve; a dual-thumb %
// slider narrows within it. State is owned by GearListingPage (it also drives
// filtering, the contextual sort options, and the cards' data-stretch-percent),
// so this is a controlled component. See the "Webbing stretch filter" block in
// filters.cy.ts.

import { useMemo } from 'react'
import { percentAtKn, topKnPoints } from '@/utils/stretch'
import { rangeDomain } from '@/utils/range'
import type { AnyItem } from '@/utils/format'
import FilterGroup from './FilterGroup'
import RangeSlider from './RangeSlider'

export default function StretchFilter({
  items,
  displayKn,
  onSelectKn,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  items: AnyItem[]
  displayKn: number | null // the pill shown active (default or engaged)
  onSelectKn: (kn: number) => void
  min: string
  max: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
}) {
  // Top-5 integer kN points (excluding 0), each with its webbing count, shown in
  // ascending kN order for a stable left-to-right pill layout. `items` is the
  // set left by search + the other filter groups, so the counts (and which
  // points make the top-5) move as the rest of the UI changes.
  //
  // The engaged pill is pinned in even if it falls out of the top-5 under the
  // current filters — otherwise its own filter would stay applied with no pill
  // left to click to turn it off.
  const points = useMemo(() => {
    const top = topKnPoints(items)
    if (displayKn != null && !top.some(p => p.kn === displayKn)) {
      const count = items.filter(i => percentAtKn(i.stretch, displayKn) != null).length
      top.push({ kn: displayKn, count })
    }
    return top.sort((a, b) => a.kn - b.kn)
  }, [items, displayKn])

  // % domain = spread of stretch % across webbings at the selected kN.
  const domain = useMemo(() => {
    if (displayKn == null) return { lo: 0, hi: 0, step: 1 }
    const ps = items
      .map(i => percentAtKn(i.stretch, displayKn))
      .filter((p): p is number => p != null)
    return rangeDomain(ps)
  }, [items, displayKn])

  const lo = min !== '' ? Number(min) : domain.lo
  const hi = max !== '' ? Number(max) : domain.hi

  return (
    <FilterGroup group="stretch" label="Stretch at kN">
      <div className="flex flex-wrap gap-1.5">
        {points.map(({ kn, count }) => {
          const active = kn === displayKn
          return (
            <button
              key={kn}
              data-cy="stretch-kn-pill"
              type="button"
              data-kn={kn}
              data-count={count}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSelectKn(kn)}
              className={
                'rounded-full border px-2.5 py-1 text-xs transition-colors ' +
                (active
                  ? 'border-teal-primary text-teal-primary'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400')
              }
              style={active ? { background: '#E0F2F1' } : undefined}
            >
              {kn} kN{' '}
              <span className="text-gray-400" data-cy="stretch-kn-count">
                ({count})
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <RangeSlider
          domainLo={domain.lo}
          domainHi={domain.hi}
          lo={lo}
          hi={hi}
          unit="%"
          step={domain.step}
          onMinChange={v => onMinChange(v <= domain.lo ? '' : String(v))}
          onMaxChange={v => onMaxChange(v >= domain.hi ? '' : String(v))}
        />
      </div>
    </FilterGroup>
  )
}
