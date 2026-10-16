// Under a gear item's spec sheet: its History, public to everyone, and the
// editing actions — Edit and Photos and manuals for everyone signed in (phase
// 6); Revert on an edit in the History for an admin or one of the maker's
// manufacturers (D58); Merge into… for an admin only (LIVE_EDITING_PHASE_3.md
// § 5.6). An anonymous visitor sees Edit too: it signs them in and comes back
// with the editor open (P6-E).
//
// Every action writes through the API and then asks the page to reload the
// item (`onChanged`), so what is shown is always what the next visitor sees.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { editItem, fetchFields, fetchStored, mergeItem, revertChange } from '@/api/edits'
import { fetchGearItem } from '@/api/gear'
import { fetchChanges } from '@/api/people'
import { useSiteAuth } from '@/auth/AuthContext'
import type { ChangeRecordPublic } from '@/types'
import ChangeList from './ChangeList'
import EntryEditor from './EntryEditor'
import { ItemMediaDialog } from './MediaEditor'
import Modal from './Modal'

const MIN_MERGE_WHY = 30

type Dialog = null | 'edit' | 'media' | 'merge' | { revert: ChangeRecordPublic }

const BUTTON =
  'cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-teal-600 hover:text-teal-700'

export default function ItemEditing({
  slug,
  id,
  brandName,
  onChanged,
}: {
  slug: string
  id: string | number
  /** The maker, as the item carries it: whose manufacturers revert on it. */
  brandName: string
  onChanged: () => void
}) {
  const auth = useSiteAuth()
  const token = auth.token
  const canEdit = auth.canEdit && Boolean(token)
  const canRevert = auth.canManageBrand(brandName) && Boolean(token)
  const offerSignIn = !auth.isAuthenticated && !auth.isLoading && auth.mode !== 'unconfigured'
  const [history, setHistory] = useState<ChangeRecordPublic[] | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [params, setParams] = useSearchParams()
  const wantsEdit = params.get('edit') === '1'

  // Back from signing in to edit (P6-E): open the editor, once.
  useEffect(() => {
    if (!wantsEdit || !canEdit) return
    setDialog('edit')
    setParams(
      current => {
        const next = new URLSearchParams(current)
        next.delete('edit')
        return next
      },
      { replace: true },
    )
  }, [wantsEdit, canEdit, setParams])

  const signInToEdit = () => {
    const next = new URLSearchParams(params)
    next.set('edit', '1')
    setParams(next, { replace: true })
    auth.signIn(`${window.location.pathname}?${next.toString()}`)
  }

  const loadHistory = useCallback(() => {
    fetchChanges({ target_type: 'item', target_id: `${slug}#${id}` })
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [slug, id])

  useEffect(loadHistory, [loadHistory])

  const done = () => {
    setDialog(null)
    loadHistory()
    onChanged()
  }

  return (
    <section data-cy="item-editing" className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-gray-900">History</h2>
        {canEdit && (
          <>
            <button type="button" data-cy="item-edit" className={BUTTON} onClick={() => setDialog('edit')}>
              Edit
            </button>
            <button type="button" data-cy="item-media" className={BUTTON} onClick={() => setDialog('media')}>
              Photos and manuals
            </button>
          </>
        )}
        {offerSignIn && (
          <button
            type="button"
            data-cy="item-edit-sign-in"
            title="Anyone with an ISA account can fix or add to this item"
            className={BUTTON}
            onClick={signInToEdit}
          >
            Edit
          </button>
        )}
        {auth.isAdmin && token && (
          <button type="button" data-cy="item-merge" className={BUTTON} onClick={() => setDialog('merge')}>
            Merge into…
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Every change to this item, with who made it and why. Public, and kept permanently.
      </p>
      <div className="mt-3" data-cy="item-history">
        {history === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <ChangeList
            records={history}
            showTarget={false}
            emptyText="No changes on the site yet — this item is as it was imported."
            onRevert={canRevert ? record => setDialog({ revert: record }) : undefined}
          />
        )}
      </div>

      {token && dialog === 'edit' && (
        <EntryEditor
          adapter={{
            title: 'Edit item',
            note: 'Saved changes are live for everyone on the next page load, and recorded publicly.',
            loadFields: () => fetchFields(slug, token),
            loadStored: () => fetchStored(slug, id, token),
            save: (changes, rev, why) => editItem(slug, id, rev ?? 0, changes, why, token),
          }}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {token && dialog === 'media' && (
        <ItemMediaDialog slug={slug} id={id} token={token} onClose={() => setDialog(null)} onDone={done} />
      )}
      {token && dialog === 'merge' && (
        <MergeDialog slug={slug} id={id} token={token} onClose={() => setDialog(null)} onDone={done} />
      )}
      {token && dialog && typeof dialog === 'object' && (
        <RevertDialog record={dialog.revert} token={token} onClose={() => setDialog(null)} onDone={done} />
      )}
    </section>
  )
}

function Footer({
  busy,
  disabled,
  label,
  onClose,
  error,
}: {
  busy: boolean
  disabled: boolean
  label: string
  onClose: () => void
  error: string | null
}) {
  return (
    <>
      {error && (
        <p data-cy="dialog-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          type="submit"
          data-cy="dialog-confirm"
          disabled={busy || disabled}
          className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-default disabled:opacity-50"
        >
          {label}
        </button>
      </div>
    </>
  )
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const TEXTAREA = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none'

function MergeDialog({
  slug,
  id,
  token,
  onClose,
  onDone,
}: {
  slug: string
  id: string | number
  token: string
  onClose: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const [into, setInto] = useState('')
  const [survivor, setSurvivor] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const { busy, error, run } = useAction(() => {
    onDone()
    navigate(`/${slug}/${into}`)
  })

  useEffect(() => {
    setSurvivor(null)
    const target = Number(into)
    if (!Number.isInteger(target) || target <= 0 || String(target) === String(id)) return
    let cancelled = false
    fetchGearItem(slug, target)
      .then(item => {
        if (!cancelled) setSurvivor(`${item.brand_name} ${item.name}`)
      })
      .catch(() => {
        if (!cancelled) setSurvivor('')
      })
    return () => {
      cancelled = true
    }
  }, [slug, id, into])

  const submit = () =>
    run(async () => {
      const { rev } = await fetchStored(slug, id, token)
      return mergeItem(slug, id, rev, Number(into), why.trim(), token)
    })

  return (
    <Modal title="Merge a duplicate" onClose={onClose} data-cy="merge-dialog">
      <form
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="text-sm text-gray-600">
          This item is the same product as another one. It leaves the catalogue; links to it go to the other item, and
          any ISA warning or certificate on it moves there. The merge is shown prominently in the public log.
        </p>
        <label className="mt-3 mb-1 block text-xs font-medium text-gray-700">
          Id of the item to keep *
          <input
            data-cy="merge-into"
            inputMode="numeric"
            value={into}
            onChange={e => setInto(e.target.value.trim())}
            className={TEXTAREA}
          />
        </label>
        <p data-cy="merge-survivor" className="text-xs text-gray-600">
          {survivor === null ? '' : survivor === '' ? 'No listed item with that id.' : `Keeps: ${survivor}`}
        </p>
        <label className="mt-3 mb-1 block text-xs font-medium text-gray-700">
          Explain in detail why they are one product * (at least {MIN_MERGE_WHY} characters)
          <textarea data-cy="dialog-why" rows={3} value={why} onChange={e => setWhy(e.target.value)} className={TEXTAREA} />
        </label>
        <Footer
          busy={busy}
          disabled={!survivor || why.trim().length < MIN_MERGE_WHY}
          label="Merge"
          onClose={onClose}
          error={error}
        />
      </form>
    </Modal>
  )
}

function RevertDialog({
  record,
  token,
  onClose,
  onDone,
}: {
  record: ChangeRecordPublic
  token: string
  onClose: () => void
  onDone: () => void
}) {
  const [why, setWhy] = useState('')
  const [refused, setRefused] = useState<Record<string, unknown> | null>(null)
  const { busy, error, run } = useAction(() => {
    if (!refused) onDone()
  })
  const submit = () =>
    run(async () => {
      const result = await revertChange(record.id, why.trim() || null, token)
      if (Object.keys(result.refused).length) {
        setRefused(result.refused)
        throw new Error(
          `Reverted, except ${Object.keys(result.refused).join(', ')}, which changed again since — edit those by hand.`,
        )
      }
      return result
    })
  return (
    <Modal title="Revert a change" onClose={refused ? onDone : onClose} data-cy="revert-dialog">
      <form
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="text-sm text-gray-600">
          Puts back the values this change replaced. A field that has changed again since is left as it is. The revert
          is itself a public change.
        </p>
        <label className="mt-3 mb-1 block text-xs font-medium text-gray-700">
          Why (optional)
          <input data-cy="dialog-why" value={why} onChange={e => setWhy(e.target.value)} className={TEXTAREA} />
        </label>
        <Footer busy={busy} disabled={refused !== null} label="Revert" onClose={refused ? onDone : onClose} error={error} />
      </form>
    </Modal>
  )
}
