// The manuals manifest's arithmetic: turning a curated filename into the row a
// reader sees, and checking that what the manifest claims is actually on disk.
//
// Here rather than in Cypress because none of it is visible on screen — the
// title comes out of the filename, and a manifest entry pointing at a file that
// was renamed or deleted renders an empty <object>, which looks like a slow
// load rather than a break.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandManualEntries, manualEntries, manualLabel } from '../../src/utils/manuals.ts'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(
  readFileSync(path.join(FRONTEND, 'src/data/gearManuals.json'), 'utf8'),
) as Record<string, Record<string, string[]>>
const brandManifest = JSON.parse(
  readFileSync(path.join(FRONTEND, 'src/data/brandManuals.json'), 'utf8'),
) as Record<string, Record<string, string[]>>
const abbrevs = new Set(
  Object.values(
    JSON.parse(readFileSync(path.join(FRONTEND, 'src/data/brandAbbrev.json'), 'utf8')) as Record<
      string,
      string
    >,
  ),
)

test('a bare product key is a user manual', () => {
  assert.equal(manualLabel('landcruise_aeon.pdf', 'landcruise_aeon'), 'User manual')
})

test('a title in the filename is the label, de-slugified', () => {
  assert.equal(
    manualLabel('landcruise_aeon-product-archive.pdf', 'landcruise_aeon'),
    'Product archive',
  )
  assert.equal(manualLabel('bc_type-18-datasheet.pdf', 'bc_type-18'), 'Datasheet')
})

test('a numeric tail keeps the image convention rather than reading as a title', () => {
  // Two untitled PDFs for one product must not render two rows both saying
  // "User manual".
  assert.equal(manualLabel('landcruise_aeon-2.pdf', 'landcruise_aeon'), 'User manual 2')
})

test('a product whose name ends in a number keeps its own manual', () => {
  // Slack Inov sell a "Vortex" and a "Vortex 2", and the Vortex 2 manual is the
  // only one of the pair we hold. Read as the image convention it would be
  // "User manual 2" of the ORIGINAL Vortex — a manual filed against the wrong
  // product. The manifest builder resolves the longest matching product key, so
  // the stem IS the key here, and the label is the plain default.
  assert.equal(manualLabel('slackinov_vortex-2.pdf', 'slackinov_vortex-2'), 'User manual')
  assert.deepEqual(manifest.leashrings?.['slackinov_vortex-2'], ['slackinov_vortex-2.pdf'])
  assert.equal(manifest.leashrings?.slackinov_vortex, undefined)
})

test('a stem that is not the key at all falls back to the whole stem', () => {
  // Only reachable via a manifest built from a file whose product no longer
  // exists — never silently blank.
  assert.equal(manualLabel('mystery-file.pdf', 'landcruise_aeon'), 'Mystery file')
})

test('entries carry a URL under the gear type, in manifest order', () => {
  const entries = manualEntries(
    ['landcruise_aeon-product-archive.pdf', 'landcruise_aeon-2.pdf'],
    'landcruise_aeon',
    '/gear-manuals/webbings',
  )
  assert.deepEqual(entries.map(e => e.label), ['Product archive', 'User manual 2'])
  assert.equal(entries[0].url, '/gear-manuals/webbings/landcruise_aeon-product-archive.pdf')
})

test('a product with no manuals produces no entries', () => {
  assert.deepEqual(manualEntries([], 'bc_type-18', '/gear-manuals/webbings'), [])
})

test('the seeded Landcruising Aeon archive is in the manifest', () => {
  assert.deepEqual(manifest.webbings?.landcruise_aeon, ['landcruise_aeon-product-archive.pdf'])
})

test('every file the manifest names exists in public/gear-manuals', () => {
  for (const [gearType, byKey] of Object.entries(manifest)) {
    for (const files of Object.values(byKey)) {
      for (const file of files) {
        const full = path.join(FRONTEND, 'public/gear-manuals', gearType, file)
        assert.ok(existsSync(full), `${gearType}/${file} is in the manifest but not on disk`)
      }
    }
  }
})

// ── Range-wide (brand) manuals ───────────────────────────────────────────────
// One PDF covering a maker's whole webbing line, filed once under the brand
// abbreviation instead of copied onto every product key.

test('a range-wide document is titled by the same rule as a product one', () => {
  const entries = brandManualEntries(
    ['bc-webbing-manual.pdf', 'bc.pdf'],
    'bc',
    '/gear-manuals/webbings/brand',
    'Applies to all Balance Community webbings',
  )
  assert.deepEqual(entries.map(e => e.label), ['Webbing manual', 'User manual'])
  assert.equal(entries[0].url, '/gear-manuals/webbings/brand/bc-webbing-manual.pdf')
})

test('every range-wide row carries the scope caption, and product rows carry none', () => {
  // The caption is the whole difference between the two kinds of row: an
  // untitled brand PDF renders "User manual" on a page about one product, and
  // without the caption that reads as a claim about that product.
  const [brandRow] = brandManualEntries(['bc.pdf'], 'bc', '/d', 'Applies to all X webbings')
  assert.equal(brandRow.appliesTo, 'Applies to all X webbings')
  const [productRow] = manualEntries(['landcruise_aeon.pdf'], 'landcruise_aeon', '/d')
  assert.equal(productRow.appliesTo, undefined)
})

test('a brand with no range-wide document produces no entries', () => {
  assert.deepEqual(brandManualEntries([], 'bc', '/d', 'Applies to all X webbings'), [])
})

test('every brand-manifest key is a real brand abbreviation', () => {
  // A key that matches no abbreviation is a filename typo: the manifest holds
  // it, nothing ever looks it up, and the document silently never renders.
  for (const [gearType, byKey] of Object.entries(brandManifest)) {
    for (const key of Object.keys(byKey)) {
      assert.ok(abbrevs.has(key), `${gearType}/brand/${key} is not in brandAbbrev.json`)
    }
  }
})

test('every file the brand manifest names exists under <type>/brand', () => {
  for (const [gearType, byKey] of Object.entries(brandManifest)) {
    for (const files of Object.values(byKey)) {
      for (const file of files) {
        const full = path.join(FRONTEND, 'public/gear-manuals', gearType, 'brand', file)
        assert.ok(existsSync(full), `${gearType}/brand/${file} is in the manifest but not on disk`)
      }
    }
  }
})

test('no product key leaks into the brand manifest', () => {
  // The two manifests are keyed differently on purpose — a product key always
  // contains an underscore, a brand key never does — which is what makes
  // `bc.pdf` unambiguous next to `bc_mightylock.pdf`.
  for (const byKey of Object.values(brandManifest)) {
    for (const key of Object.keys(byKey)) {
      assert.ok(!key.includes('_'), `${key} looks like a product key, not a brand`)
    }
  }
})

test('every PDF on disk is in one of the two manifests', () => {
  // The other direction: a file added to public/ without re-running
  // scripts/build_gear_manifest.py is a document nobody can reach, and it looks
  // exactly like a document we simply do not hold.
  const root = path.join(FRONTEND, 'public/gear-manuals')
  if (!existsSync(root)) return
  for (const gearType of readdirSync(root)) {
    const dir = path.join(root, gearType)
    for (const file of readdirSync(dir).filter(f => f.endsWith('.pdf'))) {
      const listed = Object.values(manifest[gearType] ?? {}).some(fs => fs.includes(file))
      assert.ok(listed, `${gearType}/${file} is on disk but in no manifest`)
    }
    const brandDir = path.join(dir, 'brand')
    if (!existsSync(brandDir)) continue
    for (const file of readdirSync(brandDir).filter(f => f.endsWith('.pdf'))) {
      const listed = Object.values(brandManifest[gearType] ?? {}).some(fs => fs.includes(file))
      assert.ok(listed, `${gearType}/brand/${file} is on disk but in no manifest`)
    }
  }
})
