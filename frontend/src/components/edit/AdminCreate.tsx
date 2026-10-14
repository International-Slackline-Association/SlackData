// Admin-only entry points that start from nothing: Add product on a listing,
// Add brand on the manufacturers page, Edit brand on a brand's page. Each
// opens the shared EntryEditor (P3-G, P3-I). Renders nothing for anyone else.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBrand, createItem, editBrand, fetchBrandFields, fetchFields, fetchStoredBrand } from '@/api/edits'
import { useSiteAuth } from '@/auth/AuthContext'
import EntryEditor from './EntryEditor'

const LINK = 'cursor-pointer text-sm font-medium text-teal-700 underline-offset-2 hover:text-teal-800 hover:underline'

export function AddItemButton({ slug, label }: { slug: string; label: string }) {
  const auth = useSiteAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.isAdmin || !token) return null
  return (
    <>
      <button type="button" data-cy="add-item" className={LINK} onClick={() => setOpen(true)}>
        Add product
      </button>
      {open && (
        <EntryEditor
          adapter={{
            title: `Add to ${label}`,
            note: 'Live for everyone once created, and recorded publicly. Photos are filed separately, under its id.',
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

export function EditBrandButton({ catalogId, onSaved }: { catalogId: number | string; onSaved: () => void }) {
  const auth = useSiteAuth()
  const [open, setOpen] = useState(false)
  const token = auth.token
  if (!auth.isAdmin || !token) return null
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
