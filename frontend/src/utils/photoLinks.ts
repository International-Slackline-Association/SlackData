// Photo links a manufacturer sends with an update (`image_urls`, see
// MANUFACTURER_API_PLAN.md § Step 4). The API stores them and fetches nothing;
// an admin opens each one and adds the photo on the item's page, through
// Photos and manuals (live editing phase 4). Nothing downloads them for us.

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
