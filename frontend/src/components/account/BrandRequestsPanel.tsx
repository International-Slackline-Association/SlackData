// "I represent this brand" requests waiting for an admin — on the admin page
// (phase 5, D5). Oldest first. Each shows who asked, their note, and whether
// their verified email's domain is the brand's website: a signal, never the
// decision. Approving links them to the brand, which is a public, logged
// change; declining closes the request.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { decideRequest, fetchPendingRequests } from '@/api/brandLinks'
import type { BrandRequestAdmin } from '@/types/brandLinks'

function message(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Could not reach the API.'
}

export default function BrandRequestsPanel({ token }: { token: string }) {
  const [requests, setRequests] = useState<BrandRequestAdmin[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRequests(await fetchPendingRequests(token))
    } catch (caught) {
      setError(message(caught))
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (request: BrandRequestAdmin, decision: 'approve' | 'decline') => {
    setBusy(request.request_id)
    setError(null)
    try {
      await decideRequest(request.request_id, decision, notes[request.request_id]?.trim() || null, token)
      await load()
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section data-cy="brand-requests" className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">
        Brand requests{requests && requests.length > 0 ? ` (${requests.length})` : ''}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        People asking to represent a brand. Once approved they edit that brand's gear and manage its API keys.
      </p>
      {error && (
        <p data-cy="brand-requests-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {requests && requests.length === 0 && (
        <p data-cy="brand-requests-empty" className="mt-3 text-sm text-gray-500">
          No requests waiting.
        </p>
      )}
      <ul className="mt-3 space-y-4">
        {(requests ?? []).map(request => (
          <li key={request.request_id} data-cy="brand-request" className="rounded-lg border border-gray-200 p-3 text-sm">
            <p>
              <Link to={`/people/${request.isa_id}`} className="font-medium text-gray-900 hover:text-teal-700">
                {request.person_name}
              </Link>{' '}
              asks to represent{' '}
              <Link to={`/manufacturers/${request.catalog_id}`} className="font-medium text-teal-700 hover:underline">
                {request.brand_name}
              </Link>
              <span className="ml-2 text-xs text-gray-400">{new Date(request.created_at).toLocaleString()}</span>
            </p>
            <p data-cy="brand-request-signal" className="mt-1 text-xs">
              {request.email_domain_matches ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                  Email on the brand's domain ({request.email_domain})
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                  Email domain {request.email_domain ?? 'unknown'}
                  {request.email_verified ? '' : ' (not verified)'} · brand site {request.brand_website ?? 'unknown'}
                </span>
              )}
            </p>
            {request.note && <p className="mt-2 text-gray-700">“{request.note}”</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                data-cy="brand-request-note"
                placeholder="Note (optional, public on approval)"
                value={notes[request.request_id] ?? ''}
                onChange={e => setNotes({ ...notes, [request.request_id]: e.target.value })}
                className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                data-cy="brand-request-approve"
                disabled={busy !== null}
                onClick={() => void decide(request, 'approve')}
                className="cursor-pointer rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                data-cy="brand-request-decline"
                disabled={busy !== null}
                onClick={() => void decide(request, 'decline')}
                className="cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-red-400 hover:text-red-700 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
