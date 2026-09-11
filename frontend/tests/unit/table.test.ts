// The Table view's decisions, none of which are visible in a screenshot: which
// columns survive, what a header click means, and which headers can sort at all.
//
// SPEC_ROWS itself isn't imported here — config/specRows.ts pulls in runtime
// modules through the `@/` alias, which node's type-stripping runner can't
// resolve — so the column tests run against row fixtures of the same shape.
// What the table does WITH real spec rows is table.cy.ts's job.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ariaSort,
  nextSort,
  sortState,
  stretchColumns,
  tableColumns,
  STRETCH_GROUP_LABEL,
  STRETCH_KN_MAX,
  STRETCH_KN_MIN,
} from '../../src/utils/table.ts'
import { compareByBrand } from '../../src/utils/compare.ts'
import { percentAtRoundedKn } from '../../src/utils/stretch.ts'
import { sortFieldForSpec } from '../../src/config/sortFields.ts'

type Row = Parameters<typeof tableColumns>[0][number]

const row = (field: string): Row => ({
  field,
  label: field,
  value: (item: Record<string, unknown>) => (item[field] == null ? '' : String(item[field])),
})

// ── Columns ──────────────────────────────────────────────────────────────────

test('a column survives if any item populates it', () => {
  const cols = tableColumns([row('a'), row('b')], [{ a: 1, b: null }, { a: null, b: null }])
  assert.deepEqual(cols.map(c => c.field), ['a'])
})

test('a column no item populates is dropped — an empty stripe is pure scroll cost', () => {
  const cols = tableColumns([row('a'), row('colors')], [{ a: 1, colors: null }])
  assert.deepEqual(cols.map(c => c.field), ['a'])
})

test('declared order is preserved — it is the relevance order', () => {
  const cols = tableColumns([row('c'), row('a'), row('b')], [{ a: 1, b: 2, c: 3 }])
  assert.deepEqual(cols.map(c => c.field), ['c', 'a', 'b'])
})

test('an empty dataset keeps every column rather than collapsing the table', () => {
  const cols = tableColumns([row('a'), row('b')], [])
  assert.deepEqual(cols.map(c => c.field), ['a', 'b'])
})

test('a value of "0" counts as populated — only "" means absent', () => {
  const cols = tableColumns([row('a')], [{ a: 0 }])
  assert.deepEqual(cols.map(c => c.field), ['a'])
})

// ── The per-kN stretch columns ───────────────────────────────────────────────

const curve = (points: [number, number][]) =>
  JSON.stringify(points.map(([kn, percent]) => ({ kn, percent })))

test('there is one column per integer kN across the measured span', () => {
  const cols = stretchColumns()
  assert.equal(cols.length, STRETCH_KN_MAX - STRETCH_KN_MIN + 1)
  assert.equal(cols[0].field, 'stretch@1')
  assert.equal(cols.at(-1)!.field, `stretch@${STRETCH_KN_MAX}`)
})

test('a stretch column is headed by its load alone — the words are said once', () => {
  // Heading each of forty columns "Stretch @N kN" sized every one of them to
  // its heading rather than to its numbers; the group header carries the rest.
  const cols = stretchColumns()
  assert.equal(cols[0].label, '1')
  assert.equal(cols.at(-1)!.label, String(STRETCH_KN_MAX))
  assert.equal(STRETCH_GROUP_LABEL, 'Stretch @ kN')
})

test('a stretch column prints the percentage, not the load', () => {
  const [first] = stretchColumns()
  assert.equal(first.value({ stretch: curve([[1, 2.4]]) }), '2.4%')
  assert.equal(first.value({ stretch: curve([[10, 5]]) }), '')
})

test('the stretch row expands in place, keeping the relevance order', () => {
  const stretchRow = { field: 'stretch', label: 'Stretch', render: 'stretch' as const, value: () => '' }
  const cols = tableColumns([row('width'), stretchRow, row('colors')], [
    { width: 25, colors: 'red', stretch: curve([[1, 2]]) },
  ])
  assert.equal(cols[0].field, 'width')
  assert.equal(cols[1].field, 'stretch@1')
  assert.equal(cols.at(-1)!.field, 'colors')
})

test('a kN no curve reaches gets no column', () => {
  const stretchRow = { field: 'stretch', label: 'Stretch', render: 'stretch' as const, value: () => '' }
  const cols = tableColumns([stretchRow], [{ stretch: curve([[1, 2], [2, 4]]) }])
  assert.deepEqual(cols.map(c => c.field), ['stretch@1', 'stretch@2'])
})

// ── Which reading lands in which column ──────────────────────────────────────

test('an exact reading is used as measured', () => {
  assert.equal(percentAtRoundedKn(curve([[10, 5.9]]), 10), 5.9)
})

test('a non-integer reading falls into the nearest integer column', () => {
  // 14 of the 230 curves we hold were recorded off-integer; without this they
  // would appear in no column at all.
  assert.equal(percentAtRoundedKn(curve([[6.67, 4.2]]), 7), 4.2)
  assert.equal(percentAtRoundedKn(curve([[13.3, 9]]), 13), 9)
  assert.equal(percentAtRoundedKn(curve([[2.5, 1.1]]), 3), 1.1)
})

test('a rounded reading does not leak into the neighbouring column', () => {
  assert.equal(percentAtRoundedKn(curve([[6.67, 4.2]]), 6), null)
  assert.equal(percentAtRoundedKn(curve([[6.67, 4.2]]), 8), null)
})

test('an exact reading beats a rounded one in the same column', () => {
  assert.equal(percentAtRoundedKn(curve([[6.67, 4.2], [7, 4.5]]), 7), 4.5)
})

test('the nearest reading wins when two round into one column', () => {
  assert.equal(percentAtRoundedKn(curve([[6.6, 4.0], [7.4, 5.0]]), 7), 4.0)
})

test('0 kN never populates a column — every curve reads 0% there', () => {
  assert.equal(percentAtRoundedKn(curve([[0, 0], [10, 5]]), 1), null)
})

test('a missing or unparseable curve is simply absent', () => {
  assert.equal(percentAtRoundedKn(null, 10), null)
  assert.equal(percentAtRoundedKn('not json', 10), null)
})

// ── Sorting by manufacturer ──────────────────────────────────────────────────

test('manufacturers compare alphabetically, ignoring the product name', () => {
  const a = { brand_name: 'Balance Community', name: 'Zeta' }
  const b = { brand_name: 'Slack Inov', name: 'Alfa' }
  assert.ok(compareByBrand(a, b) < 0)
  assert.ok(compareByBrand(b, a) > 0)
})

test('two products by one maker tie, so the caller can break on name', () => {
  assert.equal(compareByBrand({ brand_name: 'Raed' }, { brand_name: 'Raed' }), 0)
})

test('a missing manufacturer sorts as an empty string, not a crash', () => {
  assert.ok(compareByBrand({}, { brand_name: 'Raed' }) < 0)
})

// ── Header clicks ────────────────────────────────────────────────────────────

test('clicking a new column sorts it ascending', () => {
  assert.deepEqual(nextSort({ field: 'name', direction: 'asc' }, 'weight'), {
    field: 'weight',
    direction: 'asc',
  })
})

test('clicking the active column flips its direction', () => {
  assert.deepEqual(nextSort({ field: 'weight', direction: 'asc' }, 'weight'), {
    field: 'weight',
    direction: 'desc',
  })
  assert.deepEqual(nextSort({ field: 'weight', direction: 'desc' }, 'weight'), {
    field: 'weight',
    direction: 'asc',
  })
})

test('a third click does not return to unsorted — the listing has no such state', () => {
  let spec = nextSort(null, 'weight')
  spec = nextSort(spec, 'weight')
  spec = nextSort(spec, 'weight')
  assert.deepEqual(spec, { field: 'weight', direction: 'asc' })
})

test('a null sort is Name A→Z, so the first Product click flips to Z→A', () => {
  assert.deepEqual(nextSort({ field: 'name', direction: 'asc' }, 'name'), {
    field: 'name',
    direction: 'desc',
  })
})

// ── Header state ─────────────────────────────────────────────────────────────

test('sortState marks only the active column', () => {
  const sort = { field: 'weight', direction: 'asc' } as const
  assert.equal(sortState(sort, 'weight'), 'asc')
  assert.equal(sortState(sort, 'price'), 'none')
  assert.equal(sortState(sort, null), 'none')
  assert.equal(sortState(null, 'weight'), 'none')
})

test('aria-sort mirrors the data-sort attribute', () => {
  assert.equal(ariaSort('asc'), 'ascending')
  assert.equal(ariaSort('desc'), 'descending')
  assert.equal(ariaSort('none'), 'none')
})

// ── Which spec columns can sort ──────────────────────────────────────────────

test('a spec field that is also a sort field sorts on itself', () => {
  assert.equal(sortFieldForSpec('webbings', 'breaking_strength'), 'breaking_strength')
  assert.equal(sortFieldForSpec('webbings', 'price'), 'price')
  assert.equal(sortFieldForSpec('grips', 'mbs'), 'mbs')
})

test('the width_range composite sorts on the bound the dropdown offers', () => {
  assert.equal(sortFieldForSpec('weblocks', 'width_range'), 'width_min')
  assert.equal(sortFieldForSpec('grips', 'width_range'), 'width_min')
})

test('enum and boolean columns are not sortable', () => {
  assert.equal(sortFieldForSpec('webbings', 'material'), null)
  assert.equal(sortFieldForSpec('webbings', 'stretch'), null)
  assert.equal(sortFieldForSpec('treepros', 'has_sling_attachment'), null)
})

test('a per-kN stretch column sorts on itself', () => {
  // sortItems resolves `stretch@N` against the curve, so the field needs no
  // entry in any per-type sort list.
  assert.equal(sortFieldForSpec('webbings', 'stretch@10'), 'stretch@10')
  assert.equal(sortFieldForSpec('webbings', 'stretch@40'), 'stretch@40')
})

test('sortability is per gear type — width sorts on webbings, not on weblocks', () => {
  assert.equal(sortFieldForSpec('webbings', 'width'), 'width')
  assert.equal(sortFieldForSpec('weblocks', 'width'), null)
})
