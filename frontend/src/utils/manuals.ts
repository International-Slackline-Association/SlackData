// Manuals & documents — the PDFs a manufacturer publishes about a product.
//
// This file is the pure half: a stored document -> the row a reader sees. It
// imports nothing, so tests/unit/manuals.test.ts can run it under bare node;
// the manifest lookup that feeds it lives in utils/images.ts.
//
// Each document carries its own title, typed when it was uploaded (or, for the
// documents migrated from the repo, taken once from the filename —
// slack_data/media/migrate.py title_of): "User manual", "Test certificate".

// `appliesTo` is set only on a RANGE-WIDE document — one a manufacturer writes
// once for a whole product class ("Applies to all Balance Community webbings").
// Absent means the document is about this item alone, which needs no caption.
// `file` is the document's media key, unique on a page.
export type Manual = { file: string; label: string; url: string; appliesTo?: string }

export type StoredDocument = { file: string; title: string }

/** One row per document, in stored order. `url` turns a key into its URL. */
export function manualEntries(documents: StoredDocument[], url: (key: string) => string): Manual[] {
  return documents.map(d => ({ file: d.file, label: d.title, url: url(d.file) }))
}

/** One row per range-wide document — titled the same way as a product's,
 *  because a reader is looking at one list. What distinguishes these rows is
 *  `appliesTo`. */
export function brandManualEntries(
  documents: StoredDocument[],
  url: (key: string) => string,
  appliesTo: string,
): Manual[] {
  return documents.map(d => ({ file: d.file, label: d.title, url: url(d.file), appliesTo }))
}

/** "user-manual_v2.pdf" -> "User manual v2": the title a new upload starts
 *  with, which the editor can change — as the migration titled today's files. */
export function titleFromFilename(name: string): string {
  const words = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Document'
}
