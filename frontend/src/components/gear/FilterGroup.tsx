// A collapsible sidebar filter section: teal dot accent, small-caps label, and a
// collapse/expand toggle. Body stays mounted when collapsed (hidden via CSS) so
// tests can assert its controls are `not.be.visible` rather than absent.

import { useState, type ReactNode } from 'react'

export default function FilterGroup({
  group,
  label,
  children,
}: {
  group: string
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <div
      data-cy="filter-group"
      data-group={group}
      className="border-b border-gray-100 py-3 last:border-b-0"
    >
      <button
        data-cy="filter-group-toggle"
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2"
        aria-expanded={open}
      >
        <span
          data-cy="filter-group-dot"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: '#00897B' }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <span className="ml-auto text-sm leading-none text-gray-400">{open ? '−' : '+'}</span>
      </button>

      <div className={open ? 'mt-2' : 'hidden'}>{children}</div>
    </div>
  )
}
