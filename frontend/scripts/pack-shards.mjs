// Packs the Cypress specs into CI shards from measured durations.
//
// The CI job is only as fast as its slowest shard, so the split has to follow
// what each spec actually costs on a runner, and that drifts: every new gear
// type adds a pass to the per-type loops in the big specs. This script keeps
// the numbers in cypress/shards.json (`durations`) and repacks from them.
//
//   node scripts/pack-shards.mjs                   repack from the stored durations
//   node scripts/pack-shards.mjs --from-run ID…    refresh durations from CI runs, then repack
//   node scripts/pack-shards.mjs --shards 7        repack into 7 shards instead of the current count
//   node scripts/pack-shards.mjs --dry-run         print the packing, write nothing
//
// --from-run reads each run's Cypress summary table through `gh`, so it needs
// gh signed in. With several runs, a spec takes its time from the first run
// listed in which it PASSED: a failing spec's time is mostly retries and
// timeouts, and would pack as if the spec were that slow. A spec that passed in
// none of them keeps its stored time, and the script says so.
//
// The packing is longest-first: each spec, slowest first, goes to the shard
// with the least work so far. Each shard is named after its slowest spec.
// check-shards.mjs still guards coverage; this script only decides the split.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readManifest, specsOnDisk } from './check-shards.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = path.join(FRONTEND, 'cypress', 'shards.json')

/** What a spec with no measurement is packed as, until a CI run measures it. */
export const UNMEASURED_SECONDS = 30

/** Terminal colour codes, which GitHub keeps in its job logs. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** "5:25" → 325, "913ms" → 1 (Cypress prints sub-second specs in ms). */
export function toSeconds(text) {
  const ms = /^(\d+)ms$/.exec(text)
  if (ms) return Math.max(1, Math.round(Number(ms[1]) / 1000))
  const parts = /^(?:(\d+):)?(\d+):(\d\d)$/.exec(text)
  if (!parts) throw new Error(`not a duration: "${text}"`)
  const [, h = '0', m, s] = parts
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/** 325 → "5:25". */
export function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * The per-spec rows of a Cypress run's closing summary table, from one job's
 * log. Colour codes are stripped first; each row reads
 * "│ ✔  filters.cy.ts   05:25   495   495   -   -   - │".
 */
export function parseCypressSummary(log) {
  const rows = []
  const plain = log.replace(ANSI_COLOUR, '')
  const row = /│\s+(✔|✖)\s+(\S+)\.cy\.ts\s+(\S+)\s+\d+/g
  for (const [, mark, spec, time] of plain.matchAll(row)) {
    rows.push({ spec, seconds: toSeconds(time), passed: mark === '✔' })
  }
  return rows
}

/**
 * Longest-first packing of `durations` ({spec: seconds}) into `count` shards.
 * Deterministic: ties go to the alphabetically first spec, and to the
 * lowest-numbered shard, so the same numbers always give the same split.
 */
export function pack(durations, count) {
  if (count < 1) throw new Error('need at least one shard')
  const specs = Object.keys(durations).sort(
    (a, b) => durations[b] - durations[a] || a.localeCompare(b),
  )
  const shards = Array.from({ length: count }, () => ({ seconds: 0, specs: [] }))
  for (const spec of specs) {
    const lightest = shards.reduce((best, s) => (s.seconds < best.seconds ? s : best))
    lightest.specs.push(spec)
    lightest.seconds += durations[spec]
  }
  return shards
    .filter(s => s.specs.length)
    .sort((a, b) => b.seconds - a.seconds)
    .map(s => ({ name: s.specs[0], estimate: formatDuration(s.seconds), specs: s.specs }))
}

/**
 * New durations from measured runs, each a list of parseCypressSummary rows,
 * in priority order. Returns the merged {spec: seconds} for exactly the specs
 * on disk, plus which specs kept an old time or have none at all.
 */
export function mergeDurations(stored, runs, onDisk) {
  const durations = {}
  const kept = []
  const unmeasured = []
  for (const spec of onDisk) {
    const measured = runs.flat().find(r => r.spec === spec && r.passed)
    if (measured) durations[spec] = measured.seconds
    else if (spec in stored) {
      durations[spec] = stored[spec]
      if (runs.length) kept.push(spec)
    } else {
      durations[spec] = UNMEASURED_SECONDS
      unmeasured.push(spec)
    }
  }
  return { durations, kept, unmeasured }
}

// --- CLI -------------------------------------------------------------------

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Every Cypress summary row from one CI run, across all of its shards. */
function measureRun(runId) {
  const jobs = JSON.parse(gh(['run', 'view', runId, '--json', 'jobs'])).jobs
    .filter(j => j.name.startsWith('cypress'))
  if (!jobs.length) throw new Error(`run ${runId} has no cypress jobs`)
  return jobs.flatMap(j =>
    parseCypressSummary(gh(['api', `repos/{owner}/{repo}/actions/jobs/${j.databaseId}/logs`])),
  )
}

function argValues(argv, flag) {
  const at = argv.indexOf(flag)
  if (at < 0) return []
  const values = []
  for (const arg of argv.slice(at + 1)) {
    if (arg.startsWith('--')) break
    values.push(arg)
  }
  return values
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const manifest = readManifest()
  const runIds = argValues(argv, '--from-run')
  const [countArg] = argValues(argv, '--shards')
  const count = countArg ? Number(countArg) : manifest.shards.length

  const stored = Object.fromEntries(
    Object.entries(manifest.durations ?? {}).map(([spec, t]) => [spec, toSeconds(t)]),
  )
  const { durations, kept, unmeasured } = mergeDurations(
    stored, runIds.map(measureRun), specsOnDisk().sort(),
  )

  for (const spec of kept) console.warn(`kept the stored time for ${spec}: it passed in none of those runs`)
  for (const spec of unmeasured) {
    console.warn(`no time for ${spec}: packed as ${formatDuration(UNMEASURED_SECONDS)} until a run measures it`)
  }

  const shards = pack(durations, count)
  for (const s of shards) console.log(`${s.estimate.padStart(6)}  ${s.name}: ${s.specs.join(', ')}`)

  if (!argv.includes('--dry-run')) {
    const next = {
      note: manifest.note,
      measured: runIds.length
        ? { runs: runIds.map(Number), at: new Date().toISOString().slice(0, 10) }
        : manifest.measured,
      durations: Object.fromEntries(
        Object.entries(durations)
          .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
          .map(([spec, s]) => [spec, formatDuration(s)]),
      ),
      shards,
    }
    writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n')
    console.log(`wrote ${path.relative(process.cwd(), MANIFEST)}`)
  }
}
