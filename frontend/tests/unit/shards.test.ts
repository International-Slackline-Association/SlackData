// The CI shard split has to stay in step with cypress/e2e/.
//
// Here rather than in Cypress for the obvious reason: a spec missing from
// cypress/shards.json does not run, so the suite that would have caught it is
// the one that stopped running. It has to be checked from outside — and this is
// the suite that costs nothing, so a forgotten spec fails in `npm run test:unit`
// (~seconds) rather than surviving a green 8-minute e2e run.
//
// The check itself lives in scripts/check-shards.mjs, which CI's shard-planning
// job also runs before it emits the job matrix.

import test from 'node:test'
import assert from 'node:assert/strict'
import { checkShards, readManifest, specGlobs, specsOnDisk } from '../../scripts/check-shards.mjs'

test('every spec in cypress/e2e/ is in exactly one shard', () => {
  assert.deepEqual(checkShards(), [])
})

test('the shards cover the whole suite and nothing twice', () => {
  const { shards } = readManifest()
  const sharded = shards.flatMap((s: { specs: string[] }) => s.specs)
  assert.equal(new Set(sharded).size, sharded.length, 'a spec is listed in two shards')
  assert.deepEqual([...sharded].sort(), specsOnDisk().sort())
})

test('a shard becomes a Cypress --spec argument', () => {
  const { shards } = readManifest()
  // Expectations built from each shard's OWN spec list, not from a hardcoded
  // shard name. This used to assert that the shard called "filters" was the
  // lone-spec one, which made a packing decision into a test: rebalancing the
  // shards then failed here for no reason to do with globs.
  for (const shard of shards as { specs: string[] }[]) {
    assert.equal(specGlobs(shard), shard.specs.map(s => `cypress/e2e/${s}.cy.ts`).join(','))
  }
  // Multi-spec shards are comma-joined, which is what `cypress run --spec` takes.
  const multi = (shards as { specs: string[] }[]).find(s => s.specs.length > 1)
  assert.match(specGlobs(multi), /^cypress\/e2e\/\S+\.cy\.ts(,cypress\/e2e\/\S+\.cy\.ts)+$/)
})
