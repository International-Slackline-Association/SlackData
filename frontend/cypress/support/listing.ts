// What the listing renders for a set of API rows. Generic parts several shops
// sell are one catalogue row per shop but ONE card (src/utils/groups.ts), so a
// test that counts cards against API rows must count listing units instead —
// and must collapse AFTER applying its own filters, exactly as the page does
// (filter the shop rows, then collapse), or a group with one matching shop
// would be counted wrong.
import { collapseGroups } from '../../src/utils/groups'

export function listingUnits<T>(rows: T[]): T[] {
  return collapseGroups(rows as unknown as Record<string, unknown>[]) as unknown as T[]
}
