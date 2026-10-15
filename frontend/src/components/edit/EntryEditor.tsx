// The edit form for one catalogue entry — a gear item or a brand — and the
// create form, which is the same form starting empty.
//
// Built from the field list the API publishes (`GET /edit/{slug}/fields`), so
// every field name, kind and allowed value comes from the models. What it adds:
//
//  - only the fields actually changed are sent, a cleared field as null;
//  - a before → after preview of exactly that, above the optional "why";
//  - a 409 (someone else saved first, D27) shows what moved and keeps what was
//    typed: "Re-apply" re-bases the form on the newest version;
//  - a 422 names the field the API refused.

import { useEffect, useId, useMemo, useState } from 'react'
import { ApiError } from '@/api/client'
import type { EditConflict, EditResult, FieldSpec, Stored } from '@/types'
import { asDrafted, display, type Draft, fromDraft, humanize, sameValue, toDraft } from '@/utils/fieldDraft'
import FieldInput from './FieldInput'
import Modal from './Modal'

export interface EntryAdapter {
  title: string
  loadFields: () => Promise<FieldSpec[]>
  /** Absent: a create form, starting empty. */
  loadStored?: () => Promise<Stored>
  /** A create form's own fields, ahead of the published ones (a brand's name). */
  extraFields?: FieldSpec[]
  save: (values: Record<string, unknown>, rev: number | null, why: string | null) => Promise<EditResult>
  /** Shown under the title. */
  note?: string
}

const MAX_WHY = 2000

export default function EntryEditor({
  adapter,
  onClose,
  onSaved,
}: {
  adapter: EntryAdapter
  onClose: () => void
  onSaved: (result: EditResult) => void
}) {
  const formId = useId()
  const [fields, setFields] = useState<FieldSpec[] | null>(null)
  const [base, setBase] = useState<Stored | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [why, setWhy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<EditConflict | null>(null)
  const [saving, setSaving] = useState(false)
  const creating = !adapter.loadStored

  useEffect(() => {
    let cancelled = false
    Promise.all([adapter.loadFields(), adapter.loadStored ? adapter.loadStored() : Promise.resolve(null)])
      .then(([specs, stored]) => {
        if (cancelled) return
        const all = [...(adapter.extraFields ?? []), ...specs]
        setFields(all)
        setBase(stored)
        setDrafts(Object.fromEntries(all.map(spec => [spec.name, toDraft(spec.kind, stored?.entry[spec.name])])))
      })
      .catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the form.')
      })
    return () => {
      cancelled = true
    }
    // The adapter is built per render by its caller; load once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every field's parsed value, and which differ from the version opened.
  const parsed = useMemo(() => {
    const values: Record<string, unknown> = {}
    const errors: Record<string, string> = {}
    for (const spec of fields ?? []) {
      const result = fromDraft(spec.kind, drafts[spec.name] ?? '')
      values[spec.name] = result.value
      if (result.error) errors[spec.name] = result.error
      else if (creating && spec.required && result.value === null) errors[spec.name] = 'required'
    }
    return { values, errors }
  }, [fields, drafts, creating])

  const changes = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const spec of fields ?? []) {
      const before = asDrafted(spec.kind, base?.entry[spec.name] ?? null)
      const after = parsed.values[spec.name]
      if (!sameValue(before, after)) out[spec.name] = after
    }
    return out
  }, [fields, base, parsed])

  const changed = Object.keys(changes)
  const blocked = Object.keys(parsed.errors).length > 0 || changed.length === 0

  const save = async () => {
    setSaving(true)
    setError(null)
    setConflict(null)
    try {
      const values = creating ? Object.fromEntries(Object.entries(parsed.values).filter(([, v]) => v !== null)) : changes
      const result = await adapter.save(values, base?.rev ?? null, why.trim() || null)
      onSaved(result)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409 && caught.detail && 'current' in caught.detail) {
        setConflict(caught.detail as unknown as EditConflict)
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not save.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Someone saved first: take their version as the base, and put back only
  // the fields this person changed — every other field shows the newest value.
  const reapply = () => {
    if (!conflict?.current || conflict.rev === null || !base || !fields) return
    const current = conflict.current
    setDrafts(drafts =>
      Object.fromEntries(
        fields.map(spec => [
          spec.name,
          spec.name in changes ? drafts[spec.name] : toDraft(spec.kind, current[spec.name]),
        ]),
      ),
    )
    setBase({ ...base, entry: current, rev: conflict.rev })
    setConflict(null)
  }

  const label = (spec: FieldSpec) => `${humanize(spec.name)}${spec.required ? ' *' : ''}`

  return (
    <Modal title={adapter.title} onClose={onClose} wide data-cy="entry-editor">
      {adapter.note && <p className="mb-3 text-sm text-gray-600">{adapter.note}</p>}
      {!fields ? (
        <p className="text-sm text-gray-500">{error ?? 'Loading…'}</p>
      ) : (
        <form
          id={formId}
          onSubmit={event => {
            event.preventDefault()
            if (!blocked) void save()
          }}
        >
          <div className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {fields.map(spec => {
              const id = `${formId}-${spec.name}`
              const wide = ['longtext', 'curve', 'choices', 'list'].includes(spec.kind)
              return (
                <div key={spec.name} className={wide ? 'sm:col-span-2' : ''}>
                  <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">
                    {label(spec)}
                    {changes[spec.name] !== undefined && <span className="ml-1 text-amber-700">· changed</span>}
                  </label>
                  <FieldInput
                    spec={spec}
                    id={id}
                    draft={drafts[spec.name] ?? ''}
                    onChange={draft => setDrafts(current => ({ ...current, [spec.name]: draft }))}
                  />
                  {parsed.errors[spec.name] && (
                    <p data-cy={`edit-field-error-${spec.name}`} className="mt-0.5 text-xs text-red-700">
                      {parsed.errors[spec.name]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {!creating && (
            <div data-cy="edit-preview" className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
              {changed.length === 0 ? (
                <p className="text-gray-500">No changes yet.</p>
              ) : (
                <ul className="space-y-1">
                  {changed.map(name => (
                    <li key={name} data-cy="edit-preview-row">
                      <span className="font-medium text-gray-900">{humanize(name)}</span>:{' '}
                      <span className="text-gray-500 line-through">{display(base?.entry[name], name)}</span> →{' '}
                      <span className="text-gray-900">{display(changes[name], name)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <label htmlFor={`${formId}-why`} className="mt-4 mb-1 block text-xs font-medium text-gray-700">
            Why (optional — shown publicly with the change)
          </label>
          <input
            id={`${formId}-why`}
            data-cy="edit-why"
            maxLength={MAX_WHY}
            value={why}
            onChange={e => setWhy(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-700 focus:outline-none"
          />

          {conflict && (
            <div data-cy="edit-conflict" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Someone saved a change since you opened this.</p>
              <ul className="mt-1 list-disc pl-5">
                {Object.keys({ ...base?.entry, ...conflict.current })
                  .filter(name => !sameValue(base?.entry[name], conflict.current?.[name]))
                  .map(name => (
                    <li key={name}>
                      {humanize(name)}: now {display(conflict.current?.[name], name)}
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                data-cy="edit-reapply"
                onClick={reapply}
                className="mt-2 cursor-pointer rounded-full border border-amber-700 px-3 py-1 text-xs font-semibold"
              >
                Re-apply my changes on the newest version
              </button>
            </div>
          )}
          {error && (
            <p data-cy="edit-error" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="submit"
              data-cy="edit-save"
              disabled={saving || blocked}
              className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-default disabled:opacity-50"
            >
              {creating ? 'Create' : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
