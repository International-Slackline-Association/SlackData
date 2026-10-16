// Who the admins are, and granting or revoking the role — on the admin page.
//
// Every grant and revocation is a logged change, public in the change log
// (LIVE_EDITING_PLAN.md D7). The person must have signed in to SlackData once,
// so that the API knows their account; granting by email counts only a
// verified address. The API refuses to revoke the last admin.

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { changeRole, fetchAdmins } from '@/api/people'
import type { AdminSummary } from '@/types'

function message(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Could not reach the API.'
}

export default function AdminsPanel({ token }: { token: string }) {
  const [admins, setAdmins] = useState<AdminSummary[]>([])
  const [email, setEmail] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setAdmins(await fetchAdmins(token))
    } catch (caught) {
      setError(message(caught))
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (change: Parameters<typeof changeRole>[1]) => {
    setBusy(true)
    setError(null)
    try {
      await changeRole(token, change)
      await load()
      return true
    } catch (caught) {
      setError(message(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  const grant = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return
    if (await run({ email: email.trim(), grant: true, why: why.trim() || undefined })) {
      setEmail('')
      setWhy('')
    }
  }

  return (
    <section data-cy="admins-panel" className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-lg font-semibold text-gray-900">Admins</h2>
      <p className="mt-1 text-sm text-gray-600">
        Granting or revoking admin is recorded publicly in the change log, with your name.
      </p>

      <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {admins.map(admin => (
          <li
            key={admin.isa_id}
            data-cy="admins-row"
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
          >
            <span>
              <span className="font-medium text-gray-900">{admin.name}</span>{' '}
              <span className="text-gray-500">
                {admin.isa_id}
                {admin.email ? ` · ${admin.email}` : ''}
              </span>
            </span>
            <button
              type="button"
              data-cy="admins-revoke"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Revoke admin from ${admin.name}?`)) {
                  void run({ isa_id: admin.isa_id, grant: false })
                }
              }}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-gray-400 disabled:opacity-60"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={grant} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-60 flex-1 flex-col text-sm text-gray-700">
          Grant admin to (their verified ISA email)
          <input
            type="email"
            data-cy="admins-grant-email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex min-w-60 flex-1 flex-col text-sm text-gray-700">
          Why (optional, public)
          <input
            type="text"
            data-cy="admins-grant-why"
            value={why}
            maxLength={2000}
            onChange={event => setWhy(event.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          data-cy="admins-grant"
          disabled={busy || !email.trim()}
          className="rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          Grant
        </button>
      </form>

      {error && (
        <p data-cy="admins-error" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  )
}
