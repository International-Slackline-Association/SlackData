// Pure helpers for the listing's Table view (components/gear/GearTable.tsx).
//
// Both of these are arithmetic-free but decision-heavy, which is exactly what a
// screenshot can't check — so they live here and are covered by
// tests/unit/table.test.ts rather than only by the e2e spec.

import type { SortSpec } from '@/hooks/useUrlState'
import type { SpecRowDef, PriceFormatter } from '@/config/specRows'
import type { AnyItem } from '@/utils/format'
// Relative and extension-bearing, not '@/utils/stretch': tests/unit runs these
// through node's type stripping, which resolves neither the path alias nor an
// extensionless specifier. Same reason utils/brandSections.ts imports
// './compare.ts'.
import { percentAtRoundedKn } from './stretch.ts'

// One column per integer kN. The curves we hold run from 1 to 40 kN and every
// integer in that span is measured on at least one webbing, so all forty
// columns survive the dead-column filter below. That is a lot of table — which
// is the point: the whole span is there to be ranked on, and horizontal scroll
// carries it.
export const STRETCH_KN_MIN = 1
export const STRETCH_KN_MAX = 40

// Field prefix, and the one place the group heading is written. The columns are
// headed by their kN ALONE ("10", not "Stretch @10 kN") and the words are said
// once, in a spanning header above them — repeating them forty times set the
// width of every column to its heading rather than to its numbers, which on a
// table already forty columns wide is most of the scrolling.
export const STRETCH_FIELD_PREFIX = 'stretch@'
export const STRETCH_GROUP_LABEL = 'Stretch @ kN'

export function isStretchColumn(field: string): boolean {
  return field.startsWith(STRETCH_FIELD_PREFIX)
}

// The synthetic columns that replace the single Stretch cell. Their field is
// `stretch@N` — the sort field utils/sort.ts already understands and the Sort
// dropdown already writes for its own stretch rows, so a header click here and
// a dropdown pick are the same piece of URL state.
export function stretchColumns(): SpecRowDef[] {
  const columns: SpecRowDef[] = []
  for (let kn = STRETCH_KN_MIN; kn <= STRETCH_KN_MAX; kn++) {
    columns.push({
      field: `${STRETCH_FIELD_PREFIX}${kn}`,
      // The load alone. What it means is in STRETCH_GROUP_LABEL above the block.
      label: String(kn),
      value: item => {
        const percent = percentAtRoundedKn(item.stretch, kn)
        return percent == null ? '' : `${percent}%`
      },
    })
  }
  return columns
}

// The columns to draw: every spec row at least one item of this gear type
// populates, in the order specRows.ts declares them (which IS the relevance
// order — see the note at the top of that file).
//
// Dropping the dead ones matters far more here than on the compare page, where
// a "—" column is at least narrow. A column is a permanent slice of horizontal
// scroll: `colors` is configured for webbings/weblocks/rollers and null for
// every row we hold, so keeping it would cost every reader a scroll past an
// empty stripe on three gear types. Keyed off the WHOLE dataset, not the
// filtered set, so the column list doesn't reshuffle as you type in the search
// box — a table whose columns move while you filter is unreadable.
export function tableColumns(
  rows: SpecRowDef[],
  items: AnyItem[],
  money?: PriceFormatter,
  visible: AnyItem[] = items,
): SpecRowDef[] {
  const kept: SpecRowDef[] = []
  for (const row of rows) {
    // The one row that is not one column: a stretch curve is a series, and the
    // table's job is to let you rank on a load. It expands in place, so the
    // columns land where specRows.ts put stretch in the relevance order.
    //
    // And it is the one block measured against the VISIBLE rows rather than the
    // whole gear type. The other columns are deliberately stable — which specs
    // exist is a property of webbing, and a table whose columns move while you
    // type is unreadable — but the kN block is forty columns wide and mostly
    // empty at the top end: only 29 curves reach past 20 kN. Filter to a
    // brand's range and the ceiling drops with it, so the columns you scroll
    // are the loads your results were actually measured at. Interior gaps go
    // the same way, by the same rule.
    if (row.render === 'stretch') {
      for (const column of stretchColumns()) {
        if (visible.some(it => column.value(it, money) !== '')) kept.push(column)
      }
      continue
    }
    if (items.length === 0 || items.some(it => row.value(it, money) !== '')) kept.push(row)
  }
  return kept
}

// What a header click means. First click on a column sorts it ascending;
// clicking the active column flips the direction. It never cycles back to
// "unsorted": the listing has no unsorted state (a null sort is Name A→Z), so a
// third click would silently jump the rows to a different ordering than the
// header still claims.
export function nextSort(current: SortSpec | null, field: string): SortSpec {
  if (current?.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { field, direction: 'asc' }
}

// A header's sort state, for both the data-sort attribute the spec reads and
// the aria-sort the screen reader announces — one derivation, so the two can't
// disagree about which column is sorted. A column that cannot sort is 'none'
// (drawn plain, and aria-sort omitted by the caller).
export type SortState = 'asc' | 'desc' | 'none'

export function sortState(current: SortSpec | null, field: string | null): SortState {
  if (field == null || current?.field !== field) return 'none'
  return current.direction
}

export function ariaSort(state: SortState): 'ascending' | 'descending' | 'none' {
  return state === 'none' ? 'none' : state === 'asc' ? 'ascending' : 'descending'
}
