// The signed-in person, in the top nav. Renders nothing for anonymous visitors:
// in live editing's phase 1 only admins have anything to do once signed in, and
// they sign in from /admin. A "Sign in" button for everyone arrives with editing
// (LIVE_EDITING_PLAN.md § 13).

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSiteAuth } from '@/auth/AuthContext'
import { MAX_NAME_LENGTH } from './name'

export default function AccountMenu() {
  const auth = useSiteAuth()
  const [open, setOpen] = useState(false)
  // The name being edited, or null when not editing.
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open) {
      setDraft(null)
      setError(null)
    }
  }, [open])

  if (!auth.me) return null

  const saveName = async () => {
    const name = draft?.trim()
    if (!name) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await auth.changeName(name)
      setDraft(null)
    } catch {
      setError('Could not save that — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const initials = auth.me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-cy="account-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title={auth.me.name}
        onClick={() => setOpen(value => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800"
      >
        {initials || '?'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          <p data-cy="account-name" className="px-2 py-1 text-sm font-medium text-gray-900">
            {auth.me.name}
          </p>
          <p className="px-2 pb-2 text-xs text-gray-500">
            {auth.me.isa_id}
            {auth.isAdmin ? ' · admin' : ''}
            {auth.me.dev ? ' · local dev' : ''}
          </p>
          {draft === null ? (
            <button
              type="button"
              role="menuitem"
              data-cy="account-change-name"
              onClick={() => setDraft(auth.me?.name_set ? auth.me.name : '')}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Change name
            </button>
          ) : (
            <form
              data-cy="account-name-form"
              className="px-2 py-1.5"
              onSubmit={event => {
                event.preventDefault()
                void saveName()
              }}
            >
              <label className="block text-xs text-gray-500">
                Shown with every change you made
                <input
                  data-cy="account-name-input"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  maxLength={MAX_NAME_LENGTH}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
                />
              </label>
              {error && (
                <p data-cy="account-name-error" className="mt-1 text-xs text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-full px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-cy="account-name-save"
                  disabled={saving || !draft.trim()}
                  className="rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          )}
          {auth.isAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              data-cy="account-admin-link"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            data-cy="account-signout"
            onClick={() => {
              setOpen(false)
              auth.signOut()
            }}
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
