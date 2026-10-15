// Mirrors slack_data/media/manifest.py (GET /media/manifest), the media keys on
// a stored entry (slack_data/media/edits.py), and edit_router.py's upload and
// media request bodies. Read those first.

/** Both sizes of one photo, as keys under the manifest's `base` (P4-D). */
export interface PhotoKeys {
  small: string
  large: string
}

export interface ManualKey {
  file: string
  title: string
}

export interface MediaManifest {
  /** Where `/media/<key>` is served from: "/media" hosted, the API locally. */
  base: string
  /** gear type -> item id -> photos, in order (the first is the primary) */
  photos: Record<string, Record<string, PhotoKeys[]>>
  /** gear type -> item id -> the item's own documents */
  manuals: Record<string, Record<string, ManualKey[]>>
  /** gear type -> brand name (as items carry it) -> range-wide documents */
  brandManuals: Record<string, Record<string, ManualKey[]>>
  /** brand name -> logo key */
  logos: Record<string, string>
}

/** A photo as an entry stores it: its media id and both keys. */
export interface StoredPhoto extends PhotoKeys {
  id: string
}

export interface StoredManual extends ManualKey {
  id: string
}

export type UploadPurpose = 'photo' | 'logo' | 'manual'

/** Where to post one file: a multipart form, `fields` first and the file last. */
export interface UploadTarget {
  upload: string
  url: string
  fields: Record<string, string>
  expires_at: string
}

/** One element of the photo list a media edit sends: kept, or new. */
export type PhotoRef = { id: string } | { upload: { small: string; large: string } }

export type ManualRef = ({ id: string } | { upload: string }) & { title: string }
