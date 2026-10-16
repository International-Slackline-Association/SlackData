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
// - **Every argument came from outside** (URLs the brand chose, the product's
//   name) and the admin pastes the result into a shell. So each one is
//   single-quoted for a POSIX shell, where nothing but `'` is special.
// - **Photos are filed by the product's id** (gear-images/<type>/<id>_<slug>/),
//   so a rename in the same record cannot misfile them. The name only labels a
//   folder the script has to create, and is the one the product will have after
//   the patch.

import type { Submission } from '@/types'

const SCRIPT = 'python3 scripts/fetch_submission_images.py'

/** `it's` -> `'it'\''s'`: close the quote, emit an escaped quote, reopen. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** The full command, or null when there is nothing to file or nowhere to file it. */
export function imageFetchCommand(submission: Submission): string | null {
  const urls = submission.image_urls ?? []
  const id = submission.gear_id
  const name = submission.changes.name ?? submission.gear_name
  if (urls.length === 0 || id === null || id === undefined || !name) return null

  return [
    SCRIPT,
    `--gear-type ${shellQuote(submission.gear_type)}`,
    `--id ${shellQuote(String(id))}`,
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
