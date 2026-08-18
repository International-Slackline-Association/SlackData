// ISA gear-warning data access.
//
// The whole table is ~90 rows for the entire catalogue, so it is fetched once
// and indexed client-side rather than queried per item — the same treatment FX
// rates get. `GET /isawarning/` also accepts gear_type / gear_id filters if a
// per-item fetch is ever wanted.

import type { IsaGearWarning } from '@/types'
import { getPage } from './client'

export function fetchIsaWarnings(): Promise<IsaGearWarning[]> {
  return getPage<IsaGearWarning>('isawarning', 0, 500)
}

/** Key into the index built by useIsaWarnings. */
export function warningKey(gearType: string, gearId: number | string): string {
  return `${gearType}:${gearId}`
}
