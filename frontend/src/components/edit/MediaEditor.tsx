// Photos and manuals of an item, and a brand's logo and range-wide manuals —
// added, removed, reordered and retitled in one dialog, saved as one logged
// edit (LIVE_EDITING_PHASE_4.md P4-H).
//
// Saving: new photos are resized in the browser (utils/photoResize.ts, D44);
// the API hands out one upload form per file; each file goes straight to
// quarantine; then the whole list, in its new order, is sent with the upload
// ids. A file the server finds is not what it claims is refused there, by its
// bytes, and nothing is published.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchStored, fetchStoredBrand } from '@/api/edits'
import { postUpload, putBrandMedia, putItemMedia, requestUploads, type UploadRequest } from '@/api/media'
import { GEAR_TYPES, getGearType } from '@/config/gearTypes'
import type { ManualRef, PhotoRef, StoredManual, StoredPhoto } from '@/types/media'
import { titleFromFilename } from '@/utils/manuals'
import { loadMedia, mediaUrl } from '@/utils/mediaStore'
import { manualProblem, photoProblem, resizeLogo, resizePhoto } from '@/utils/photoResize'
import Modal from './Modal'

type PhotoRow = { kind: 'kept'; photo: StoredPhoto } | { kind: 'new'; file: File; preview: string }
type ManualRow = { kind: 'kept'; manual: StoredManual; title: string } | { kind: 'new'; file: File; title: string }

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none'
const SMALL_BUTTON =
  'cursor-pointer rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:border-teal-600 disabled:cursor-default disabled:opacity-40'

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

/** Ask for one form per file and post each file to its own. The upload ids, in order. */
async function uploadAll(files: { request: UploadRequest; blob: Blob }[], token: string): Promise<string[]> {
  if (files.length === 0) return []
  const targets = await requestUploads(files.map(f => f.request), token)
  await Promise.all(targets.map((target, i) => postUpload(target, files[i].blob)))
  return targets.map(t => t.upload)
}

function Footer({
  busy,
  loaded,
  status,
  error,
  onClose,
}: {
  busy: boolean
  loaded: boolean
  status: string
  error: string | null
  onClose: () => void
}) {
  return (
    <>
      {error && (
        <p data-cy="dialog-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        {busy && <span data-cy="media-status" className="mr-auto text-xs text-gray-500">{status}</span>}
        <button type="button" onClick={onClose} className="cursor-pointer rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          type="submit"
          data-cy="dialog-confirm"
          disabled={busy || !loaded}
          className="cursor-pointer rounded-full bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-default disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </>
  )
}

function useSave(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const run = async (action: (say: (text: string) => void) => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action(setStatus)
      await loadMedia(true)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, status, error, setError, run }
}

/** The manual rows, shared by items and brands. */
function ManualList({
  rows,
  setRows,
  cyPrefix = 'media',
}: {
  rows: ManualRow[]
  setRows: (rows: ManualRow[]) => void
  cyPrefix?: string
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row, i) => (
        <li key={row.kind === 'kept' ? row.manual.id : `new-${i}-${row.file.name}`} data-cy={`${cyPrefix}-manual`} className="flex items-center gap-2">
          {row.kind === 'kept' ? (
            <a href={mediaUrl(row.manual.file)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-teal-700 hover:underline">
              PDF
            </a>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 text-xs text-amber-800">new</span>
          )}
          <input
            data-cy={`${cyPrefix}-manual-title`}
            aria-label="Title"
            value={row.title}
            maxLength={100}
            onChange={e => setRows(rows.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))}
            className={INPUT}
          />
          <button type="button" aria-label="Move up" className={SMALL_BUTTON} disabled={i === 0} onClick={() => setRows(move(rows, i, -1))}>
            ↑
          </button>
          <button type="button" aria-label="Remove" data-cy={`${cyPrefix}-manual-remove`} className={SMALL_BUTTON} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

function PickFiles({
  label,
  accept,
  dataCy,
  onPick,
  disabled = false,
}: {
  label: string
  accept: string
  dataCy: string
  onPick: (files: File[]) => void
  disabled?: boolean
}) {
  return (
    <label className={`mt-2 inline-block text-sm font-medium text-teal-700 ${disabled ? 'opacity-40' : 'cursor-pointer hover:underline'}`}>
      {label}
      <input
        data-cy={dataCy}
        type="file"
        disabled={disabled}
        multiple
        accept={accept}
        className="sr-only"
        onChange={e => {
          onPick(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function manualRefs(rows: ManualRow[], uploads: Map<ManualRow, string>): ManualRef[] {
  return rows.map(row =>
    row.kind === 'kept' ? { id: row.manual.id, title: row.title } : { upload: uploads.get(row)!, title: row.title },
  )
}

async function uploadManuals(rows: ManualRow[], token: string): Promise<Map<ManualRow, string>> {
  const fresh = rows.filter(r => r.kind === 'new') as Extract<ManualRow, { kind: 'new' }>[]
  const ids = await uploadAll(
    fresh.map(r => ({ request: { purpose: 'manual', content_type: 'application/pdf', size: r.file.size }, blob: r.file })),
    token,
  )
  return new Map(fresh.map((r, i) => [r as ManualRow, ids[i]]))
}

function addManuals(files: File[], rows: ManualRow[], setRows: (rows: ManualRow[]) => void, setError: (e: string | null) => void) {
  const problems = files.map(manualProblem).filter(Boolean)
  setError(problems.length ? problems.join('; ') : null)
  const ok = files.filter(f => !manualProblem(f))
  setRows([...rows, ...ok.map(file => ({ kind: 'new' as const, file, title: titleFromFilename(file.name) }))])
}

// --- An item ------------------------------------------------------------------------

export function ItemMediaDialog({
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
  const [rev, setRev] = useState<number | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [manuals, setManuals] = useState<ManualRow[]>([])
  const [why, setWhy] = useState('')
  const { busy, status, error, setError, run } = useSave(onDone)

  useEffect(() => {
    // A superseded load (StrictMode runs this twice) must not overwrite files
    // picked since the first one landed.
    let cancelled = false
    fetchStored(slug, id, token)
      .then(stored => {
        if (cancelled) return
        setRev(stored.rev)
        setPhotos(((stored.entry.photos as StoredPhoto[] | undefined) ?? []).map(photo => ({ kind: 'kept', photo })))
        setManuals(
          ((stored.entry.manuals as StoredManual[] | undefined) ?? []).map(manual => ({ kind: 'kept', manual, title: manual.title })),
        )
      })
      .catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the item.')
      })
    return () => {
      cancelled = true
    }
  }, [slug, id, token, setError])

  // Object URLs for the previews of new photos, released when they go.
  useEffect(
    () => () => photos.forEach(p => p.kind === 'new' && URL.revokeObjectURL(p.preview)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const addPhotos = (files: File[]) => {
    const problems = files.map(photoProblem).filter(Boolean)
    setError(problems.length ? problems.join('; ') : null)
    const ok = files.filter(f => !photoProblem(f))
    setPhotos([...photos, ...ok.map(file => ({ kind: 'new' as const, file, preview: URL.createObjectURL(file) }))])
  }

  const save = () =>
    run(async say => {
      if (rev === null) throw new Error('The item has not loaded yet.')
      if (manuals.some(m => !m.title.trim())) throw new Error('Every manual needs a title.')
      const fresh = photos.filter(p => p.kind === 'new') as Extract<PhotoRow, { kind: 'new' }>[]
      say(fresh.length ? `Resizing ${fresh.length} photo${fresh.length > 1 ? 's' : ''}…` : 'Saving…')
      const sized = await Promise.all(fresh.map(p => resizePhoto(p.file)))
      say('Uploading…')
      const ids = await uploadAll(
        sized.flatMap(s => [
          { request: { purpose: 'photo' as const, content_type: s.small.type, size: s.small.size }, blob: s.small },
          { request: { purpose: 'photo' as const, content_type: s.large.type, size: s.large.size }, blob: s.large },
        ]),
        token,
      )
      const manualIds = await uploadManuals(manuals, token)
      say('Saving…')
      let next = 0
      const photoRefs: PhotoRef[] = photos.map(row => {
        if (row.kind === 'kept') return { id: row.photo.id }
        const ref = { upload: { small: ids[next * 2], large: ids[next * 2 + 1] } }
        next += 1
        return ref
      })
      await putItemMedia(slug, id, { rev, photos: photoRefs, manuals: manualRefs(manuals, manualIds), why: why.trim() || null }, token)
    })

  return (
    <Modal title="Photos and manuals" onClose={onClose} wide data-cy="media-dialog">
      <form
        data-cy="media-form"
        data-loaded={String(rev !== null)}
        onSubmit={event => {
          event.preventDefault()
          void save()
        }}
      >
        <p className="text-sm text-gray-600">
          Live for everyone on the next page load, and recorded publicly. The first photo is the one cards show. A photo
          taken off stays in the record, never deleted.
        </p>

        <Section title="Photos">
          {photos.length === 0 && <p className="text-sm text-gray-400">No photos yet.</p>}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((row, i) => (
              <li
                key={row.kind === 'kept' ? row.photo.id : row.preview}
                data-cy="media-photo"
                data-new={String(row.kind === 'new')}
                className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-1"
              >
                <img
                  src={row.kind === 'kept' ? mediaUrl(row.photo.small) : row.preview}
                  alt=""
                  className="h-20 w-full object-contain"
                />
                <div className="flex gap-1">
                  <button type="button" aria-label="Earlier" data-cy="media-photo-earlier" className={SMALL_BUTTON} disabled={i === 0} onClick={() => setPhotos(move(photos, i, -1))}>
                    ←
                  </button>
                  <button type="button" aria-label="Later" data-cy="media-photo-later" className={SMALL_BUTTON} disabled={i === photos.length - 1} onClick={() => setPhotos(move(photos, i, 1))}>
                    →
                  </button>
                  <button type="button" aria-label="Remove" data-cy="media-photo-remove" className={SMALL_BUTTON} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <PickFiles
            label="Add photos"
            accept="image/jpeg,image/png,image/webp"
            dataCy="media-add-photos"
            onPick={addPhotos}
            disabled={rev === null}
          />
          <p className="text-xs text-gray-500">JPEG, PNG or WebP, up to 10 MB each. Resized here before upload; location data is removed.</p>
        </Section>

        <Section title="Manuals and documents">
          {manuals.length === 0 && <p className="text-sm text-gray-400">No documents yet.</p>}
          <ManualList rows={manuals} setRows={setManuals} />
          <PickFiles
            label="Add PDFs"
            accept="application/pdf"
            dataCy="media-add-manuals"
            onPick={files => addManuals(files, manuals, setManuals, setError)}
            disabled={rev === null}
          />
          <p className="text-xs text-gray-500">PDF, up to 25 MB each. The title is what readers see.</p>
        </Section>

        <label className="mt-4 mb-1 block text-xs font-medium text-gray-700">
          Why (optional)
          <input data-cy="dialog-why" value={why} onChange={e => setWhy(e.target.value)} className={INPUT} />
        </label>
        <Footer busy={busy} loaded={rev !== null} status={status} error={error} onClose={onClose} />
      </form>
    </Modal>
  )
}

// --- A brand --------------------------------------------------------------------------

export function BrandMediaDialog({
  catalogId,
  token,
  onClose,
  onDone,
}: {
  catalogId: number | string
  token: string
  onClose: () => void
  onDone: () => void
}) {
  const [rev, setRev] = useState<number | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [newLogo, setNewLogo] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [byType, setByType] = useState<Record<string, ManualRow[]>>({})
  const [original, setOriginal] = useState<string[]>([])
  const [addType, setAddType] = useState<string>(GEAR_TYPES[0].slug)
  const [why, setWhy] = useState('')
  const { busy, status, error, setError, run } = useSave(onDone)
  const preview = useMemo(() => (newLogo ? URL.createObjectURL(newLogo) : null), [newLogo])

  useEffect(() => {
    let cancelled = false
    fetchStoredBrand(catalogId, token)
      .then(stored => {
        if (cancelled) return
        setRev(stored.rev)
        setLogo((stored.entry.logo as string | undefined) ?? null)
        const manuals = (stored.entry.manuals as Record<string, StoredManual[]> | undefined) ?? {}
        setOriginal(Object.keys(manuals))
        setByType(
          Object.fromEntries(
            Object.entries(manuals).map(([type, list]) => [type, list.map(manual => ({ kind: 'kept' as const, manual, title: manual.title }))]),
          ),
        )
      })
      .catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the brand.')
      })
    return () => {
      cancelled = true
    }
  }, [catalogId, token, setError])

  const save = () =>
    run(async say => {
      if (rev === null) throw new Error('The brand has not loaded yet.')
      say('Uploading…')
      let logoChange: { upload: string | null } | undefined
      if (newLogo) {
        const blob = await resizeLogo(newLogo)
        const [upload] = await uploadAll([{ request: { purpose: 'logo', content_type: blob.type, size: blob.size }, blob }], token)
        logoChange = { upload }
      } else if (removeLogo) {
        logoChange = { upload: null }
      }
      const types = [...new Set([...original, ...Object.keys(byType)])]
      const manuals: Record<string, ManualRef[]> = {}
      for (const type of types) {
        const rows = byType[type] ?? []
        if (rows.some(m => !m.title.trim())) throw new Error('Every manual needs a title.')
        manuals[type] = manualRefs(rows, await uploadManuals(rows, token))
      }
      say('Saving…')
      await putBrandMedia(
        catalogId,
        { rev, ...(logoChange ? { logo: logoChange } : {}), ...(types.length ? { manuals } : {}), why: why.trim() || null },
        token,
      )
    })

  const shownLogo = preview ?? (removeLogo || !logo ? null : mediaUrl(logo))
  const types = Object.keys(byType).filter(t => byType[t].length > 0)

  return (
    <Modal title="Logo and range-wide manuals" onClose={onClose} wide data-cy="brand-media-dialog">
      <form
        data-cy="media-form"
        data-loaded={String(rev !== null)}
        onSubmit={event => {
          event.preventDefault()
          void save()
        }}
      >
        <Section title="Logo">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-32 items-center justify-center rounded border border-gray-200 bg-gray-50">
              {shownLogo ? <img data-cy="brand-media-logo" src={shownLogo} alt="" className="max-h-14 max-w-28 object-contain" /> : <span className="text-xs text-gray-300">No logo</span>}
            </div>
            <PickFiles
              label={logo || newLogo ? 'Replace' : 'Add a logo'}
              accept="image/jpeg,image/png,image/webp"
              dataCy="brand-media-add-logo"
              disabled={rev === null}
              onPick={([file]) => {
                if (!file) return
                const problem = photoProblem(file)
                setError(problem)
                if (!problem) {
                  setNewLogo(file)
                  setRemoveLogo(false)
                }
              }}
            />
            {(logo || newLogo) && !removeLogo && (
              <button type="button" data-cy="brand-media-remove-logo" className={SMALL_BUTTON} onClick={() => { setNewLogo(null); setRemoveLogo(true) }}>
                Remove
              </button>
            )}
          </div>
        </Section>

        <Section title="Range-wide manuals">
          <p className="mb-2 text-xs text-gray-500">
            A document about every product of one type this brand makes — shown on each of them, captioned “Applies to all…”.
          </p>
          {types.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
          {types.map(type => (
            <div key={type} className="mb-3" data-cy="brand-media-type" data-type={type}>
              <p className="mb-1 text-sm font-medium text-gray-800">{getGearType(type)?.label ?? type}</p>
              <ManualList rows={byType[type]} setRows={rows => setByType({ ...byType, [type]: rows })} cyPrefix="brand-media" />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <select data-cy="brand-media-type-select" value={addType} onChange={e => setAddType(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
              {GEAR_TYPES.map(t => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
            <PickFiles
              label="Add PDFs"
              accept="application/pdf"
              dataCy="brand-media-add-manuals"
              disabled={rev === null}
              onPick={files => addManuals(files, byType[addType] ?? [], rows => setByType({ ...byType, [addType]: rows }), setError)}
            />
          </div>
        </Section>

        <label className="mt-4 mb-1 block text-xs font-medium text-gray-700">
          Why (optional)
          <input data-cy="dialog-why" value={why} onChange={e => setWhy(e.target.value)} className={INPUT} />
        </label>
        <Footer busy={busy} loaded={rev !== null} status={status} error={error} onClose={onClose} />
      </form>
    </Modal>
  )
}
