// Sort dropdown. Only numeric fields are sortable; Name A→Z / Z→A are always
// present. The button label reflects the current sort; options carry
// data-field / data-direction for the tests.
//
// Webbing stretch sort is special: it is available for the TOP-5 stretch kN
// points (passed in as `stretchKns`) and is decoupled from the filter widget.
// Rather than listing ten "Stretch at N kN" rows, the menu shows ONE stretch row
// whose kN is a nested secondary dropdown; the two Low→High / High→Low options
// sort by the % at the chosen kN. The sort field encodes that kN as `stretch@N`.

import { Fragment, useEffect, useRef, useState } from 'react'
import type { SortSpec } from '@/hooks/useUrlState'
import { sortFieldsFor } from '@/config/sortFields'
import type { GearSlug } from '@/types'

const STRETCH_PREFIX = 'stretch@'

function stretchKnOf(sort: SortSpec | null): number | null {
  if (!sort || !sort.field.startsWith(STRETCH_PREFIX)) return null
  return Number(sort.field.slice(STRETCH_PREFIX.length))
}

function labelFor(sort: SortSpec | null, slug: GearSlug): string {
  if (!sort) return 'Sort by'
  if (sort.field === 'name') return sort.direction === 'asc' ? 'Name: A→Z' : 'Name: Z→A'
  const kn = stretchKnOf(sort)
  if (kn != null) {
    return `Stretch at ${kn} kN: ${sort.direction === 'asc' ? 'Low→High' : 'High→Low'}`
  }
  const meta = sortFieldsFor(slug).find(f => f.field === sort.field)
  const name = meta?.label ?? sort.field
  return `${name}: ${sort.direction === 'asc' ? 'Low→High' : 'High→Low'}`
}

export default function SortDropdown({
  slug,
  sort,
  onChange,
  stretchKns = [],
}: {
  slug: GearSlug
  sort: SortSpec | null
  onChange: (spec: SortSpec | null) => void
  // Top-5 webbing stretch reference kN, RANKED by webbing count (most common
  // first) so stretchKns[0] is the default sort kN. Empty for non-webbing types.
  stretchKns?: number[]
}) {
  const [open, setOpen] = useState(false)
  const [knOpen, setKnOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fields = sortFieldsFor(slug)

  // The kN currently targeted by the stretch row: the active stretch sort's kN if
  // one is set, otherwise the first (most-common) top point.
  const [pickedKn, setPickedKn] = useState<number | null>(null)
  const activeKn = stretchKnOf(sort)
  const stretchKn = activeKn ?? pickedKn ?? stretchKns[0] ?? null

  // Whether a stretch sort is currently applied, tracked in LOCAL state rather
  // than read back off `sort`. The `sort` prop comes from the URL via
  // useSearchParams, which lags a render behind setSort — so right after applying
  // a stretch sort, `activeKn` is still null. Deciding "retarget the kN?" off that
  // stale value silently dropped the retarget. pickStretch sets this synchronously;
  // an effect keeps it in sync with external/deep-linked sort changes.
  const [stretchActive, setStretchActive] = useState<'asc' | 'desc' | null>(null)
  useEffect(() => {
    setStretchActive(activeKn != null ? sort!.direction : null)
  }, [sort, activeKn])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const pick = (spec: SortSpec | null) => {
    onChange(spec)
    setOpen(false)
    setKnOpen(false)
  }

  const pickStretch = (kn: number, direction: 'asc' | 'desc') => {
    setStretchActive(direction) // synchronous — don't wait for the URL echo
    pick({ field: `${STRETCH_PREFIX}${kn}`, direction })
  }

  const optionClass =
    'block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50'

  return (
    <div ref={ref} className="relative">
      <button
        data-cy="sort-dropdown"
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sort by</span>
        <span>{labelFor(sort, slug)}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[210px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            data-cy="sort-option"
            data-field="name"
            data-direction="asc"
            className={optionClass}
            // Name A→Z is the default sort, so it carries NO ?sort= param — picking
            // it clears the sort back to the null (default) state rather than
            // writing sort=name-asc. Name Z→A is a real, non-default choice and is
            // written normally. See url_state.cy.ts / the useUrlState contract.
            onClick={() => pick(null)}
          >
            Name: A→Z
          </button>
          <button
            data-cy="sort-option"
            data-field="name"
            data-direction="desc"
            className={optionClass}
            onClick={() => pick({ field: 'name', direction: 'desc' })}
          >
            Name: Z→A
          </button>
          {fields.map(f => (
            <Fragment key={f.field}>
              <button
                data-cy="sort-option"
                data-field={f.field}
                data-direction="asc"
                className={optionClass}
                onClick={() => pick({ field: f.field, direction: 'asc' })}
              >
                {f.label}: Low→High
              </button>
              <button
                data-cy="sort-option"
                data-field={f.field}
                data-direction="desc"
                className={optionClass}
                onClick={() => pick({ field: f.field, direction: 'desc' })}
              >
                {f.label}: High→Low
              </button>
            </Fragment>
          ))}

          {stretchKn != null && (
            <div data-cy="sort-stretch-row" className="border-t border-gray-100 mt-1 pt-1">
              <div className="flex items-center gap-1 px-3 py-1 text-xs uppercase tracking-wide text-gray-400">
                <span>Stretch at</span>
                {/* Secondary dropdown: the kN number is itself clickable. */}
                <div className="relative">
                  <button
                    data-cy="stretch-sort-kn"
                    data-kn={stretchKn}
                    type="button"
                    onClick={() => setKnOpen(o => !o)}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-xs font-semibold text-gray-600 hover:border-gray-400"
                  >
                    {stretchKn} kN ▾
                  </button>
                  {knOpen && (
                    <div className="absolute left-0 z-40 mt-1 min-w-[80px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {[...stretchKns].sort((a, b) => a - b).map(kn => (
                        <button
                          key={kn}
                          data-cy="stretch-sort-kn-option"
                          data-kn={kn}
                          type="button"
                          className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setPickedKn(kn)
                            setKnOpen(false)
                            // If a stretch sort is already applied, retarget it to
                            // the new kN. Use the local flag, not `sort` (see above).
                            if (stretchActive != null) pickStretch(kn, stretchActive)
                          }}
                        >
                          {kn} kN
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                data-cy="sort-option"
                data-field="stretch"
                data-kn={stretchKn}
                data-direction="asc"
                className={optionClass}
                onClick={() => pickStretch(stretchKn, 'asc')}
              >
                Low→High
              </button>
              <button
                data-cy="sort-option"
                data-field="stretch"
                data-kn={stretchKn}
                data-direction="desc"
                className={optionClass}
                onClick={() => pickStretch(stretchKn, 'desc')}
              >
                High→Low
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
