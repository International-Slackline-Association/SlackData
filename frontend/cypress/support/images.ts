// Test-side view of the media manifest (GET /media/manifest, live editing
// phase 4), so image specs can assert against the real photo set for a product
// rather than whatever the DOM happens to show.
//
// The lookup mirrors `imageUrls()` in src/utils/images.ts: photos are data on
// each item, keyed by its id. Each photo is named by its key without the size
// (`webbings/42/<media id>`), which both of its URLs contain — the card shows
// the 480 px one first and swaps in the 1600 px one (P4-D), and a spec should
// not care which it catches.
//
// Call `loadImageManifest()` in a `before()`: the lookups are synchronous.

type Photo = { small: string; large: string }
type Manifest = { base: string; photos: Record<string, Record<string, Photo[]>> }

let manifest: Manifest | null = null

export function loadImageManifest(): Cypress.Chainable<Manifest> {
  return cy.request<Manifest>(`${Cypress.env('apiUrl')}/media/manifest`).then(response => {
    manifest = response.body
    return response.body
  })
}

// Every photo of a product, as its size-less key (first = primary).
export function imageFilesFor(gearType: string, item: { id?: unknown }): string[] {
  if (!manifest) throw new Error('loadImageManifest() first, in a before()')
  return (manifest.photos[gearType]?.[String(item.id)] ?? []).map(p => p.large.replace(/-\d+\.\w+$/, ''))
}
