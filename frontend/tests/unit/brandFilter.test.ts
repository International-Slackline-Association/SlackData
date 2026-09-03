// The brand filter's filtering half: pill options derived from a group whose
// values live in a field other than its own name, and OR-matching over the
// per-item brand list `sellers.ts` builds.
//
// `brand` is the first pill group to need `valueField` (price was the first
// range group to). The URL key and data-group stay `brand` — singular, the way
// the sidebar reads — while the values compared are the derived `brands` array
// (maker + sellers). Pinned here because the difference is invisible on screen:
// both spellings render the same pills right up until an item is co-listed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, derivePillOptions } from '../../src/utils/filter.ts'
import type { FilterGroupMeta } from '../../src/config/filterGroups.ts'
import { BRAND_GROUP } from '../../src/config/brandGroup.ts'

const item = (id: number, brands: string[], extra: Record<string, unknown> = {}) => ({
  id,
  brand_name: brands[0],
  brands,
  ...extra,
})

const ITEMS = [
  item(1, ['Slack Inov', 'Spider Slacklines']), // co-listed
  item(2, ['Spider Slacklines']),
  item(3, ['Balance Community']),
]

test('the brand group reads the derived list, not the maker field', () => {
  assert.equal(BRAND_GROUP.group, 'brand', 'the URL key stays singular')
  assert.equal(BRAND_GROUP.valueField, 'brands')
  assert.equal(BRAND_GROUP.type, 'pill')
})

test('derives one pill per brand that makes or sells something, alphabetically', () => {
  assert.deepEqual(
    derivePillOptions(ITEMS, BRAND_GROUP).map(o => o.value),
    ['Balance Community', 'Slack Inov', 'Spider Slacklines'],
  )
})

test('a brand appearing on several items still gets one pill', () => {
  const options = derivePillOptions(ITEMS, BRAND_GROUP)
  assert.equal(options.filter(o => o.value === 'Spider Slacklines').length, 1)
})

test('the label is the brand name itself', () => {
  const spider = derivePillOptions(ITEMS, BRAND_GROUP).find(o => o.value === 'Spider Slacklines')
  assert.equal(spider?.label, 'Spider Slacklines')
})

test('a group without valueField still reads its own name', () => {
  const material: FilterGroupMeta = { group: 'material', label: 'Material', type: 'pill' }
  const items = [{ material: 'Nylon' }, { material: 'Polyester' }]
  assert.deepEqual(derivePillOptions(items, material).map(o => o.value), ['Nylon', 'Polyester'])
})

test('selecting a brand keeps what it makes AND what it sells', () => {
  const kept = applyFilters(ITEMS, { brands: ['Spider Slacklines'] }, {})
  assert.deepEqual(kept.map(i => i.id), [1, 2], 'the co-listed Slack Inov item comes too')
})

test('two brands OR within the group', () => {
  const kept = applyFilters(ITEMS, { brands: ['Slack Inov', 'Balance Community'] }, {})
  assert.deepEqual(kept.map(i => i.id), [1, 3])
})

test('brand ANDs with another group', () => {
  const items = [
    item(1, ['Slack Inov', 'Spider Slacklines'], { material: 'Nylon' }),
    item(2, ['Spider Slacklines'], { material: 'Polyester' }),
  ]
  const kept = applyFilters(items, { brands: ['Spider Slacklines'], material: ['Polyester'] }, {})
  assert.deepEqual(kept.map(i => i.id), [2])
})

test('no brand selected filters nothing', () => {
  assert.equal(applyFilters(ITEMS, { brands: [] }, {}).length, 3)
})

test('a brand nothing carries matches nothing', () => {
  assert.equal(applyFilters(ITEMS, { brands: ['Nonesuch'] }, {}).length, 0)
})

// ── The fold ─────────────────────────────────────────────────────────────────
//
// 45 webbing brands is a wall of pills in a 280px column, so a long group
// searches and folds. The rule that matters and cannot be seen in a screenshot:
// a SELECTED pill is never hidden — not by the fold, not by a search term that
// does not match it. A filter you cannot see is a filter you cannot undo.

import { foldPillOptions, PILL_FOLD_VISIBLE } from '../../src/utils/filter.ts'

const opts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `b${i}`, label: `Brand ${i}` }))

test('a short group is shown whole, with nothing hidden', () => {
  const { shown, hidden } = foldPillOptions(opts(6), { query: '', expanded: false, selected: [] })
  assert.equal(shown.length, 6)
  assert.equal(hidden, 0)
})

test('a long group folds to the first N and reports the rest', () => {
  const { shown, hidden } = foldPillOptions(opts(45), { query: '', expanded: false, selected: [] })
  assert.equal(shown.length, PILL_FOLD_VISIBLE)
  assert.equal(hidden, 45 - PILL_FOLD_VISIBLE)
  assert.equal(shown[0].value, 'b0', 'order is preserved — it is still alphabetical')
})

test('expanding shows every option', () => {
  const { shown, hidden } = foldPillOptions(opts(45), { query: '', expanded: true, selected: [] })
  assert.equal(shown.length, 45)
  assert.equal(hidden, 0)
})

test('a selected pill past the fold is shown anyway', () => {
  const { shown } = foldPillOptions(opts(45), { query: '', expanded: false, selected: ['b40'] })
  assert.ok(shown.some(o => o.value === 'b40'), 'the active filter stays visible')
  assert.equal(shown.length, PILL_FOLD_VISIBLE + 1)
})

test('the search box matches case-insensitively on the label', () => {
  const options = [
    { value: 'Spider Slacklines', label: 'Spider Slacklines' },
    { value: 'Slack Inov', label: 'Slack Inov' },
    { value: 'Balance Community', label: 'Balance Community' },
  ]
  assert.deepEqual(
    foldPillOptions(options, { query: 'slack', expanded: false, selected: [] }).shown.map(o => o.value),
    ['Spider Slacklines', 'Slack Inov'],
  )
})

test('a search term does not hide an already-selected pill', () => {
  const options = [
    { value: 'Spider Slacklines', label: 'Spider Slacklines' },
    { value: 'Balance Community', label: 'Balance Community' },
  ]
  const { shown } = foldPillOptions(options, {
    query: 'spider',
    expanded: false,
    selected: ['Balance Community'],
  })
  assert.deepEqual(shown.map(o => o.value), ['Spider Slacklines', 'Balance Community'])
})

test('a search that matches nothing shows nothing, and hides nothing behind a toggle', () => {
  const { shown, hidden } = foldPillOptions(opts(45), { query: 'zzz', expanded: false, selected: [] })
  assert.equal(shown.length, 0)
  assert.equal(hidden, 0, 'searching replaces the fold — no "show all" while filtering')
})

// ── The facet ────────────────────────────────────────────────────────────────
//
// The Brand group's options are derived from what the OTHER filters leave in
// play, so the list answers "which brands still have something here" instead of
// naming 45 brands most of which no longer match. Two rules that a screenshot
// cannot show:
//   · the brand group's OWN selection is excluded from that narrowing (the
//     listing page's brandFacetItems), or picking one brand would leave it as
//     the only pill and a second could never be added;
//   · a selected brand that the other filters narrow out of the list is kept,
//     active, so it can still be switched off.

import { withSelectedOptions } from '../../src/utils/filter.ts'

test('the facet lists only brands with something left behind them', () => {
  const nylonOnly = ITEMS.filter(i => i.material === 'Nylon')
  assert.deepEqual(derivePillOptions(nylonOnly, BRAND_GROUP).map(o => o.value), [])

  const withMaterials = [
    item(1, ['Slack Inov', 'Spider Slacklines'], { material: 'Nylon' }),
    item(2, ['Balance Community'], { material: 'Polyester' }),
  ]
  assert.deepEqual(
    derivePillOptions(withMaterials.filter(i => i.material === 'Nylon'), BRAND_GROUP)
      .map(o => o.value),
    ['Slack Inov', 'Spider Slacklines'],
    'a co-listing seller counts as "has something here" too',
  )
})

test('a selected value already in the list is not duplicated', () => {
  const options = [{ value: 'Spider Slacklines', label: 'Spider Slacklines' }]
  assert.deepEqual(withSelectedOptions(options, ['Spider Slacklines']), options)
})

test('a selected brand narrowed out of the facet is kept, so it can be undone', () => {
  const options = [{ value: 'Slack Inov', label: 'Slack Inov' }]
  assert.deepEqual(
    withSelectedOptions(options, ['Spider Slacklines']).map(o => o.value),
    ['Slack Inov', 'Spider Slacklines'],
    'appended last — it is a dead option, and the sorted list above it is not',
  )
})

test('nothing selected leaves the option list exactly as derived', () => {
  const options = derivePillOptions(ITEMS, BRAND_GROUP)
  assert.equal(withSelectedOptions(options, []), options)
})
