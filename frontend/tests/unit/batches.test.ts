// Unit tests for the triage queue's batch grouping — `npm run test:unit`.
//
// A manufacturer's single call writes one row per product, and triage groups
// them back for display. The grouping must never reorder: the server sorts the
// queue oldest-first and that order is the whole contract of the page, so a
// grouping that sorted by anything of its own would silently break it. That is
// arithmetic over an array rather than anything you can see in a screenshot,
// which is why it lives here and not in Cypress.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { groupByBatch, batchBrand } from '../../src/utils/batches.ts'
import type { Submission } from '../../src/types/submission.ts'

let counter = 0

function row(overrides: Partial<Submission> = {}): Submission {
  counter += 1
  return {
    submission_id: `01J000000000000000000000${counter.toString(36).toUpperCase()}`,
    kind: 'correction',
    gear_type: 'webbings',
    gear_id: 1,
    gear_name: 'Type 18',
    gear_brand: null,
    changes: {},
    note: null,
    source_url: null,
    submitter_email: null,
    submitted_by: null,
    brand_id: null,
    batch_id: null,
    manufacturer_sku: null,
    status: 'pending',
    created_at: '2026-08-19T12:00:00.000Z',
    reviewed_at: null,
    review_note: null,
    expires_at: null,
    ...overrides,
  }
}

describe('groupByBatch', () => {
  test('leaves unbatched rows alone, one group each', () => {
    const rows = [row(), row(), row()]
    const groups = groupByBatch(rows)
    assert.equal(groups.length, 3)
    assert.deepEqual(groups.map(g => g.batchId), [null, null, null])
    // The key falls back to the submission id so React still has one per row.
    assert.deepEqual(groups.map(g => g.key), rows.map(r => r.submission_id))
  })

  test('collects consecutive rows of one batch', () => {
    const groups = groupByBatch([
      row({ batch_id: 'B1' }),
      row({ batch_id: 'B1' }),
      row({ batch_id: 'B1' }),
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0].rows.length, 3)
    assert.equal(groups[0].batchId, 'B1')
  })

  test('keeps two batches apart', () => {
    const groups = groupByBatch([
      row({ batch_id: 'B1' }),
      row({ batch_id: 'B1' }),
      row({ batch_id: 'B2' }),
    ])
    assert.deepEqual(groups.map(g => g.rows.length), [2, 1])
  })

  test('a batch interrupted by another row does not swallow it', () => {
    // Cannot happen with ULID ordering, but a grouping that reached backwards
    // would hide an unrelated submission inside a manufacturer's batch — the
    // one failure here that would actually lose someone's report.
    const groups = groupByBatch([
      row({ batch_id: 'B1' }),
      row(),
      row({ batch_id: 'B1' }),
    ])
    assert.equal(groups.length, 3)
  })

  test('preserves the server order exactly', () => {
    const rows = [row({ batch_id: 'B1' }), row(), row({ batch_id: 'B2' }), row({ batch_id: 'B2' })]
    const flattened = groupByBatch(rows).flatMap(g => g.rows)
    assert.deepEqual(flattened.map(r => r.submission_id), rows.map(r => r.submission_id))
  })

  test('handles an empty queue', () => {
    assert.deepEqual(groupByBatch([]), [])
  })
})

describe('batchBrand', () => {
  test('reports the brand every row in the batch carries', () => {
    const groups = groupByBatch([
      row({ batch_id: 'B1', gear_brand: 'Alpha Slacklines' }),
      row({ batch_id: 'B1', gear_brand: 'Alpha Slacklines' }),
    ])
    assert.equal(batchBrand(groups[0]), 'Alpha Slacklines')
  })

  test('is null when there is no brand to show', () => {
    assert.equal(batchBrand(groupByBatch([row()])[0]), null)
  })
})
