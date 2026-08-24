// The "suggest a correction" dialog. See DESIGN.md § Suggest a Correction.
//
// A modal rather than a route, so the reader keeps their place and the gear they
// are correcting stays visible behind it.
//
// The one thing to keep hold of when editing this: **nothing here edits the
// catalogue.** It records what someone believes is wrong, for a human to review.
// The success panel says so in as many words, and that sentence is the most
// important text on the screen — a reader who thinks they have edited the
// database and finds the old number next week trusts the site less than one who
// was told to wait.

import { useEffect, useId, useRef, useState } from 'react'
import { createSubmission } from '@/api/submissions'
import { ApiError } from '@/api/client'
import { correctableFields } from '@/config/correctableFields'
import { GEAR_TYPES } from '@/config/gearTypes'
import { MAX_CHANGES, MAX_NOTE_LENGTH } from '@/types'
import type { SubmissionKind } from '@/types'
import TurnstileWidget, { isCaptchaRequired } from './TurnstileWidget'
import { formatValue } from '@/utils/format'
import type { AnyItem } from '@/utils/format'

interface ChangeRow {
  field: string
  value: string
}

export default function SubmissionDialog({
  gearType: defaultGearType,
  kind,
  item,
  onClose,
}: {
  /** The page's own gear type — the default selection, not a fixed value. */
  gearType: string
  kind: SubmissionKind
  /** The item being corrected. Absent for a new-item tip. */
  item?: AnyItem
  onClose: () => void
}) {
  const titleId = useId()

  // Product type is a field like any other, so the form is identical on every
  // page — only the default differs. Changing it re-bases the field picker,
  // because the correctable fields are per gear type.
  const [gearType, setGearType] = useState(defaultGearType)
  const fields = correctableFields(gearType)

  // A correction points at a row id, and ids are per-table. Once the type is
  // changed the id means a different product, so the submission can no longer
  // be a correction to the item it was opened from — it becomes a new-item tip.
  // Saying so beats silently mis-filing it against whatever holds that id.
  const retargeted = kind === 'correction' && gearType !== defaultGearType
  const effectiveKind: SubmissionKind = retargeted ? 'new_item' : kind

  const [rows, setRows] = useState<ChangeRow[]>([{ field: fields[0]?.field ?? '', value: '' }])
  const [gearName, setGearName] = useState(
    kind === 'correction' ? String(item?.name ?? '') : '',
  )
  // Captured from the page, not typed. Gear ids shift when the seed JSON is
  // reordered, so `"<brand> <name>"` is what actually identifies the item later
  // — and it cannot be backfilled once a submission exists without it.
  const [gearBrand, setGearBrand] = useState(
    kind === 'correction' ? String(item?.brand_name ?? '') : '',
  )
  const [note, setNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLSelectElement | HTMLInputElement>(null)
  // Whatever had focus before the dialog opened, so it can be handed back.
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    firstFieldRef.current?.focus()
    return () => opener.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function changeGearType(next: string) {
    setGearType(next)
    // The old rows name fields the new type may not have, which the API would
    // reject. Reset rather than filter: a half-kept list is more confusing than
    // a fresh one.
    setRows([{ field: correctableFields(next)[0]?.field ?? '', value: '' }])
  }

  function updateRow(index: number, patch: Partial<ChangeRow>) {
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    // Offer a field that isn't already being corrected, so the default row is
    // useful rather than a duplicate the API would collapse.
    const used = new Set(rows.map(r => r.field))
    const next = fields.find(f => !used.has(f.field))
    if (next) setRows(current => [...current, { field: next.field, value: '' }])
  }

  function removeRow(index: number) {
    setRows(current => current.filter((_, i) => i !== index))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (isCaptchaRequired() && !captchaToken) {
      // Not a security control — the server redeems the token either way. This
      // only turns "wait for the widget" into a sentence instead of a 400.
      setError('Please complete the captcha below, then send again.')
      return
    }

    setSubmitting(true)

    // Blank rows are the normal state of a form someone half-filled; they are
    // dropped rather than treated as an error.
    const changes: Record<string, string> = {}
    for (const row of rows) {
      if (row.field && row.value.trim()) changes[row.field] = row.value.trim()
    }

    try {
      const receipt = await createSubmission({
        kind: effectiveKind,
        gear_type: gearType,
        gear_id: effectiveKind === 'correction' ? Number(item?.id) : null,
        gear_name: gearName || null,
        gear_brand: gearBrand || null,
        changes,
        note: note || null,
        source_url: sourceUrl || null,
        submitter_email: email || null,
        website: honeypot || null,
        captcha_token: captchaToken,
      })
      setReceiptId(receipt.submission_id)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        data-cy="submission-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
      >
        {receiptId ? (
          <SuccessPanel submissionId={receiptId} onClose={onClose} />
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              {effectiveKind === 'correction' ? 'Suggest a correction' : 'Suggest a missing item'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {effectiveKind === 'correction' ? (
                <>
                  Something wrong with{' '}
                  <span className="font-medium text-gray-800">{String(item?.name ?? 'this item')}</span>?
                  Tell us what it should say — a moderator reviews every suggestion before it changes.
                </>
              ) : (
                <>
                  Know a product we don&apos;t list? Tell us what it is and where to read about it.
                </>
              )}
            </p>

            {/*
              Product type and name are the same two fields on every page, so
              the form is one form wherever it is opened — only the default
              selection differs. See DESIGN.md § The form.
            */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-800">Product type</span>
                <select
                  ref={firstFieldRef as React.RefObject<HTMLSelectElement>}
                  data-cy="submission-gear-type"
                  value={gearType}
                  onChange={event => changeGearType(event.target.value)}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                >
                  {GEAR_TYPES.map(type => (
                    <option key={type.slug} value={type.slug}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-800">Product name</span>
                <input
                  data-cy="submission-gear-name"
                  value={gearName}
                  onChange={event => setGearName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-gray-800">Brand</span>
                <input
                  data-cy="submission-gear-brand"
                  value={gearBrand}
                  onChange={event => setGearBrand(event.target.value)}
                  placeholder="e.g. Balance Community"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                />
              </label>
            </div>

            {retargeted && (
              <p
                data-cy="submission-retargeted"
                className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                You&apos;ve changed the product type, so this will be sent as a new-item suggestion
                rather than a correction to{' '}
                <span className="font-medium">{String(item?.name ?? 'the original item')}</span>.
              </p>
            )}

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-gray-800">
                {effectiveKind === 'correction' ? 'What is wrong?' : 'What do you know about it?'}
              </legend>

              <div className="mt-2 space-y-2">
                {rows.map((row, index) => {
                  const meta = fields.find(f => f.field === row.field)
                  // The value as it stands today, shown read-only so the
                  // submitter is correcting what we actually hold rather than
                  // what they remember seeing.
                  const current =
                    effectiveKind === 'correction' && item
                      ? formatValue(item[row.field], meta?.unit)
                      : ''

                  return (
                    <div key={index} data-cy="change-row" className="flex flex-wrap items-center gap-2">
                      <select
                        data-cy="change-field"
                        value={row.field}
                        onChange={event => updateRow(index, { field: event.target.value })}
                        className="cursor-pointer rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                      >
                        {fields.map(f => (
                          <option key={f.field} value={f.field}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      {current && (
                        <span data-cy="change-current" className="text-sm text-gray-500">
                          {current} →
                        </span>
                      )}

                      <input
                        data-cy="change-value"
                        value={row.value}
                        onChange={event => updateRow(index, { value: event.target.value })}
                        placeholder={meta?.unit ? `new value (${meta.unit})` : 'new value'}
                        className="min-w-[8rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                      />

                      {rows.length > 1 && (
                        <button
                          type="button"
                          data-cy="remove-change"
                          onClick={() => removeRow(index)}
                          aria-label="Remove this field"
                          className="cursor-pointer rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {rows.length < Math.min(MAX_CHANGES, fields.length) && (
                <button
                  type="button"
                  data-cy="add-change"
                  onClick={addRow}
                  className="mt-2 cursor-pointer text-sm font-medium text-teal-700 hover:text-teal-800"
                >
                  + Add another field
                </button>
              )}
            </fieldset>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-gray-800">Notes</span>
              <span className="ml-1 text-sm text-gray-500">
                — optional, but useful if the problem isn&apos;t a single value
              </span>
              <textarea
                data-cy="submission-note"
                value={note}
                maxLength={MAX_NOTE_LENGTH}
                rows={3}
                onChange={event => setNote(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-800">Evidence link</span>
              <span className="ml-1 text-sm text-gray-500">
                — a link to the manufacturer&apos;s spec sheet makes this much faster to verify
              </span>
              <input
                data-cy="submission-source-url"
                type="url"
                value={sourceUrl}
                placeholder="https://"
                onChange={event => setSourceUrl(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-800">Your email</span>
              <span className="ml-1 text-sm text-gray-500">
                — only used to follow up on this correction. Leave blank to submit anonymously.
              </span>
              <input
                data-cy="submission-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
              />
            </label>

            {/*
              Honeypot. Positioned off-canvas rather than `display: none`,
              because the better bots skip fields that compute to hidden. No
              human sees it, keyboard focus skips it, and password managers are
              told to leave it alone.
            */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  data-cy="submission-honeypot"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={event => setHoneypot(event.target.value)}
                />
              </label>
            </div>

            {/*
              Renders nothing unless VITE_TURNSTILE_SITE_KEY is set, which is
              why local dev and the Cypress suite never touch Cloudflare.
            */}
            <TurnstileWidget onToken={setCaptchaToken} onError={setError} />

            {error && (
              <p data-cy="submission-error" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                data-cy="submission-cancel"
                onClick={onClose}
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              {/*
                Never disabled — see DESIGN.md. A disabled button that doesn't
                say why is the commonest failure in a form like this; this one
                submits and reports what was wrong.
              */}
              <button
                type="submit"
                data-cy="submission-submit"
                className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-70"
                aria-busy={submitting}
              >
                {submitting ? 'Sending…' : 'Send suggestion'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function SuccessPanel({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  return (
    <div data-cy="submission-success">
      <h2 className="text-lg font-semibold text-gray-900">Thank you — that&apos;s been recorded.</h2>
      <p className="mt-2 text-sm text-gray-700">
        {/*
          The sentence this whole screen exists for. Approving a suggestion is
          still a manual edit to the source data followed by a redeploy, so
          promising anything faster here would be a lie.
        */}
        <strong className="font-semibold">Nothing has changed on the site yet.</strong> A moderator
        reviews every suggestion by hand, and the catalogue is updated in the next release. If you
        left an email address we may write back if we need more detail.
      </p>
      <p className="mt-3 text-sm text-gray-600">
        Reference:{' '}
        <code data-cy="submission-id" className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
          {submissionId}
        </code>{' '}
        — worth quoting if you get in touch.
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          data-cy="submission-done"
          onClick={onClose}
          className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Done
        </button>
      </div>
    </div>
  )
}
