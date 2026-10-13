// The manuals manifest's arithmetic: turning a curated filename into the row a
// reader sees, and checking that what the manifest claims is actually on disk.
//
// Here rather than in Cypress because none of it is visible on screen — the
// title comes out of the filename, and a manifest entry pointing at a file that
// was renamed or deleted renders an empty <object>, which looks like a slow
// load rather than a break.
//
// Documents are filed by id, one folder per item (gear-manuals/<type>/<id>_<slug>/)
// or per brand (gear-manuals/<type>/brand/<catalog_id>_<slug>/), and the
// filename is the title.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandManualEntries, manualEntries, manualLabel } from '../../src/utils/manuals.ts'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = (rel: string) => JSON.parse(readFileSync(path.join(FRONTEND, rel), 'utf8'))
const manifest = readJson('src/data/gearManuals.json') as Record<string, Record<string, string[]>>
const brandManifest = readJson('src/data/brandManuals.json') as Record<string, Record<string, string[]>>
const brandIds = new Set(Object.values(readJson('src/data/brandIds.json') as Record<string, number>))

test('user-manual.pdf is a user manual', () => {
  assert.equal(manualLabel('255_aeon/user-manual.pdf'), 'User manual')
})

test('the filename is the label, de-slugified, whatever folder it is in', () => {
  assert.equal(manualLabel('255_aeon/product-archive.pdf'), 'Product archive')
  assert.equal(manualLabel('datasheet.pdf'), 'Datasheet')
})

test('a language in the filename is part of the title', () => {
  // A row is a link the reader is about to follow. Where the only document a
  // maker publishes is German (Slacktivity's Super Jumpline, Slackliner.de's
  // ratchet sets), the title has to say so before the PDF opens.
  assert.equal(manualLabel('7_slackliner-de/german-user-manual.pdf'), 'German user manual')
})

test('a second untitled document is numbered, not a duplicate title', () => {
  // Two untitled PDFs for one product must not render two rows both saying
  // "User manual".
  assert.equal(manualLabel('255_aeon/user-manual-2.pdf'), 'User manual 2')
})

test('a product whose name ends in a number keeps its own manual', () => {
  // Slack Inov sell a "Vortex" and a "Vortex 2", and the Vortex 2 manual is the
  // only one of the pair we hold. Filed by id, it cannot be read as document 2
  // of the original Vortex.
  assert.deepEqual(manifest.leashrings?.['33'], ['33_vortex-2/user-manual.pdf'])
})

test('entries carry a URL under the gear type, in manifest order', () => {
  const entries = manualEntries(
    ['255_aeon/product-archive.pdf', '255_aeon/user-manual-2.pdf'],
    '/gear-manuals/webbings',
  )
  assert.deepEqual(entries.map(e => e.label), ['Product archive', 'User manual 2'])
  assert.equal(entries[0].url, '/gear-manuals/webbings/255_aeon/product-archive.pdf')
})

test('a product with no manuals produces no entries', () => {
  assert.deepEqual(manualEntries([], '/gear-manuals/webbings'), [])
})

test('the seeded Landcruising Aeon archive is in the manifest', () => {
  assert.deepEqual(manifest.webbings?.['255'], ['255_aeon/product-archive.pdf'])
})

test('every file the manifest names exists in public/gear-manuals', () => {
  for (const [gearType, byId] of Object.entries(manifest)) {
    for (const [id, files] of Object.entries(byId)) {
      for (const file of files) {
        assert.ok(file.startsWith(`${id}_`), `${gearType}/${file} is not in item ${id}'s folder`)
        const full = path.join(FRONTEND, 'public/gear-manuals', gearType, file)
        assert.ok(existsSync(full), `${gearType}/${file} is in the manifest but not on disk`)
      }
    }
  }
})

// ── Range-wide (brand) manuals ───────────────────────────────────────────────
// One PDF covering a maker's whole webbing line, filed once in the brand's
// folder instead of copied into every product's.

test('a range-wide document is titled by the same rule as a product one', () => {
  const entries = brandManualEntries(
    ['3_balance-community/webbing-manual.pdf', '3_balance-community/user-manual.pdf'],
    '/gear-manuals/webbings/brand',
    'Applies to all Balance Community webbings',
  )
  assert.deepEqual(entries.map(e => e.label), ['Webbing manual', 'User manual'])
  assert.equal(entries[0].url, '/gear-manuals/webbings/brand/3_balance-community/webbing-manual.pdf')
})

test('every range-wide row carries the scope caption, and product rows carry none', () => {
  // The caption is the whole difference between the two kinds of row: an
  // untitled brand PDF renders "User manual" on a page about one product, and
  // without the caption that reads as a claim about that product.
  const [brandRow] = brandManualEntries(['3_bc/user-manual.pdf'], '/d', 'Applies to all X webbings')
  assert.equal(brandRow.appliesTo, 'Applies to all X webbings')
  const [productRow] = manualEntries(['255_aeon/user-manual.pdf'], '/d')
  assert.equal(productRow.appliesTo, undefined)
})

test('a brand row and a product row never share a key on one page', () => {
  const [brandRow] = brandManualEntries(['3_x/user-manual.pdf'], '/d', 'Applies to all')
  const [productRow] = manualEntries(['3_x/user-manual.pdf'], '/d')
  assert.notEqual(brandRow.file, productRow.file)
})

test('a brand with no range-wide document produces no entries', () => {
  assert.deepEqual(brandManualEntries([], '/d', 'Applies to all X webbings'), [])
})

test('every brand-manifest key is a real brand id', () => {
  // A folder whose id matches no brand is a typo: the manifest holds it,
  // nothing ever looks it up, and the document silently never renders.
  for (const [gearType, byId] of Object.entries(brandManifest)) {
    for (const id of Object.keys(byId)) {
      assert.ok(brandIds.has(Number(id)), `${gearType}/brand/${id} is not a catalog_id in brandIds.json`)
    }
  }
})

test('every file the brand manifest names exists under <type>/brand', () => {
  for (const [gearType, byId] of Object.entries(brandManifest)) {
    for (const files of Object.values(byId)) {
      for (const file of files) {
        const full = path.join(FRONTEND, 'public/gear-manuals', gearType, 'brand', file)
        assert.ok(existsSync(full), `${gearType}/brand/${file} is in the manifest but not on disk`)
      }
    }
  }
})

test('every PDF on disk is in one of the two manifests', () => {
  // The other direction: a file added to public/ without re-running
  // scripts/build_gear_manifest.py is a document nobody can reach, and it looks
  // exactly like a document we simply do not hold.
  const root = path.join(FRONTEND, 'public/gear-manuals')
  if (!existsSync(root)) return
  const pdfsUnder = (dir: string): string[] =>
    readdirSync(dir).flatMap(folder => {
      const full = path.join(dir, folder)
      return statSync(full).isDirectory()
        ? readdirSync(full).filter(f => f.endsWith('.pdf')).map(f => `${folder}/${f}`)
        : []
    })
  for (const gearType of readdirSync(root)) {
    const dir = path.join(root, gearType)
    for (const file of pdfsUnder(dir).filter(f => !f.startsWith('brand/'))) {
      const listed = Object.values(manifest[gearType] ?? {}).some(fs => fs.includes(file))
      assert.ok(listed, `${gearType}/${file} is on disk but in no manifest`)
    }
    const brandDir = path.join(dir, 'brand')
    if (!existsSync(brandDir)) continue
    for (const file of pdfsUnder(brandDir)) {
      const listed = Object.values(brandManifest[gearType] ?? {}).some(fs => fs.includes(file))
      assert.ok(listed, `${gearType}/brand/${file} is on disk but in no manifest`)
    }
  }
})
