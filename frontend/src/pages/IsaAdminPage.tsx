// ISA certificates and warnings, for admins — live editing phase 7
// (LIVE_EDITING_PHASE_7.md, P7-A to P7-D).
//
// One queue per list, unmatched first: correct what the ISA's capture got
// wrong, match an entry to our products (picked from the catalogue, so the
// stored names can never disagree with the ids), record one the ISA has not
// listed yet, or retire one it dropped. Every change is a public log record
// flagged `safety`. A product page links here filtered to that product
// (`?gear=webbings:62`).
//
// Not access control: every route behind it is admin-only on the server.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createIsa, editIsa, fetchIsaEntries, fetchIsaEntry, fetchIsaFields, retireIsa } from '@/api/isa'
import { fetchGearList } from '@/api/gear'
import { fetchChanges } from '@/api/people'
import { useSiteAuth } from '@/auth/AuthContext'
import ChangeList from '@/components/edit/ChangeList'
import EntryEditor from '@/components/edit/EntryEditor'
import Modal from '@/components/edit/Modal'
import { GEAR_TYPES, getGearType } from '@/config/gearTypes'
import type { ChangeRecordPublic, GearItem, IsaEntry, IsaKind, IsaMatchIn } from '@/types'
import { entryTitle, isMatched, landsOn, matchTargets, slugOf, sortEntries } from '@/utils/isaEntries'

const KINDS: { kind: IsaKind; label: string }[] = [
  { kind: 'certificates', label: 'Certificates' },
  { kind: 'warnings', label: 'Warnings' },
]
// The types whose rows carry the flag an entry sets (certification, a warning).
const TARGETS = GEAR_TYPES.filter(g => g.certifiable)
const CONFIDENCES: IsaMatchIn['confidence'][] = ['exact', 'likely', 'partial', 'ambiguous', 'none']

const BUTTON =
  'cursor-pointer rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-teal-600 hover:text-teal-700'
const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none'

type Dialog =
  | null
  | { kind: IsaKind; edit: IsaEntry }
  | { kind: IsaKind; match: IsaEntry; prefill?: IsaMatchIn }
  | { kind: IsaKind; retire: IsaEntry }
  | 'add'

export default function IsaAdminPage() {
  const auth = useSiteAuth()
  const token = auth.token
  const [params, setParams] = useSearchParams()
  const kind: IsaKind = params.get('kind') === 'warnings' ? 'warnings' : 'certificates'
  const gear = params.get('gear') // "webbings:62"
  // Both lists, always: a product's view (`?gear=`) shows what lands on it
  // from either, and the tabs switch between them otherwise.
  const [lists, setLists] = useState<Record<IsaKind, IsaEntry[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(() => {
    if (!token || !auth.isAdmin) return
    Promise.all([fetchIsaEntries('certificates', token), fetchIsaEntries('warnings', token)])
      .then(([certificates, warnings]) => setLists({ certificates, warnings }))
      .catch(caught => setError(caught instanceof Error ? caught.message : 'Could not load the lists.'))
  }, [token, auth.isAdmin])
  useEffect(load, [load])

  const entries = lists?.[kind] ?? null
  const shown = useMemo(() => {
    if (!lists) return []
    const [slug, id] = (gear ?? '').split(':')
    const needle = search.trim().toLowerCase()
    const kinds: IsaKind[] = gear ? ['certificates', 'warnings'] : [kind]
    return kinds.flatMap(k =>
      sortEntries(lists[k])
        .filter(
          e =>
            (!gear || landsOn(e, slug, Number(id))) &&
            (!needle || `${e.key} ${entryTitle(k, e)}`.toLowerCase().includes(needle)),
        )
        .map(e => ({ kind: k, entry: e })),
    )
  }, [lists, gear, search, kind])

  if (!auth.me) return <p className="p-8 text-sm text-gray-600">Sign in as an admin to manage the ISA's lists.</p>
  if (!auth.isAdmin) {
    return (
      <p data-cy="isa-not-admin" className="p-8 text-sm text-gray-600">
        Only admins change the ISA's certificates and warnings.
      </p>
    )
  }

  const done = () => {
    setDialog(null)
    load()
  }
  const unmatched = entries?.filter(e => !isMatched(e)).length ?? 0

  return (
    <div data-cy="isa-admin-page" className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/admin" className="text-sm text-teal-700 hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">ISA certificates and warnings</h1>
      <p className="mt-1 text-sm text-gray-600">
        The ISA's statements, matched to our products. A certificate certifies only on an <em>exact</em> match; a
        warning shows on whatever it is matched to. Every change is public and flagged as a safety change.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {KINDS.map(k => (
          <button
            key={k.kind}
            type="button"
            data-cy="isa-tab"
            data-kind={k.kind}
            aria-pressed={kind === k.kind}
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('kind', k.kind)
              setParams(next, { replace: true })
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              kind === k.kind ? 'bg-teal-700 text-white' : 'border border-gray-300 text-gray-700 hover:border-gray-400'
            }`}
          >
            {k.label}
          </button>
        ))}
        <input
          data-cy="isa-search"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto w-48 rounded-full border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-700 focus:outline-none"
        />
        <button type="button" data-cy="isa-add" className={BUTTON} onClick={() => setDialog('add')}>
          Add {kind === 'certificates' ? 'a certificate' : 'a warning'}
        </button>
      </div>

      {gear && (
        <p data-cy="isa-gear-filter" className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Showing the certificates and warnings that land on <Link to={`/${gear.replace(':', '/')}`} className="font-medium underline">{gear.replace(':', ' #')}</Link>.{' '}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('gear')
              setParams(next, { replace: true })
            }}
          >
            Show all
          </button>
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {lists === null && !error && <p className="mt-6 text-sm text-gray-500">Loading…</p>}
      {entries && !gear && (
        <p className="mt-4 text-xs text-gray-500">
          {entries.length} {kind}, {unmatched} unmatched — unmatched first.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {shown.map(({ kind: k, entry: e }) => (
          <IsaRow
            key={`${k}-${e.key}`}
            kind={k}
            entry={e}
            onEdit={() => setDialog({ kind: k, edit: e })}
            onMatch={prefill => setDialog({ kind: k, match: e, prefill })}
            onRetire={() => setDialog({ kind: k, retire: e })}
          />
        ))}
      </ul>

      {token && dialog === 'add' && (
        <EntryEditor
          adapter={{
            title: kind === 'certificates' ? 'Add a certificate' : 'Add a warning',
            note: "One the ISA's list does not have yet. Match it to products afterwards.",
            loadFields: () => fetchIsaFields(kind, token),
            save: (fields, _rev, why) => createIsa(kind, fields, why, token),
          }}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {token && dialog && typeof dialog === 'object' && 'edit' in dialog && (
        <EntryEditor
          adapter={{
            title: `Edit ${dialog.edit.key}`,
            note: "Correct what the capture of the ISA's list got wrong. The match is set separately.",
            loadFields: () => fetchIsaFields(dialog.kind, token),
            loadStored: () =>
              fetchIsaEntry(dialog.kind, dialog.edit.key, token).then(s => ({
                collection: dialog.kind,
                key: s.key,
                entry: s.entry,
                rev: s.rev,
              })),
            save: (changes, rev, why) => editIsa(dialog.kind, dialog.edit.key, { rev: rev ?? 0, changes, why }, token),
          }}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {token && dialog && typeof dialog === 'object' && 'match' in dialog && (
        <MatchDialog kind={dialog.kind} entry={dialog.match} prefill={dialog.prefill} token={token} onClose={() => setDialog(null)} onDone={done} />
      )}
      {token && dialog && typeof dialog === 'object' && 'retire' in dialog && (
        <RetireDialog kind={dialog.kind} entry={dialog.retire} token={token} onClose={() => setDialog(null)} onDone={done} />
      )}
    </div>
  )
}

function IsaRow({
  kind,
  entry,
  onEdit,
  onMatch,
  onRetire,
}: {
  kind: IsaKind
  entry: IsaEntry
  onEdit: () => void
  onMatch: (prefill?: IsaMatchIn) => void
  onRetire: () => void
}) {
  const [history, setHistory] = useState<ChangeRecordPublic[] | null>(null)
  const match = entry.entry.match
  const targets = matchTargets(match)
  const suggestion = entry.entry.suggested_match
  const toggleHistory = () => {
    if (history) {
      setHistory(null)
      return
    }
    fetchChanges({ target_type: kind === 'certificates' ? 'isa_certificate' : 'isa_warning', target_id: entry.key })
      .then(setHistory)
      .catch(() => setHistory([]))
  }
  return (
    <li
      data-cy="isa-entry"
      data-key={entry.key}
      data-matched={String(targets.length > 0)}
      className="rounded-xl border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold text-gray-900">{entryTitle(kind, entry)}</h2>
        <span className="font-mono text-xs text-gray-500">{entry.key}</span>
        {targets.length === 0 ? (
          <span data-cy="isa-unmatched" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            Unmatched
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{match?.confidence}</span>
        )}
      </div>
      {targets.length > 0 && (
        <ul data-cy="isa-match" className="mt-2 text-sm text-gray-700">
          {targets.flatMap(t =>
            t.gearIds.map((id, i) => (
              <li key={`${t.gearType}-${id}`}>
                <Link to={`/${slugOf(t.gearType ?? '')}/${id}`} className="text-teal-700 hover:underline">
                  {t.gearNames[i] ?? `${t.gearType} #${id}`}
                </Link>
              </li>
            )),
          )}
        </ul>
      )}
      {match?.note && <p className="mt-1 text-xs text-gray-500">{match.note}</p>}
      {suggestion && targets.length === 0 && (
        <p data-cy="isa-suggestion" className="mt-2 text-sm text-gray-700">
          The import suggests <strong>{suggestion.name}</strong>.{' '}
          <button
            type="button"
            data-cy="isa-use-suggestion"
            className="cursor-pointer font-medium text-teal-700 underline"
            onClick={() =>
              onMatch({ targets: [{ collection: suggestion.collection, ids: suggestion.ids }], confidence: 'exact', note: null })
            }
          >
            Check and use it
          </button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-cy="isa-edit" className={BUTTON} onClick={onEdit}>
          Edit
        </button>
        <button type="button" data-cy="isa-match-edit" className={BUTTON} onClick={() => onMatch()}>
          Match…
        </button>
        <button type="button" data-cy="isa-history" className={BUTTON} onClick={toggleHistory}>
          {history ? 'Hide history' : 'History'}
        </button>
        <button type="button" data-cy="isa-retire" className={`${BUTTON} ml-auto hover:text-red-700`} onClick={onRetire}>
          Retire…
        </button>
      </div>
      {history && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <ChangeList records={history} showTarget={false} emptyText="No changes on the site yet — as imported." />
        </div>
      )}
    </li>
  )
}

/** The match as the stored block describes it, in the shape the API takes. */
function currentMatch(entry: IsaEntry): IsaMatchIn {
  const match = entry.entry.match
  return {
    targets: matchTargets(match).map(t => ({ collection: slugOf(t.gearType ?? ''), ids: [...t.gearIds] })),
    confidence: (CONFIDENCES as string[]).includes(match?.confidence ?? '')
      ? (match!.confidence as IsaMatchIn['confidence'])
      : 'exact',
    note: match?.note || null,
  }
}

function MatchDialog({
  kind,
  entry,
  prefill,
  token,
  onClose,
  onDone,
}: {
  kind: IsaKind
  entry: IsaEntry
  prefill?: IsaMatchIn
  token: string
  onClose: () => void
  onDone: () => void
}) {
  const [match, setMatch] = useState<IsaMatchIn>(() => {
    const base = prefill ?? currentMatch(entry)
    return base.targets.length ? base : { ...base, targets: [{ collection: TARGETS[0].slug, ids: [] }] }
  })
  const [lists, setLists] = useState<Record<string, GearItem[]>>({})
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    for (const t of match.targets) {
      if (lists[t.collection]) continue
      fetchGearList(t.collection)
        .then(items => setLists(current => ({ ...current, [t.collection]: items })))
        .catch(() => setLists(current => ({ ...current, [t.collection]: [] })))
    }
  }, [match.targets, lists])

  const setTarget = (index: number, next: { collection: string; ids: number[] }) =>
    setMatch(m => ({ ...m, targets: m.targets.map((t, i) => (i === index ? next : t)) }))

  const save = async (clear = false) => {
    setBusy(true)
    setError(null)
    try {
      const body: IsaMatchIn = clear
        ? { targets: [], confidence: 'none', note: match.note }
        : { ...match, targets: match.targets.filter(t => t.ids.length) }
      await editIsa(kind, entry.key, { rev: entry.rev, match: body, why: why.trim() || null }, token)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Match ${entry.key}`} onClose={onClose} wide data-cy="isa-match-dialog">
      <p className="text-sm text-gray-600">{entryTitle(kind, entry)}</p>
      {match.targets.map((target, index) => (
        <TargetPicker
          key={index}
          target={target}
          items={lists[target.collection]}
          onChange={next => setTarget(index, next)}
          onRemove={match.targets.length > 1 ? () => setMatch(m => ({ ...m, targets: m.targets.filter((_, i) => i !== index) })) : undefined}
        />
      ))}
      {kind === 'warnings' && (
        <button
          type="button"
          className="mt-2 cursor-pointer text-xs font-medium text-teal-700 underline"
          onClick={() => setMatch(m => ({ ...m, targets: [...m.targets, { collection: TARGETS[0].slug, ids: [] }] }))}
        >
          Also on another gear type
        </button>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-700">
          Confidence
          <select
            data-cy="isa-confidence"
            value={match.confidence}
            onChange={e => setMatch(m => ({ ...m, confidence: e.target.value as IsaMatchIn['confidence'] }))}
            className={`${INPUT} mt-1`}
          >
            {CONFIDENCES.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {kind === 'certificates' && match.confidence !== 'exact' && (
            <span className="mt-1 block text-amber-800">Only an exact match certifies.</span>
          )}
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Note
          <input
            data-cy="isa-match-note"
            value={match.note ?? ''}
            onChange={e => setMatch(m => ({ ...m, note: e.target.value || null }))}
            className={`${INPUT} mt-1`}
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-gray-700">
        Why (optional, public)
        <input data-cy="dialog-why" value={why} onChange={e => setWhy(e.target.value)} className={`${INPUT} mt-1`} />
      </label>
      {error && (
        <p data-cy="dialog-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-cy="isa-unmatch"
          disabled={busy}
          onClick={() => save(true)}
          className="mr-auto cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          Matches nothing
        </button>
        <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          type="button"
          data-cy="dialog-confirm"
          disabled={busy || !match.targets.some(t => t.ids.length)}
          onClick={() => save()}
          className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-default disabled:opacity-50"
        >
          Save match
        </button>
      </div>
    </Modal>
  )
}

function TargetPicker({
  target,
  items,
  onChange,
  onRemove,
}: {
  target: { collection: string; ids: number[] }
  items: GearItem[] | undefined
  onChange: (next: { collection: string; ids: number[] }) => void
  onRemove?: () => void
}) {
  const [query, setQuery] = useState('')
  const label = (id: number) => {
    const item = items?.find(i => i.id === id)
    return item ? `${item.brand_name} ${item.name}` : `#${id}`
  }
  const needle = query.trim().toLowerCase()
  const results = needle
    ? (items ?? [])
        .filter(i => !target.ids.includes(i.id) && `${i.brand_name} ${i.name} ${i.id}`.toLowerCase().includes(needle))
        .slice(0, 8)
    : []
  return (
    <div data-cy="isa-target" className="mt-4 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <select
          data-cy="isa-target-type"
          value={target.collection}
          onChange={e => onChange({ collection: e.target.value, ids: [] })}
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
        >
          {TARGETS.map(t => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          data-cy="isa-target-search"
          placeholder={`Find ${getGearType(target.collection)?.label.toLowerCase() ?? 'products'} by brand or name`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
        {onRemove && (
          <button type="button" onClick={onRemove} className="cursor-pointer text-xs text-gray-500 hover:text-red-700">
            Remove
          </button>
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-100">
          {results.map(i => (
            <li key={i.id}>
              <button
                type="button"
                data-cy="isa-target-result"
                onClick={() => {
                  onChange({ ...target, ids: [...target.ids, i.id] })
                  setQuery('')
                }}
                className="w-full cursor-pointer px-2 py-1 text-left text-sm hover:bg-teal-50"
              >
                {i.brand_name} {i.name} <span className="text-xs text-gray-400">#{i.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-2 flex flex-wrap gap-1">
        {target.ids.map(id => (
          <li key={id} data-cy="isa-target-chosen" className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-900">
            {label(id)}
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange({ ...target, ids: target.ids.filter(x => x !== id) })}
              className="cursor-pointer text-teal-700 hover:text-red-700"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RetireDialog({
  kind,
  entry,
  token,
  onClose,
  onDone,
}: {
  kind: IsaKind
  entry: IsaEntry
  token: string
  onClose: () => void
  onDone: () => void
}) {
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={`Retire ${entry.key}`} onClose={onClose} data-cy="isa-retire-dialog">
      <form
        onSubmit={async event => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await retireIsa(kind, entry.key, entry.rev, why.trim(), token)
            onDone()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not retire it.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className="text-sm text-gray-600">
          {entryTitle(kind, entry)} leaves the catalogue: whatever it certified or warned about no longer shows it. It
          stays in the log.
        </p>
        <label className="mt-3 block text-xs font-medium text-gray-700">
          Why * (public)
          <input data-cy="dialog-why" value={why} onChange={e => setWhy(e.target.value)} className={`${INPUT} mt-1`} />
        </label>
        {error && (
          <p data-cy="dialog-error" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="submit"
            data-cy="dialog-confirm"
            disabled={busy || !why.trim()}
            className="cursor-pointer rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-default disabled:opacity-50"
          >
            Retire
          </button>
        </div>
      </form>
    </Modal>
  )
}
