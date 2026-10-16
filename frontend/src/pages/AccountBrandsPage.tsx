// "Your brands" — the brands a person represents, each with its machine API
// keys (phase 5, D64), and the requests they have made (D5). Keys are shown in
// full, any time: whoever represents the brand may need to configure an
// integration again. Creating, regenerating and revoking are public, logged
// changes that name the key's id, never its secret.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { changeKey, createKey, fetchKeys, fetchMyRequests } from '@/api/brandLinks'
import { useSiteAuth } from '@/auth/AuthContext'
import type { BrandKey, BrandRequest } from '@/types/brandLinks'

function message(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Could not reach the API.'
}

const SMALL =
  'cursor-pointer rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-teal-600 disabled:opacity-50'

function BrandKeys({ catalogId, name, token }: { catalogId: number; name: string; token: string }) {
  const [keys, setKeys] = useState<BrandKey[] | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setKeys(await fetchKeys(catalogId, token))
    } catch (caught) {
      setError(message(caught))
    }
  }, [catalogId, token])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-cy="account-brand" data-brand={catalogId} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">
        <Link to={`/manufacturers/${catalogId}`} className="hover:text-teal-700">
          {name}
        </Link>
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        API keys let {name}'s own systems update its gear through the{' '}
        <Link to="/for-manufacturers" className="text-teal-700 hover:underline">
          manufacturer API
        </Link>
        . Updates sent with a key apply at once, as yours do.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-3 space-y-2">
        {(keys ?? []).map(key => (
          <li key={key.client_id} data-cy="brand-key" data-active={String(key.active)} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-gray-500">{key.client_id}</span>
              {key.note && <span className="text-gray-700">{key.note}</span>}
              {!key.active && <span className="rounded-full bg-gray-100 px-2 text-xs text-gray-600">revoked</span>}
              <span className="ml-auto text-xs text-gray-400">{new Date(key.created_at).toLocaleDateString()}</span>
            </div>
            {key.active && key.key && (
              <code data-cy="brand-key-value" className="mt-2 block overflow-x-auto rounded bg-gray-50 p-2 font-mono text-xs break-all text-gray-800">
                {key.key}
              </code>
            )}
            <div className="mt-2 flex gap-2">
              {key.active && key.key && (
                <button type="button" className={SMALL} onClick={() => void navigator.clipboard?.writeText(key.key!)}>
                  Copy
                </button>
              )}
              <button
                type="button"
                data-cy="brand-key-regenerate"
                disabled={busy}
                className={SMALL}
                onClick={() => {
                  if (window.confirm('The old secret stops working at once. Continue?')) {
                    void run(() => changeKey(catalogId, key.client_id, 'regenerate', token))
                  }
                }}
              >
                {key.active ? 'New secret' : 'Reactivate with a new secret'}
              </button>
              {key.active && (
                <button
                  type="button"
                  data-cy="brand-key-revoke"
                  disabled={busy}
                  className={SMALL}
                  onClick={() => {
                    if (window.confirm('This key stops working at once. Continue?')) {
                      void run(() => changeKey(catalogId, key.client_id, 'revoke', token))
                    }
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {keys && keys.length === 0 && <p className="mt-2 text-sm text-gray-500">No keys yet.</p>}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={event => {
          event.preventDefault()
          void run(async () => {
            await createKey(catalogId, note.trim() || null, token)
            setNote('')
          })
        }}
      >
        <input
          data-cy="brand-key-note"
          value={note}
          maxLength={200}
          onChange={e => setNote(e.target.value)}
          placeholder="What it is for (optional)"
          className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          data-cy="brand-key-create"
          disabled={busy}
          className="cursor-pointer rounded-full bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          New key
        </button>
      </form>
    </section>
  )
}

export default function AccountBrandsPage() {
  const auth = useSiteAuth()
  const token = auth.token
  const [requests, setRequests] = useState<BrandRequest[]>([])

  useEffect(() => {
    if (!token) return
    fetchMyRequests(token)
      .then(setRequests)
      .catch(() => setRequests([]))
  }, [token])

  if (!token || !auth.me) {
    return (
      <div data-cy="account-brands-signin" className="mx-auto max-w-md px-4 py-20 text-center text-gray-600">
        Sign in to see the brands you represent.
      </div>
    )
  }
  const brands = auth.me.brands
  return (
    <div data-cy="account-brands" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Your brands</h1>
      {brands.length === 0 && (
        <p data-cy="account-brands-none" className="text-sm text-gray-600">
          You do not represent a brand yet. Open your brand's page under{' '}
          <Link to="/manufacturers" className="text-teal-700 hover:underline">
            Manufacturers
          </Link>{' '}
          and choose <em>I represent this brand</em>; an admin will look at your request.
        </p>
      )}
      {brands.map(brand => (
        <BrandKeys key={brand.catalog_id} catalogId={brand.catalog_id} name={brand.name} token={token} />
      ))}
      {requests.length > 0 && (
        <section data-cy="account-requests">
          <h2 className="text-base font-semibold text-gray-900">Your requests</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {requests.map(r => (
              <li key={r.request_id} data-cy="account-request" data-status={r.status}>
                {r.brand_name}: <span className="font-medium">{r.status}</span>
                {r.decision_note && <span className="text-gray-600"> — “{r.decision_note}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
