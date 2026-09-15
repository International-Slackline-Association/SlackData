// The command that files a manufacturer record's photo links.
//
// The API records `image_urls` and fetches nothing; the operator runs
// scripts/fetch_submission_images.py when applying the update, and the approved
// triage row shows the exact invocation built here. See MANUFACTURER_API_PLAN.md
// § Step 4 — photos as links.
//
// Two things make this worth a module and a unit test rather than a template
// string in AdminPage:
//
// - **Every argument came from outside** (the brand's name, the product's name,
//   URLs the brand chose) and the admin pastes the result into a shell. So each
//   one is single-quoted for a POSIX shell, where nothing but `'` is special.
// - **The name is the one the product will have after the patch.** Images are
//   keyed by `<brand-abbrev>_<name-slug>`, so photos filed under the pre-rename
//   name land on a key nothing renders.

import type { Submission } from '@/types'

const SCRIPT = 'python3 scripts/fetch_submission_images.py'

/** `it's` -> `'it'\''s'`: close the quote, emit an escaped quote, reopen. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** The full command, or null when there is nothing to file or nowhere to file it. */
export function imageFetchCommand(submission: Submission): string | null {
  const urls = submission.image_urls ?? []
  const name = submission.changes.name ?? submission.gear_name
  const brand = submission.gear_brand
  if (urls.length === 0 || !name || !brand) return null

  return [
    SCRIPT,
    `--gear-type ${shellQuote(submission.gear_type)}`,
    `--brand ${shellQuote(brand)}`,
    `--name ${shellQuote(name)}`,
    ...urls.map(shellQuote),
  ].join(' ')
}

/** A readable label for a photo link: its filename, else its host, else itself. */
export function photoLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : parsed.hostname
  } catch {
    return url
  }
}
