// One input per field kind the API describes (types/edits.ts FieldKind). The
// input holds a draft (utils/fieldDraft.ts); the editor turns it into a value
// on save.

import type { FieldSpec } from '@/types'
import type { Draft } from '@/utils/fieldDraft'

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700'

export default function FieldInput({
  spec,
  id,
  draft,
  onChange,
}: {
  spec: FieldSpec
  id: string
  draft: Draft
  onChange: (draft: Draft) => void
}) {
  const cy = `edit-field-${spec.name}`
  switch (spec.kind) {
    case 'longtext':
      return (
        <textarea id={id} data-cy={cy} rows={4} className={INPUT} value={draft as string} onChange={e => onChange(e.target.value)} />
      )
    case 'list':
      return (
        <textarea
          id={id}
          data-cy={cy}
          rows={2}
          placeholder="one per line"
          className={INPUT}
          value={draft as string}
          onChange={e => onChange(e.target.value)}
        />
      )
    case 'curve':
      return (
        <textarea
          id={id}
          data-cy={cy}
          rows={4}
          placeholder={'kN and percent, one reading per line\n4 1.1\n8 3'}
          className={`${INPUT} font-mono`}
          value={draft as string}
          onChange={e => onChange(e.target.value)}
        />
      )
    case 'rings':
      // One line per option the leash is sold with: a ring and how many. The
      // picker appends a line for a ring, so nobody has to know its id.
      return (
        <div>
          <textarea
            id={id}
            data-cy={cy}
            rows={3}
            placeholder={'leash ring id x how many, one per line\n35 x 2'}
            className={`${INPUT} font-mono`}
            value={draft as string}
            onChange={e => onChange(e.target.value)}
          />
          <select
            data-cy={`${cy}-add`}
            aria-label="Add a leash ring"
            className={`${INPUT} mt-1`}
            value=""
            onChange={e => {
              const ringId = e.target.value.split(' ')[0]
              if (!ringId) return
              const text = (draft as string).trim()
              onChange(`${text ? `${text}\n` : ''}${ringId} x 1`)
            }}
          >
            <option value="">Add a leash ring…</option>
            {(spec.options ?? []).map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )
    case 'boolean':
      return (
        <select id={id} data-cy={cy} className={INPUT} value={draft as string} onChange={e => onChange(e.target.value)}>
          <option value="">unknown</option>
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      )
    case 'choice':
      return (
        <select id={id} data-cy={cy} className={INPUT} value={draft as string} onChange={e => onChange(e.target.value)}>
          <option value="">{spec.required ? 'choose…' : '—'}</option>
          {(spec.options ?? []).map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case 'choices': {
      const chosen = draft as string[]
      return (
        <div id={id} data-cy={cy} className="flex flex-wrap gap-1.5">
          {(spec.options ?? []).map(option => {
            const on = chosen.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                data-cy={`${cy}-option`}
                onClick={() => onChange(on ? chosen.filter(o => o !== option) : [...chosen, option])}
                className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs ${
                  on ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-300 text-gray-700 hover:border-teal-600'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>
      )
    }
    case 'date':
      return (
        <input
          id={id}
          data-cy={cy}
          type="date"
          className={INPUT}
          value={draft as string}
          onChange={e => onChange(e.target.value)}
        />
      )
    default:
      return (
        <input
          id={id}
          data-cy={cy}
          type="text"
          inputMode={spec.kind === 'number' ? 'decimal' : spec.kind === 'integer' ? 'numeric' : undefined}
          className={INPUT}
          value={draft as string}
          onChange={e => onChange(e.target.value)}
        />
      )
  }
}
