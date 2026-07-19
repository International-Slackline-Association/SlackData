// Test-side view of the gear-image manifest, so image specs can assert against
// the real image set for a product rather than whatever the DOM happens to show.
//
// The key builder mirrors `imageKey()` in src/utils/images.ts. It is duplicated
// (not imported) on purpose: src/utils/images.ts reads `import.meta.env` at
// module scope, which the Cypress preprocessor cannot evaluate. The manifest and
// brand-abbreviation tables ARE imported from src, so only the two-line key
// format could ever drift — and gear_cards.cy.ts fails loudly if it does.

import gearImages from '../../src/data/gearImages.json'
import brandAbbrev from '../../src/data/brandAbbrev.json'
import { slugify } from '../../src/utils/slugify'

const manifest = gearImages as Record<string, Record<string, string[]>>
const abbrevMap = brandAbbrev as Record<string, string>

export function imageKey(brandName: string, name: string): string {
  return `${abbrevMap[brandName] ?? slugify(brandName)}_${slugify(name)}`
}

// Every image filename for a product, in manifest order (first = primary).
export function imageFilesFor(gearType: string, brandName: string, name: string): string[] {
  return manifest[gearType]?.[imageKey(brandName, name)] ?? []
}
