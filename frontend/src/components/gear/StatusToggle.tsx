// The lifecycle-scope control that sits at the very top of the filter sidebar:
// one full-width bubble split into equal thirds — ALL / CURRENT / HISTORIC.
//
// Scope is the first narrowing the listing applies, ahead of search and the
// filter groups, so it also drives their facet counts. Each third owns a color
// (amber / green / red); the selected one is filled with it and is the only
// segment with rounded ends, the other two stay transparent on the white bubble
// and wear their color as text.

export type Status = 'all' | 'current' | 'historic'

const OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '#E8770A' },
  { value: 'current', label: 'Current', color: '#15803D' },
  { value: 'historic', label: 'Historic', color: '#DC2626' },
]

export default function StatusToggle({
  status,
  onChange,
}: {
  status: Status
  onChange: (next: Status) => void
}) {
  return (
    <div
      data-cy="status-toggle"
      className="mb-3 flex w-full overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
    >
      {OPTIONS.map((opt, i) => {
        const active = status === opt.value
        // A hairline only between two unselected thirds — a divider touching the
        // filled segment would cut across its rounded end.
        const divided = i > 0 && !active && OPTIONS[i - 1].value !== status
        return (
          <button
            key={opt.value}
            data-cy={`status-${opt.value}`}
            type="button"
            data-active={active ? 'true' : 'false'}
            onClick={() => onChange(opt.value)}
            className={
              'flex-1 rounded-full px-2 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ' +
              (divided ? 'border-l border-gray-200 ' : '')
            }
            style={
              active
                ? { background: opt.color, color: '#FFFFFF' }
                : { background: 'transparent', color: opt.color }
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
