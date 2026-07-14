// Sort dropdown. Only numeric fields are sortable; Name A→Z / Z→A are always
// present. The button label reflects the current sort; options carry
// data-field / data-direction for the tests.
//
// Phase 3 scope: functional dropdown that writes the sort. The Name-A→Z-as-
// default (no URL param) nuance and the contextual stretch options are refined
// in Phase 5.

import { Fragment, useEffect, useRef, useState } from 'react'
import type { SortSpec } from '@/hooks/useUrlState'
import { sortFieldsFor } from '@/config/sortFields'
import type { GearSlug } from '@/types'

function labelFor(sort: SortSpec | null, slug: GearSlug): string {
  if (!sort) return 'Sort by'
  if (sort.field === 'name') return sort.direction === 'asc' ? 'Name: A→Z' : 'Name: Z→A'
  const meta = sortFieldsFor(slug).find(f => f.field === sort.field)
  const name = meta?.label ?? sort.field
  return `${name}: ${sort.direction === 'asc' ? 'Low→High' : 'High→Low'}`
}

export default function SortDropdown({
  slug,
  sort,
  onChange,
}: {
  slug: GearSlug
  sort: SortSpec | null
  onChange: (spec: SortSpec | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fields = sortFieldsFor(slug)

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
            onClick={() => pick({ field: 'name', direction: 'asc' })}
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
        </div>
      )}
    </div>
  )
}
