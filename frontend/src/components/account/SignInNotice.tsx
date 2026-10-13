// The notice the ISA made its condition for showing names (LIVE_EDITING_PHASE_0.md
// § 1): people are told, at their first sign-in, that their full name is shown
// publicly with every change they make. Shown until acknowledged — then
// `notice_seen_at` is set on the server and it never appears again.
//
// It is also where people type in that name: the ISA token gives SlackData none
// (slack_data/models/people.py), so someone who has acknowledged the notice
// but not yet given a name sees it again until they do.
//
// It informs; it is not a gate. The API does not refuse a person who has not
// pressed the button, so closing the tab costs nothing but seeing it again.

import { useId, useState } from 'react'
import { useSiteAuth } from '@/auth/AuthContext'
import type { Me } from '@/types'
import { MAX_NAME_LENGTH, suggestedName } from './name'

// The address the site already publishes for manufacturers (ManufacturerApiPage).
const CONTACT_EMAIL = 'emile@slacklineinternational.org'

export default function SignInNotice() {
  const auth = useSiteAuth()
  if (!auth.me || (auth.me.notice_seen_at && auth.me.name_set)) return null
  // Keyed by account, so a different sign-in starts from its own name.
  return <NoticeDialog key={auth.me.sub} me={auth.me} />
}

function NoticeDialog({ me }: { me: Me }) {
  const auth = useSiteAuth()
  const titleId = useId()
  const nameId = useId()
  const [name, setName] = useState(() => suggestedName(me))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()

  const acknowledge = async () => {
    if (!trimmed) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await auth.acknowledgeNotice(trimmed)
    } catch {
      setError('Could not save that — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <form
        data-cy="sign-in-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={event => {
          event.preventDefault()
          void acknowledge()
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          Your name is shown with your changes
        </h2>
        <div className="mt-3 space-y-3 text-sm text-gray-700">
          <p>
            You&apos;re signed in to SlackData with your ISA account{' '}
            <span className="font-medium text-gray-900">{me.isa_id}</span>.
          </p>
          <p>
            Every change made on SlackData is recorded publicly and kept permanently: who made it —
            the name you enter below, and your ISA id — when, and what it changed. The record is
            also published in a daily public copy of the data.
          </p>
          <p>
            If you later want your name removed, write to{' '}
            <a className="text-teal-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . It is then replaced by &ldquo;former contributor&rdquo; on the site and in the public copy;
            copies other people already made may still contain it.
          </p>
        </div>
        <label htmlFor={nameId} className="mt-5 block text-sm font-medium text-gray-900">
          Your full name
        </label>
        <input
          id={nameId}
          data-cy="sign-in-notice-name"
          type="text"
          autoComplete="name"
          autoFocus
          required
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={event => setName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
        <p className="mt-1 text-xs text-gray-500">You can change it later from the account menu.</p>
        {error && (
          <p data-cy="sign-in-notice-error" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            data-cy="sign-in-notice-ok"
            disabled={saving || !trimmed}
            className="rounded-full bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            I understand
          </button>
        </div>
      </form>
    </div>
  )
}
