// Test-side view of the gear-image manifest, so image specs can assert against
// the real image set for a product rather than whatever the DOM happens to show.
//
// The lookup mirrors `imageUrls()` in src/utils/images.ts: photos are filed by
// id (gear-images/<type>/<id>_<slug>/), so the manifest is keyed by the item's
// id. It is duplicated (not imported) on purpose: src/utils/images.ts reads
// `import.meta.env` at module scope, which the Cypress preprocessor cannot
// evaluate. The manifest IS imported from src, so only the one-line lookup could
// ever drift — and gear_cards.cy.ts fails loudly if it does.

import gearImages from '../../src/data/gearImages.json'

const manifest = gearImages as Record<string, Record<string, string[]>>

// Every image path for a product (`<id>_<slug>/<n>.<ext>`), in manifest order
// (first = primary).
export function imageFilesFor(gearType: string, item: { id?: unknown }): string[] {
  return manifest[gearType]?.[String(item.id)] ?? []
}
