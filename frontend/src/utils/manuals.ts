// Manuals & documents — the PDFs a manufacturer publishes about a product.
//
// This file is the pure half: filename -> row. It imports nothing, so
// tests/unit/manuals.test.ts can run it under bare node; the manifest lookup
// that feeds it lives in utils/images.ts, beside the image one it shares a
// folder layout and a hosting switch with.
//
// Each item's documents sit in its own folder (gear-manuals/<type>/<id>_<slug>/),
// and the filename IS the title, because a manuals manifest with a titles table
// beside it is two files to keep in step and one of them is hand-edited.
//   user-manual.pdf      -> "User manual"   (the common case)
//   product-archive.pdf  -> "Product archive"
//   user-manual-2.pdf    -> "User manual 2"

// `appliesTo` is set only on a RANGE-WIDE document — one a manufacturer writes
// once for a whole product class ("Applies to all Balance Community webbings").
// Absent means the document is about this item alone, which needs no caption.
// `file` is the document's path under its gear type's folder, unique on a page.
export type Manual = { file: string; label: string; url: string; appliesTo?: string }

/** Sentence-cased from a slug: "product-archive" -> "Product archive". */
function deslugify(slug: string): string {
  const words = slug.replace(/-+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

/** The row title for one manual: its filename, without folder or extension. */
export function manualLabel(path: string): string {
  const name = path.split('/').pop() ?? path
  return deslugify(name.replace(/\.[^.]+$/, ''))
}

/** One row per document, in manifest order; `paths` are under `baseDir`. */
export function manualEntries(paths: string[], baseDir: string): Manual[] {
  return paths.map(path => ({ file: path, label: manualLabel(path), url: `${baseDir}/${path}` }))
}

/** One row per range-wide document — titled by the same rule as a product's,
 *  because a reader is looking at one list and two title conventions in it
 *  would read as a bug. What distinguishes these rows is `appliesTo`. */
export function brandManualEntries(paths: string[], baseDir: string, appliesTo: string): Manual[] {
  return paths.map(path => ({
    file: `brand/${path}`,
    label: manualLabel(path),
    url: `${baseDir}/${path}`,
    appliesTo,
  }))
}
