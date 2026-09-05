// Guards the CI shard split in cypress/shards.json.
//
// Sharding buys ~30 minutes of wall clock and introduces exactly one new way to
// lose coverage: a spec that is in cypress/e2e/ but in no shard never runs, and
// CI stays green while doing it. Nothing about that failure is visible — no
// error, no skipped count, just a slightly faster run. So the invariant is
// checked on the source, the way infra/check-routes.py checks the API Gateway
// route/throttle invariant:
//
//   * every spec file on disk appears in exactly one shard
//   * every spec named in a shard exists on disk
//
// Two callers, one script: `npm run test:unit` (tests/unit/shards.test.ts) and
// the CI shard-planning job, which also uses `--matrix` to emit the job matrix
// so the split has a single source of truth.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const E2E_DIR = path.join(FRONTEND, 'cypress', 'e2e')
const MANIFEST = path.join(FRONTEND, 'cypress', 'shards.json')

/** Spec base names on disk, e.g. "filters" — recursive, matching `specPattern`. */
export function specsOnDisk(dir = E2E_DIR, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...specsOnDisk(path.join(dir, entry.name), `${prefix}${entry.name}/`))
    } else if (entry.name.endsWith('.cy.ts')) {
      found.push(prefix + entry.name.slice(0, -'.cy.ts'.length))
    }
  }
  return found
}

export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

/** The Cypress `--spec` argument for one shard. */
export function specGlobs(shard) {
  return shard.specs.map(name => `cypress/e2e/${name}.cy.ts`).join(',')
}

/**
 * Every way the manifest can disagree with the filesystem, as a list of
 * human-readable problems. Empty list == the split is sound.
 */
export function checkShards() {
  const { shards } = readManifest()
  const problems = []

  const seen = new Map() // spec -> shard names holding it
  for (const shard of shards) {
    if (!shard.specs.length) problems.push(`shard "${shard.name}" is empty`)
    for (const spec of shard.specs) {
      const holders = seen.get(spec) ?? []
      holders.push(shard.name)
      seen.set(spec, holders)
    }
  }

  const onDisk = new Set(specsOnDisk())

  for (const [spec, holders] of seen) {
    if (holders.length > 1) {
      problems.push(`"${spec}" is in ${holders.length} shards (${holders.join(', ')}) — it would run twice`)
    }
    if (!onDisk.has(spec)) {
      problems.push(`shard "${holders[0]}" names "${spec}", which is not a file in cypress/e2e/`)
    }
  }

  for (const spec of [...onDisk].sort()) {
    if (!seen.has(spec)) {
      problems.push(`"${spec}.cy.ts" is in no shard — it would never run. Add it to cypress/shards.json.`)
    }
  }

  return problems
}

// --- CLI -------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkShards()
  if (problems.length) {
    console.error('cypress/shards.json does not match cypress/e2e/:\n')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  if (process.argv.includes('--matrix')) {
    // The GitHub Actions job matrix, one entry per shard.
    const { shards } = readManifest()
    process.stdout.write(
      JSON.stringify(shards.map(s => ({ name: s.name, specs: specGlobs(s) }))),
    )
  } else {
    const { shards } = readManifest()
    const total = shards.reduce((n, s) => n + s.specs.length, 0)
    console.log(`cypress/shards.json: ${total} specs across ${shards.length} shards, all accounted for.`)
  }
}
