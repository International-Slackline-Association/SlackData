// Admin triage. See DESIGN.md § Admin Triage.
//
// **This page is not access control.** Every route it calls is guarded
// server-side by `require_admin` (slack_data/api/auth.py); hiding the UI would
// be cosmetic, and `tests/test_auth.py` asserts the server-side half. What this
// page does is make a queue reviewable.
//
// Since live editing phase 6 the anonymous suggestion box is closed (D56):
// anyone with an ISA account edits. What is left in the queue is what the box
// stored before it closed, and manufacturers' photo links (P5-H). Each is
// handled the same way (P6-G): open the item, make the change live, then mark
// the row handled. No JSON patch is applied by hand any more.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSubmissions, reviewSubmission } from '@/api/submissions'
import { useSiteAuth } from '@/auth/AuthContext'
import AdminsPanel from '@/components/account/AdminsPanel'
import BrandRequestsPanel from '@/components/account/BrandRequestsPanel'
import { BlockedPanel } from '@/components/account/Blocking'
import { fieldLabel } from '@/config/correctableFields'
import { getGearType } from '@/config/gearTypes'
import type { Submission, SubmissionStatus } from '@/types'
import { relativeAge } from '@/utils/age'
import { batchBrand, groupByBatch, type SubmissionGroup } from '@/utils/batches'
import { photoLabel } from '@/utils/photoLinks'

// The queue is what still needs doing, and nothing else: suggestions sent
// before the box closed (`pending`) and manufacturers' updates whose photos
// are still to add (`approved`). Handled and rejected rows are done; their
// outcome stays on the record.
const OPEN: SubmissionStatus[] = ['pending', 'approved']

// Matches the default the API applies; it caps `limit` at 100 (MAX_LIST_LIMIT
// in submissions_router.py). The queue is meant to be worked from the top, so
// this is a page rather than a scroll — but a full page has to say so.
const PAGE_SIZE = 50

// Above this, a manufacturer's batch renders collapsed. A brand refreshing a
// forty-product line would otherwise push every other submission off the
// screen, and the queue is meant to be worked from the top.
const COLLAPSE_BATCH_OVER = 5

/** A full page of either status means more are waiting past it. */
function pagesFull(rows: Submission[]): boolean {
  return OPEN.some(status => rows.filter(r => r.status === status).length >= PAGE_SIZE)
}

export default function AdminPage() {
  const auth = useSiteAuth()
  const { token, isAuthenticated, isAdmin } = auth

  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const pages = await Promise.all(OPEN.map(status => fetchSubmissions(token, status, PAGE_SIZE)))
      // Oldest first across both: the id is a ULID, so it sorts by creation.
      setRows(pages.flat().sort((a, b) => a.submission_id.localeCompare(b.submission_id)))
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? `${caught.status}: ${caught.message}`
          : 'Could not reach the API.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  if (auth.isLoading) {
    return <p className="p-8 text-sm text-gray-600">Signing in…</p>
  }

  if (!isAuthenticated) {
    return <LoginPrompt />
  }

  if (!auth.me) {
    // Signed in, and still asking the API who this is — or it could not say.
    return auth.error ? <LoginPrompt /> : <p className="p-8 text-sm text-gray-600">Signing in…</p>
  }

  if (!isAdmin) {
    return (
      <div data-cy="admin-not-admin" className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Not an admin</h1>
        <p className="mt-2 text-sm text-gray-600">
          You&apos;re signed in as {auth.me.name}, and this account does not hold the admin role.
          An existing admin can grant it.
        </p>
      </div>
    )
  }

  return (
    <div data-cy="admin-page" className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triage</h1>
          <p className="mt-1 text-sm text-gray-600">
            Oldest first. The public suggestion box is closed — anyone with an ISA account edits now. Left here:
            suggestions sent before it closed, and photos manufacturers sent as links. Open the item, make the
            change, then mark it handled.
          </p>
        </div>
        <button
          type="button"
          data-cy="admin-signout"
          onClick={auth.signOut}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400"
        >
          Sign out
        </button>
      </header>

      {auth.mode === 'dev' && (
        <p
          data-cy="admin-dev-mode"
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Local development mode — the token comes from session storage, not from an ISA sign-in.
          The API still decides whether it is valid.
        </p>
      )}

      {error && (
        <p data-cy="admin-error" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {!loading && !error && rows.length === 0 && (
        <p data-cy="admin-empty" className="mt-10 text-center text-gray-500">
          Nothing waiting.
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {/*
          Grouped, never re-sorted. A manufacturer's one call wrote one row per
          product; forty rows carrying the same brand and timestamp is the
          unusable rendering of that. See utils/batches.ts.
        */}
        {groupByBatch(rows).map(group =>
          group.batchId ? (
            <BatchGroup key={group.key} group={group} token={token!} onReviewed={load} />
          ) : (
            <SubmissionRow
              key={group.key}
              submission={group.rows[0]}
              token={token!}
              onReviewed={load}
            />
          ),
        )}
      </ul>

      {pagesFull(rows) && (
        // A full page means the queue is longer than the page. Saying nothing
        // here reads as "that's all of them", which is how a backlog goes
        // unnoticed — the list is capped at the API's limit, not by the data.
        <p data-cy="admin-more" className="mt-6 text-center text-sm text-gray-500">
          Showing the oldest {PAGE_SIZE}. More are waiting — work from the top.
        </p>
      )}

      <BrandRequestsPanel token={token!} />
      <BlockedPanel />
      <AdminsPanel token={token!} />
    </div>
  )
}

function LoginPrompt() {
  const auth = useSiteAuth()
  return (
    <div data-cy="admin-login" className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Admin sign-in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Sign in with your ISA account. Triage is for SlackData admins — signing in here only renders
        the page; the API checks the admin role on every request.
      </p>
      {auth.error && (
        <p data-cy="admin-login-error" className="mt-4 text-sm text-red-700">
          {auth.error}
        </p>
      )}
      <button
        type="button"
        data-cy="admin-signin"
        onClick={() => auth.signIn('/admin')}
        className="mt-6 rounded-full bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
      >
        Sign in
      </button>
    </div>
  )
}

/**
 * One manufacturer call, rendered as one thing.
 *
 * The rows inside are still individual submissions and are still reviewed one
 * at a time — that is deliberate, because the unit of work is one product's
 * JSON patch, not a wall of forty. What the group adds is the context that
 * makes the queue readable: who sent them, how many, and when, once rather
 * than forty times.
 *
 * Collapsed by default past a handful of items. A brand refreshing their whole
 * line would otherwise push every other submission off the screen, and the
 * queue is meant to be worked from the top.
 */
function BatchGroup({
  group,
  token,
  onReviewed,
}: {
  group: SubmissionGroup
  token: string
  onReviewed: () => void
}) {
  const count = group.rows.length
  const [open, setOpen] = useState(count <= COLLAPSE_BATCH_OVER)
  const brand = batchBrand(group)
  const first = group.rows[0]

  return (
    <li
      data-cy="submission-batch"
      data-batch={group.batchId}
      data-count={count}
      className="rounded-xl border border-teal-200 bg-teal-50/50 p-4"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <ManufacturerBadge />
        <h2 className="font-semibold text-gray-900">{brand ?? 'A manufacturer'}</h2>
        <span className="text-sm text-gray-600">
          {count} {count === 1 ? 'product' : 'products'} in one submission
        </span>
        <span className="ml-auto text-sm text-gray-500">{relativeAge(first.created_at)}</span>
      </div>

      <p className="mt-1 text-sm text-teal-900">
        Sent by the manufacturer and applied as it arrived — only the photos they linked are left to add.
      </p>

      <button
        type="button"
        data-cy="batch-toggle"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="mt-2 cursor-pointer text-sm font-medium text-teal-800 hover:text-teal-900"
      >
        {open ? 'Hide' : `Show ${count} ${count === 1 ? 'product' : 'products'}`}
      </button>

      {open && (
        <ul className="mt-3 space-y-3">
          {group.rows.map(row => (
            <SubmissionRow
              key={row.submission_id}
              submission={row}
              token={token}
              onReviewed={onReviewed}
              inBatch
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function ManufacturerBadge() {
  return (
    <span
      data-cy="manufacturer-badge"
      className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-teal-900 uppercase"
    >
      Manufacturer
    </span>
  )
}

function SubmissionRow({
  submission,
  token,
  onReviewed,
  inBatch = false,
}: {
  submission: Submission
  token: string
  onReviewed: () => void
  /** Inside a BatchGroup the brand and the manufacturer badge are already in
   *  the header — repeating them on every row is noise, not information. */
  inBatch?: boolean
}) {
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = getGearType(submission.gear_type)
  const isManufacturer = submission.kind === 'manufacturer'
  // A manufacturer submission that resolved to no row of theirs is a product we
  // do not hold — the same "new item" it would be from anyone else, and the
  // admin's job on it is different (add an entry, not edit one).
  const isNew = submission.kind === 'new_item' || (isManufacturer && submission.gear_id === null)

  async function review(status: 'applied' | 'rejected') {
    setBusy(true)
    setError(null)
    try {
      await reviewSubmission(token, submission.submission_id, {
        status,
        review_note: reviewNote || (status === 'applied' ? 'handled on the site' : null),
      })
      onReviewed()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Review failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li data-cy="submission-row" data-id={submission.submission_id} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {isManufacturer && !inBatch && <ManufacturerBadge />}
        {isNew && (
          <span data-cy="new-item-badge" className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-red-800 uppercase">
            New item
          </span>
        )}
        <h2 className="font-semibold text-gray-900">
          {submission.gear_id && meta ? (
            <Link to={`/${submission.gear_type}/${submission.gear_id}`} className="hover:text-teal-700">
              {submission.gear_name ?? `#${submission.gear_id}`}
            </Link>
          ) : (
            (submission.gear_name ?? 'Unnamed')
          )}
        </h2>
        {submission.gear_brand && !inBatch && (
          // Shown because this, with the name, is what actually identifies the
          // item — the id drifts when the seed JSON is reordered.
          <span data-cy="submission-row-brand" className="text-sm font-medium text-gray-600">
            {submission.gear_brand}
          </span>
        )}
        {submission.manufacturer_sku && (
          // Their part number. It matches nothing in our data yet — it is here
          // so it can be copied into the *.json alongside the rest of the patch,
          // which is what eventually makes ids stop mattering.
          <span data-cy="submission-row-sku" className="font-mono text-xs text-gray-500">
            {submission.manufacturer_sku}
          </span>
        )}
        <span className="text-sm text-gray-500">{meta?.label ?? submission.gear_type}</span>
        <span className="ml-auto text-sm text-gray-500">{relativeAge(submission.created_at)}</span>
      </div>

      {Object.keys(submission.changes).length > 0 && (
        <dl className="mt-3 space-y-1">
          {Object.entries(submission.changes).map(([field, value]) => (
            <div key={field} data-cy="change-entry" data-field={field} className="flex flex-wrap gap-x-2 text-sm">
              <dt className="font-medium text-gray-700">{fieldLabel(submission.gear_type, field)}</dt>
              <dd className="text-gray-900">
                <span className="font-mono text-teal-800">{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {submission.note && (
        <p data-cy="submission-row-note" className="mt-3 text-sm text-gray-700">
          {submission.note}
        </p>
      )}

      {submission.source_url && (
        <a
          data-cy="submission-row-source"
          href={submission.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-teal-700 hover:text-teal-800"
        >
          Evidence link ↗
        </a>
      )}

      {submission.image_urls.length > 0 && (
        // Links, not thumbnails: a thumbnail would load a third-party resource
        // in the admin's browser the moment the queue renders, and the link
        // shows exactly the URL the brand sent.
        <div data-cy="submission-row-images" className="mt-3 text-sm">
          <p className="font-medium text-gray-700">
            Photos ({submission.image_urls.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {submission.image_urls.map(url => (
              <li key={url}>
                <a
                  data-cy="submission-row-image"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                  className="break-all text-teal-700 hover:text-teal-800"
                >
                  {photoLabel(url)} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(submission.status === 'pending' || submission.status === 'approved') && (
        <OpenItem submission={submission} isNew={isNew} />
      )}

      {(submission.status === 'pending' || submission.status === 'approved') && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            data-cy="review-note"
            value={reviewNote}
            onChange={event => setReviewNote(event.target.value)}
            placeholder="Note (optional)"
            className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
          />
          <button
            type="button"
            data-cy="mark-handled"
            disabled={busy}
            onClick={() => review('applied')}
            className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            Mark handled
          </button>
          <button
            type="button"
            data-cy="reject"
            disabled={busy}
            onClick={() => review('rejected')}
            className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:border-red-400 hover:text-red-700 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {error && (
        <p data-cy="review-error" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

/**
 * Where to make the change: the item opened with its editor (the "Edit" a
 * signed-in visitor gets, P6-E), or the listing to add a new one. A
 * manufacturer's applied update needs its photos only.
 */
function OpenItem({ submission, isNew }: { submission: Submission; isNew: boolean }) {
  const appliedLive = submission.review_note?.startsWith('applied live') ?? false
  const photos = submission.image_urls.length
  const item = submission.gear_id != null ? `/${submission.gear_type}/${submission.gear_id}` : null
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {appliedLive ? (
        <p data-cy="applied-live">
          <strong className="font-semibold">Applied live.</strong> These values are already in the catalogue, and in
          the item's History. Only the photos are left to add.
        </p>
      ) : isNew ? (
        <p>Add it, if it is real, with <em>Add product</em> on the listing — then mark this handled.</p>
      ) : (
        <p>Check the evidence, make the change on the item, then mark this handled.</p>
      )}
      {photos > 0 && (
        // Nothing fetches a photo link for us: photos go up by hand, through
        // the item's Photos and manuals (live editing phase 4).
        <p data-cy="photo-upload-note" className="mt-2">
          <strong className="font-semibold">Photos.</strong> Open each link above, save the photo, and add it with{' '}
          <em>Photos and manuals</em> on the item's page.
        </p>
      )}
      <Link
        data-cy="open-item"
        to={item ? `${item}${appliedLive ? '' : '?edit=1'}` : `/${submission.gear_type}`}
        className="mt-2 inline-block font-medium text-teal-800 underline-offset-2 hover:underline"
      >
        {item ? (appliedLive ? 'Open the item' : 'Open the item to edit') : 'Open the listing'} →
      </Link>
    </div>
  )
}
