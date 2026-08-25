// Admin triage. See DESIGN.md § Admin Triage.
//
// **This page is not access control.** Every route it calls is guarded
// server-side by `require_admin` (slack_data/api/auth.py); hiding the UI would
// be cosmetic, and `tests/test_auth.py` asserts the server-side half. What this
// page does is make a queue reviewable.
//
// The other thing it must do is be honest about what approving means. Approving
// records a decision — it does not edit the catalogue, which is still a
// read-only file built from the root *.json at deploy time. So an approved row
// hands over a JSON patch and says, in plain words, that the change is not live
// until that JSON is edited and the API redeployed.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSubmissions, reviewSubmission } from '@/api/submissions'
import { useAdminAuth } from '@/auth/AdminAuthProvider'
import { fieldLabel } from '@/config/correctableFields'
import { getGearType } from '@/config/gearTypes'
import type { Submission, SubmissionStatus } from '@/types'
import { relativeAge } from '@/utils/age'
import { batchBrand, groupByBatch, type SubmissionGroup } from '@/utils/batches'

// Queue order, not alphabetical: `approved` sits second because it is the
// bucket with outstanding work — corrections agreed but not yet shipped.
const STATUSES: SubmissionStatus[] = ['pending', 'approved', 'applied', 'rejected']

// Matches the default the API applies; it caps `limit` at 100 (MAX_LIST_LIMIT
// in submissions_router.py). The queue is meant to be worked from the top, so
// this is a page rather than a scroll — but a full page has to say so.
const PAGE_SIZE = 50

// Above this, a manufacturer's batch renders collapsed. A brand refreshing a
// forty-product line would otherwise push every other submission off the
// screen, and the queue is meant to be worked from the top.
const COLLAPSE_BATCH_OVER = 5

export default function AdminPage() {
  const auth = useAdminAuth()
  const { token, isAuthenticated } = auth

  const [status, setStatus] = useState<SubmissionStatus>('pending')
  const [rows, setRows] = useState<Submission[]>([])
  const [outstanding, setOutstanding] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [visible, approved] = await Promise.all([
        fetchSubmissions(token, status, PAGE_SIZE),
        // Always counted, whichever bucket is on screen — an approved record is
        // unfinished work and should not be invisible just because the queue
        // filter is elsewhere.
        status === 'approved' ? Promise.resolve(null) : fetchSubmissions(token, 'approved', PAGE_SIZE),
      ])
      setRows(visible)
      setOutstanding(approved === null ? visible.length : approved.length)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? `${caught.status}: ${caught.message}`
          : 'Could not reach the API.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, status])

  useEffect(() => {
    void load()
  }, [load])

  if (auth.isLoading) {
    return <p className="p-8 text-sm text-gray-600">Signing in…</p>
  }

  if (!isAuthenticated) {
    return <LoginPrompt />
  }

  return (
    <div data-cy="admin-page" className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submission triage</h1>
          <p className="mt-1 text-sm text-gray-600">
            Oldest first. Reviewing records a decision — it does not change the catalogue.
            Updates from a manufacturer arrive already approved.
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

      {auth.isDevMode && (
        <p
          data-cy="admin-dev-mode"
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Local development mode — the token comes from session storage, not from Cognito. The API
          still decides whether it is valid.
        </p>
      )}

      {status !== 'approved' && outstanding > 0 && (
        // The count most likely to be quietly wrong: agreed, but not shipped.
        <button
          type="button"
          data-cy="admin-outstanding"
          onClick={() => setStatus('approved')}
          className="mt-4 w-full cursor-pointer rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <strong className="font-semibold">{outstanding}</strong> approved{' '}
          {outstanding === 1 ? 'correction is' : 'corrections are'} waiting to be applied to the JSON
          and deployed.
        </button>
      )}

      <div className="mt-6 flex gap-2">
        {STATUSES.map(value => (
          <button
            key={value}
            type="button"
            data-cy="admin-status-filter"
            data-status={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
              status === value
                ? 'bg-teal-700 text-white'
                : 'border border-gray-300 text-gray-700 hover:border-gray-400'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {error && (
        <p data-cy="admin-error" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {!loading && !error && rows.length === 0 && (
        <p data-cy="admin-empty" className="mt-10 text-center text-gray-500">
          Nothing {status}.
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

      {rows.length >= PAGE_SIZE && (
        // A full page means the queue is longer than the page. Saying nothing
        // here reads as "that's all of them", which is how a backlog goes
        // unnoticed — the list is capped at the API's limit, not by the data.
        <p data-cy="admin-more" className="mt-6 text-center text-sm text-gray-500">
          Showing the oldest {PAGE_SIZE}. More are waiting — work from the top.
        </p>
      )}
    </div>
  )
}

function LoginPrompt() {
  const auth = useAdminAuth()
  return (
    <div data-cy="admin-login" className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Admin sign-in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Submission triage is restricted. Signing in here only renders the page — the API verifies
        every request separately.
      </p>
      {auth.error && (
        <p data-cy="admin-login-error" className="mt-4 text-sm text-red-700">
          {auth.error}
        </p>
      )}
      <button
        type="button"
        data-cy="admin-signin"
        onClick={auth.signIn}
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
        Sent by the manufacturer, so it arrived approved — there is no decision to take here, only
        the JSON edits and a redeploy.
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
  const [approved, setApproved] = useState(false)

  const meta = getGearType(submission.gear_type)
  const isManufacturer = submission.kind === 'manufacturer'
  // A manufacturer submission that resolved to no row of theirs is a product we
  // do not hold — the same "new item" it would be from anyone else, and the
  // admin's job on it is different (add an entry, not edit one).
  const isNew = submission.kind === 'new_item' || (isManufacturer && submission.gear_id === null)

  async function review(status: 'approved' | 'applied' | 'rejected', note?: string) {
    setBusy(true)
    setError(null)
    try {
      await reviewSubmission(token, submission.submission_id, {
        status,
        review_note: note || reviewNote || null,
      })
      if (status === 'approved') {
        // Stay on screen to hand over the patch — reloading the list would
        // whisk away the one thing the admin now has to act on.
        setApproved(true)
      } else {
        onReviewed()
      }
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

      {approved || submission.status === 'approved' ? (
        <ApprovedPatch
          submission={submission}
          onDone={onReviewed}
          onMarkHandled={note => review('applied', note)}
          onReject={() => review('rejected')}
          busy={busy}
        />
      ) : (
        submission.status === 'pending' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              data-cy="review-note"
              value={reviewNote}
              onChange={event => setReviewNote(event.target.value)}
              placeholder="Review note (optional)"
              className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
            />
            <button
              type="button"
              data-cy="approve"
              disabled={busy}
              onClick={() => review('approved')}
              className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              Approve
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
        )
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
 * What is left to do after approving.
 *
 * Approve reads like "apply", and it isn't. Without this panel an admin would
 * reasonably believe the catalogue had changed, and the wrong number would sit
 * there until somebody noticed.
 */
function ApprovedPatch({
  submission,
  onDone,
  onMarkHandled,
  onReject,
  busy,
}: {
  submission: Submission
  onDone: () => void
  onMarkHandled: (note: string) => void
  /** The way back out.
   *
   * Approving used to be a decision a human took, so a row in this state had
   * already been judged and only needed applying. A manufacturer's row arrives
   * approved without anyone having looked at it — so if what they sent is
   * wrong, there has to be somewhere to say so, or the only options would be
   * applying it or leaving it in the bucket forever. */
  onReject: () => void
  busy: boolean
}) {
  const patch = JSON.stringify(submission.changes, null, 2)
  const [copied, setCopied] = useState(false)
  const [sha, setSha] = useState('')

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">
        <strong className="font-semibold">Approved — but not live.</strong> Apply this to{' '}
        <code className="font-mono text-xs">{submission.gear_type}.json</code> in the repository,
        then redeploy the API (infra/README.md § Deploying to live, half A). The catalogue is built
        from that file at deploy time.
      </p>
      <pre data-cy="approved-patch" className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-xs text-gray-800">
        {patch}
      </pre>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-cy="copy-patch"
          onClick={() => {
            void navigator.clipboard?.writeText(patch)
            setCopied(true)
          }}
          className="cursor-pointer rounded-full border border-amber-300 px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button
          type="button"
          data-cy="patch-done"
          onClick={onDone}
          className="cursor-pointer rounded-full px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          Later
        </button>
        <button
          type="button"
          data-cy="patch-reject"
          disabled={busy}
          onClick={onReject}
          className="ml-auto cursor-pointer rounded-full px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100 hover:text-red-700 disabled:opacity-60"
        >
          Reject instead
        </button>
      </div>

      {/*
        The step that actually closes the loop. Until this is clicked the record
        stays in the Approved bucket and — deliberately — never expires, so a
        correction cannot be agreed to and then quietly lost. The commit is
        optional but worth asking for: it is the only link from a value in the
        catalogue back to the report that changed it.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
        <input
          data-cy="applied-sha"
          value={sha}
          onChange={event => setSha(event.target.value)}
          placeholder="Commit sha (optional)"
          className="min-w-[10rem] flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
        />
        <button
          type="button"
          data-cy="mark-handled"
          disabled={busy}
          onClick={() => onMarkHandled(sha ? `applied in ${sha}` : 'applied')}
          className="cursor-pointer rounded-full bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          Mark handled
        </button>
        <span className="text-xs text-amber-800">once the edit is committed and deployed</span>
      </div>
    </div>
  )
}

