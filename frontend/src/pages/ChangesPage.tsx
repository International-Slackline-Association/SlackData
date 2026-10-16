// Recent Changes — every change to SlackData, newest first, public (D3, D33).
// Filters: the kind of change and the role it was made in, applied to the
// pages fetched; "safety changes only" asks the API for the safety changes
// (D57), which have their own index. Both feeds are linked for a feed reader.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '@/api/client'
import { fetchChanges } from '@/api/people'
import ChangeList from '@/components/edit/ChangeList'
import type { ChangeRecordPublic } from '@/types'

const PAGE = 50

const KINDS: { value: string; label: string; match: (r: ChangeRecordPublic) => boolean }[] = [
  { value: '', label: 'All kinds', match: () => true },
  { value: 'edit', label: 'Edits', match: r => r.action === 'item.edit' || r.action === 'brand.edit' },
  { value: 'create', label: 'New items and brands', match: r => r.action === 'item.create' || r.action === 'brand.create' },
  { value: 'merge', label: 'Merges', match: r => r.action === 'item.merge' },
  { value: 'revert', label: 'Reverts', match: r => r.action === 'item.revert' },
  { value: 'roles', label: 'Roles, brand links and blocks', match: r => r.target_type === 'person' },
  { value: 'keys', label: 'API keys', match: r => r.action.startsWith('key.') },
  { value: 'isa', label: 'ISA certificates and warnings', match: r => r.target_type.startsWith('isa_') },
]

const SELECT = 'rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-teal-700 focus:outline-none'

export default function ChangesPage() {
  const [records, setRecords] = useState<ChangeRecordPublic[]>([])
  const [safety, setSafety] = useState(false)
  const [kind, setKind] = useState('')
  const [role, setRole] = useState('')
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    (before?: string) => {
      setLoading(true)
      setError(null)
      fetchChanges({ limit: PAGE, before, flag: safety ? 'safety' : undefined })
        .then(page => {
          setRecords(current => (before ? [...current, ...page] : page))
          setMore(page.length === PAGE)
        })
        .catch(() => setError('Could not load the change log.'))
        .finally(() => setLoading(false))
    },
    [safety],
  )

  useEffect(() => load(), [load])

  const roles = useMemo(() => [...new Set(records.map(r => r.actor_role))].sort(), [records])
  const shown = records.filter(r => (KINDS.find(k => k.value === kind)?.match(r) ?? true) && (!role || r.actor_role === role))

  return (
    <div data-cy="changes-page" className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900">Recent changes</h1>
      <p className="mt-1 text-sm text-gray-600">
        Every change to SlackData, who made it, and why — public and kept permanently. Follow it in a feed reader:{' '}
        <a data-cy="feed-all" href={`${API_BASE}/changes/feed.atom`} className="text-teal-700 underline">
          all changes
        </a>{' '}
        ·{' '}
        <a data-cy="feed-safety" href={`${API_BASE}/changes/safety.atom`} className="text-teal-700 underline">
          safety changes
        </a>{' '}
        (breaking strengths, and the ISA's certificates and warnings)
        .
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select data-cy="changes-kind" aria-label="Kind of change" className={SELECT} value={kind} onChange={e => setKind(e.target.value)}>
          {KINDS.map(k => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select data-cy="changes-role" aria-label="Role" className={SELECT} value={role} onChange={e => setRole(e.target.value)}>
          <option value="">Any role</option>
          {roles.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input data-cy="changes-safety" type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} />
          Safety changes only
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-6 py-2 shadow-sm">
        {error ? <p className="py-4 text-sm text-red-700">{error}</p> : <ChangeList records={shown} />}
      </div>
      {more && !loading && (
        <button
          type="button"
          data-cy="changes-more"
          onClick={() => load(records[records.length - 1]?.id)}
          className="mt-3 cursor-pointer text-sm font-medium text-teal-700 hover:underline"
        >
          Older changes
        </button>
      )}
      {loading && <p className="mt-3 text-sm text-gray-400">Loading…</p>}
    </div>
  )
}
