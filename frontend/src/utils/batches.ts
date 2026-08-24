// Grouping the triage queue into the calls that produced it.
//
// A manufacturer posts one request covering N products and the API writes N
// submissions sharing a `batch_id` — one record per product, because the unit
// an admin acts on is one product's JSON patch. Rendering forty separate rows
// with the same brand and timestamp is the unusable version of that, so triage
// puts them back together for display only.
//
// Members of a batch are always contiguous in the queue: their ids are ULIDs
// minted in one loop, so they sort adjacently, and the queue is ordered by id.
// Grouping therefore only ever needs to look at the previous row — no sorting,
// no reordering, and the server's oldest-first order is preserved exactly.

import type { Submission } from '@/types'

export interface SubmissionGroup {
  /** The batch id, or the submission id for a row that stands alone. */
  key: string
  /** Null for a standalone row — the caller renders those as it always has. */
  batchId: string | null
  rows: Submission[]
}

/**
 * Consecutive rows sharing a `batch_id` become one group; everything else
 * becomes a group of one. Order is never changed.
 */
export function groupByBatch(rows: Submission[]): SubmissionGroup[] {
  const groups: SubmissionGroup[] = []

  for (const row of rows) {
    const previous = groups[groups.length - 1]
    if (row.batch_id && previous?.batchId === row.batch_id) {
      previous.rows.push(row)
      continue
    }
    groups.push({
      key: row.batch_id ?? row.submission_id,
      batchId: row.batch_id ?? null,
      rows: [row],
    })
  }

  return groups
}

/** The brand a batch came from, for its header. Every row in a batch carries
 *  the same one — it is set from the verified credential, not from the body. */
export function batchBrand(group: SubmissionGroup): string | null {
  return group.rows[0]?.gear_brand ?? null
}
