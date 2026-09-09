// Manuals & documents — the PDFs a manufacturer publishes about a product.
//
// This file is the pure half: filename -> row. It imports nothing, so
// tests/unit/manuals.test.ts can run it under bare node; the manifest lookup
// that feeds it lives in utils/images.ts, beside the image one it shares a key
// and a hosting switch with.
//
// The filename carries the title, because a manuals manifest with a titles
// table beside it is two files to keep in step and one of them is hand-edited.
//   landcruise_aeon.pdf                  -> "User manual"   (the common case)
//   landcruise_aeon-product-archive.pdf  -> "Product archive"
//   landcruise_aeon-2.pdf                -> "User manual 2" (image convention)

// `appliesTo` is set only on a RANGE-WIDE document — one a manufacturer writes
// once for a whole product class ("Applies to all Balance Community webbings").
// Absent means the document is about this item alone, which needs no caption.
export type Manual = { file: string; label: string; url: string; appliesTo?: string }

const DEFAULT_LABEL = 'User manual'

/** Sentence-cased from a slug: "product-archive" -> "Product archive". */
function deslugify(slug: string): string {
  const words = slug.replace(/-+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

/** The row title for one manual filename, given the product key it sits under. */
export function manualLabel(file: string, key: string): string {
  const stem = file.replace(/\.[^.]+$/, '')
  if (stem === key) return DEFAULT_LABEL
  const tail = stem.startsWith(`${key}-`) ? stem.slice(key.length + 1) : stem
  // A purely numeric tail is an index, not a title — same rule the image
  // manifest parses filenames by, so the two conventions can't contradict.
  if (/^\d+$/.test(tail)) return `${DEFAULT_LABEL} ${tail}`
  return deslugify(tail)
}

/** One row per document, in manifest order, URLs under `baseDir`. */
export function manualEntries(files: string[], key: string, baseDir: string): Manual[] {
  return files.map(file => ({ file, label: manualLabel(file, key), url: `${baseDir}/${file}` }))
}

/** One row per range-wide document, keyed by brand abbreviation rather than product.
 *
 * The label rule is deliberately the same one products use — `bc.pdf` is a
 * "User manual", `bc-webbing-manual.pdf` is a "Webbing manual" — because a
 * reader is looking at one list and two title conventions in it would read as
 * a bug. What distinguishes these rows is `appliesTo`, not their title.
 */
export function brandManualEntries(
  files: string[],
  abbrev: string,
  baseDir: string,
  appliesTo: string,
): Manual[] {
  return files.map(file => ({
    file,
    label: manualLabel(file, abbrev),
    url: `${baseDir}/${file}`,
    appliesTo,
  }))
}
