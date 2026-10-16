// Blocking an account from editing — admins only (D22, LIVE_EDITING_PHASE_6.md
// P6-D). Two places: Block / Unblock on the person's contributions page, where
// the admin has just read what they did; and the list of blocked accounts on
// /admin. A reason is required either way, and it is public: the block is a
// record in the change log, like a role grant.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlocked, setBlocked } from '@/api/people'
import { useSiteAuth } from '@/auth/AuthContext'
import type { BlockedSummary } from '@/types'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none'
const BUTTON =
  'cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50'

function useBlocked(token: string | null, enabled: boolean) {
  const [blocked, setList] = useState<BlockedSummary[] | null>(null)
  const reload = useCallback(() => {
    if (!token || !enabled) return
    fetchBlocked(token)
      .then(setList)
      .catch(() => setList([]))
  }, [token, enabled])
  useEffect(reload, [reload])
  return { blocked, reload }
}

function ReasonForm({
  label,
  confirm,
  danger,
  onSubmit,
}: {
  label: string
  confirm: string
  danger: boolean
  onSubmit: (why: string) => Promise<void>
}) {
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="mt-2"
      onSubmit={async event => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await onSubmit(why.trim())
          setWhy('')
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'That did not work.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="block text-xs font-medium text-gray-700">
        {label}
        <input data-cy="block-why" value={why} onChange={e => setWhy(e.target.value)} className={`${INPUT} mt-1`} />
      </label>
      {error && (
        <p data-cy="block-error" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        data-cy="block-confirm"
        disabled={busy || !why.trim()}
        className={`${BUTTON} mt-2 ${danger ? 'bg-red-700 hover:bg-red-800' : 'bg-teal-700 hover:bg-teal-800'}`}
      >
        {confirm}
      </button>
    </form>
  )
}

/** On a person's contributions page: block them, or lift a block. */
export function BlockControl({ isaId, onChanged }: { isaId: string; onChanged: () => void }) {
  const auth = useSiteAuth()
  const { blocked, reload } = useBlocked(auth.token, auth.isAdmin)
  const [open, setOpen] = useState(false)
  if (!auth.isAdmin || !auth.token || blocked === null) return null
  const token = auth.token
  const entry = blocked.find(b => b.isa_id === isaId)
  const done = () => {
    setOpen(false)
    reload()
    onChanged()
  }

  if (entry) {
    return (
      <div data-cy="person-blocked" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        Blocked from editing{entry.blocked_reason ? `: ${entry.blocked_reason}` : ''}.
        <ReasonForm
          label="Why lift the block? (public)"
          confirm="Unblock"
          danger={false}
          onSubmit={async why => {
            await setBlocked(token, isaId, false, why)
            done()
          }}
        />
      </div>
    )
  }
  if (isaId === auth.me?.isa_id) return null
  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          data-cy="person-block"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-sm font-medium text-red-700 underline-offset-2 hover:underline"
        >
          Block from editing…
        </button>
      ) : (
        <div data-cy="block-form" className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          They can still read and sign in, but not save, upload or ask to represent a brand. The block and its reason
          are public in the change log.
          <ReasonForm
            label="Reason (public) *"
            confirm="Block"
            danger
            onSubmit={async why => {
              await setBlocked(token, isaId, true, why)
              done()
            }}
          />
        </div>
      )}
    </div>
  )
}

/** On /admin: every blocked account, with why and a link to what they did. */
export function BlockedPanel() {
  const auth = useSiteAuth()
  const { blocked } = useBlocked(auth.token, auth.isAdmin)
  if (!auth.isAdmin || blocked === null) return null
  return (
    <section data-cy="blocked-panel" className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Blocked accounts</h2>
      <p className="mt-1 text-xs text-gray-500">
        Blocked from editing by an admin (D22). Unblock from the person&apos;s page, giving a reason.
      </p>
      {blocked.length === 0 ? (
        <p data-cy="blocked-empty" className="mt-3 text-sm text-gray-500">
          Nobody is blocked.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {blocked.map(b => (
            <li key={b.isa_id} data-cy="blocked-person" className="py-2 text-sm">
              <Link to={`/people/${b.isa_id}`} className="font-medium text-teal-700 hover:underline">
                {b.name}
              </Link>{' '}
              <span className="text-gray-500">
                {b.isa_id}
                {b.blocked_at ? ` · since ${b.blocked_at.slice(0, 10)}` : ''}
                {b.blocked_by ? ` · by ${b.blocked_by}` : ''}
              </span>
              {b.blocked_reason && <p className="text-gray-700">{b.blocked_reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
