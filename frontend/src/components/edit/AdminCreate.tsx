// Entry points that start from nothing: Add product on a listing, Add brand on
// the manufacturers page, Edit brand and Logo and manuals on a brand's page —
// each opening the shared EntryEditor (P3-G, P3-I) or the media dialog (phase
// 4). For admins; and since phase 5 for a brand's manufacturers too, on their
// own brands (Add brand stays admin-only). Each renders nothing for anyone else.
// Plus "I represent this brand", for anyone signed in (D5).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBrand, createItem, editBrand, fetchBrandFields, fetchFields, fetchStoredBrand } from '@/api/edits'
import { fetchMyRequests, requestBrand } from '@/api/brandLinks'
import { useSiteAuth } from '@/auth/AuthContext'
import EntryEditor from './EntryEditor'
import Modal from './Modal'
import { BrandMediaDialog } from './MediaEditor'

const LINK = 'cursor-pointer text-sm font-medium text-teal-700 underline-offset-2 hover:text-teal-800 hover:underline'

export function AddItemButton({ slug, label }: { slug: string; label: string }) {
  const auth = useSiteAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.canEditAny || !token) return null
  return (
    <>
      <button type="button" data-cy="add-item" className={LINK} onClick={() => setOpen(true)}>
        Add product
      </button>
      {open && (
        <EntryEditor
          adapter={{
            title: `Add to ${label}`,
            note: 'Live for everyone once created, and recorded publicly. Add photos and manuals from its page.',
            loadFields: () => fetchFields(slug, token),
            save: (fields, _rev, why) => createItem(slug, fields, why, token),
          }}
          onClose={() => setOpen(false)}
          onSaved={result => {
            setOpen(false)
            navigate(`/${slug}/${result.key}`)
          }}
        />
      )}
    </>
  )
}

export function AddBrandButton() {
  const auth = useSiteAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.isAdmin || !token) return null
  return (
    <>
      <button type="button" data-cy="add-brand" className={LINK} onClick={() => setOpen(true)}>
        Add brand
      </button>
      {open && (
        <EntryEditor
          adapter={{
            title: 'Add a brand',
            note: 'A brand must exist before its products. Its name cannot be changed on the site afterwards.',
            extraFields: [{ name: 'name', kind: 'text', options: null, required: true }],
            loadFields: () => fetchBrandFields(token),
            save: ({ name, ...fields }, _rev, why) => createBrand(String(name), fields, why, token),
          }}
          onClose={() => setOpen(false)}
          onSaved={result => {
            setOpen(false)
            navigate(`/manufacturers/${result.entry.catalog_id}`)
          }}
        />
      )}
    </>
  )
}

export function EditBrandButton({
  catalogId,
  brandName,
  onSaved,
}: {
  catalogId: number | string
  brandName: string
  onSaved: () => void
}) {
  const auth = useSiteAuth()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.canEditBrand(brandName) || !token) return null
  return (
    <>
      <button type="button" data-cy="edit-brand" className={LINK} onClick={() => setOpen(true)}>
        Edit brand
      </button>
      {open && (
        <EntryEditor
          adapter={{
            title: 'Edit brand',
            note: "Every field but the brand's name, which products, credentials and links hang on.",
            loadFields: () => fetchBrandFields(token),
            loadStored: () => fetchStoredBrand(catalogId, token),
            save: (changes, rev, why) => editBrand(catalogId, rev ?? 0, changes, why, token),
          }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            onSaved()
          }}
        />
      )}
    </>
  )
}

export function BrandMediaButton({
  catalogId,
  brandName,
  onSaved,
}: {
  catalogId: number | string
  brandName: string
  onSaved: () => void
}) {
  const auth = useSiteAuth()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.canEditBrand(brandName) || !token) return null
  return (
    <>
      <button type="button" data-cy="brand-media" className={LINK} onClick={() => setOpen(true)}>
        Logo and manuals
      </button>
      {open && (
        <BrandMediaDialog
          catalogId={catalogId}
          token={token}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            onSaved()
          }}
        />
      )}
    </>
  )
}

/** "I represent this brand" (D5): for anyone signed in who does not already
 *  represent it. An admin decides; the button then reads what is pending. */
export function RepresentBrandButton({ catalogId, brandName }: { catalogId: number; brandName: string }) {
  const auth = useSiteAuth()
  const token = auth.token
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchMyRequests(token)
      .then(requests => {
        if (!cancelled) setPending(requests.some(r => r.catalog_id === catalogId && r.status === 'pending'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token, catalogId])

  if (!token || !auth.me || auth.me.brands.some(b => b.catalog_id === catalogId)) return null
  if (pending) {
    return (
      <span data-cy="represent-pending" className="text-sm text-gray-500">
        Your request to represent {brandName} is waiting for an admin
      </span>
    )
  }
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestBrand(catalogId, note.trim() || null, token)
      setPending(true)
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" data-cy="represent-brand" className={LINK} onClick={() => setOpen(true)}>
        I represent this brand
      </button>
      {open && (
        <Modal title={`Represent ${brandName}`} onClose={() => setOpen(false)} data-cy="represent-dialog">
          <form
            onSubmit={event => {
              event.preventDefault()
              void submit()
            }}
          >
            <p className="text-sm text-gray-600">
              An admin will look at your request. Once approved you can edit {brandName}'s products, photos and manuals,
              and manage its API keys; your changes are shown as made by its manufacturer. The admin sees whether your
              email address is on the brand's own domain.
            </p>
            <label className="mt-3 mb-1 block text-xs font-medium text-gray-700">
              Who you are at {brandName} (optional)
              <textarea
                data-cy="represent-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </label>
            {error && (
              <p data-cy="dialog-error" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button
                type="submit"
                data-cy="dialog-confirm"
                disabled={busy}
                className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                Send request
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
