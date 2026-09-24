// Table view — the listing's third mode, beside Cards and Detailed (DESIGN.md
// § Table View). Cards are for browsing and Detailed for reading one item at a
// time; this is for ranking 245 webbings on MBS and reading the numbers next to
// each other.
//
// Columns are the FULL spec set for the gear type, in SPEC_ROWS order — the
// same definitions the detail page and the compare table render, so a spec
// added there becomes a column here for free and the three can never disagree
// about a label, a unit or a formatter. `utils/table.ts` drops the ones no item
// populates. What the table adds on top is identity (image, brand, name), which
// SPEC_ROWS deliberately doesn't carry.
//
// data-cy contract (table.cy.ts):
//   gear-table-scroll  — the scroll region
//   gear-table         — the table
//   gear-table-header  — one <th>, data-field + data-sort="asc|desc|none"
//   gear-table-row     — one item row, data-id
//   gear-table-cell    — one spec cell, data-field + data-id
//   gear-table-name / gear-table-brand / table-compare — inside the frozen column
//
// The compare control is `table-compare`, NOT the card's `btn-compare`: the
// grid stays mounted-but-hidden behind this view, so a shared hook would double
// every selector gear_cards.cy.ts and compare.cy.ts read off the cards.

import { Link, useNavigate } from 'react-router-dom'
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { GearTypeMeta } from '@/config/gearTypes'
import { SPEC_ROWS, type PriceFormatter, type SpecRowDef } from '@/config/specRows'
import { sortFieldForSpec } from '@/config/sortFields'
import { useCurrency } from '@/context/CurrencyContext'
import { useOriginState } from '@/context/OriginContext'
import type { Origin } from '@/utils/origin'
import type { SortSpec } from '@/hooks/useUrlState'
import type { AnyItem } from '@/utils/format'
import { primaryImage } from '@/utils/images'
import {
  ariaSort,
  isStretchColumn,
  nextSort,
  sortState,
  tableColumns,
  STRETCH_GROUP_LABEL,
} from '@/utils/table'
import BrandLink from '@/components/brand/BrandLink'
import HistoricBadge from './HistoricBadge'

// A null sort is not "unsorted" — sortItems falls through to Name A→Z, so the
// Name header shows ascending on a fresh load and its first click flips to
// Z→A. Same reading of null as SortDropdown's labelFor.
const NAME_SORT: SortSpec = { field: 'name', direction: 'asc' }

// The two things the frozen identity column holds that can be ranked. They
// share one <th> because they share one cell — the maker and the product name
// are printed on top of each other down the column, so heading them as two
// columns would promise a split the body doesn't have.
const IDENTITY_SORTS = [
  { field: 'name', label: 'Name' },
  { field: 'brand_name', label: 'Manufacturer' },
] as const

function SortArrow({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (direction === null) {
    // Held in the layout at rest so a column doesn't shift sideways the moment
    // it becomes the sorted one.
    return <span aria-hidden="true" className="ml-1 text-gray-300">↕</span>
  }
  return (
    <span aria-hidden="true" className="ml-1 text-teal-primary">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  )
}

// `sticky left-0` + an opaque background: the identity column stays put while
// the spec columns scroll under it. Module scope because the header row and
// every body row need the same string.
const FROZEN_CELL = 'sticky left-0 bg-white'

// One row, memoized. This is what makes ticking a compare box cheap: the table
// hands each row a `selected` BOOLEAN rather than the selection array, so a tick
// re-renders the one row that changed instead of all 258 — which, at 47 columns
// apiece, is 12,000 cells and every `value()` behind them.
//
// Every prop here has to be identity-stable for that to hold. `columns` and
// `money` are memoized by the table, `originState` and `onOpen` likewise, and
// `onToggleCompare` is a useCallback in GearListingPage. Hand any of them a
// fresh identity per render and the memo silently does nothing.
const GearTableRow = memo(function GearTableRow({
  item,
  id,
  slug,
  columns,
  money,
  originState,
  firstStretch,
  selected,
  compareDisabled,
  showCompare,
  onToggleCompare,
  onOpen,
}: {
  item: AnyItem
  id: number
  slug: string
  columns: SpecRowDef[]
  money: PriceFormatter
  originState: { origin: Origin } | undefined
  firstStretch: number
  selected: boolean
  compareDisabled: boolean
  showCompare: boolean
  onToggleCompare?: (id: number) => void
  onOpen: (event: ReactMouseEvent<HTMLTableRowElement>, id: number) => void
}) {
  const image = primaryImage(slug, String(item.brand_name), String(item.name))

  // A cell's whole area as a link to the item. The card gets this from one
  // stretched <Link> overlay; a table row cannot host one — an absolutely
  // positioned child of a <tr> has no reliable containing block, and the frozen
  // identity cell is itself positioned — so every cell carries its own anchor
  // instead, with the padding moved off the <td> and onto the anchor so the
  // clickable area really is the whole cell.
  //
  // aria-hidden + tabIndex -1 on all of them, exactly as GearCard does for its
  // overlay: they are one destination repeated forty-odd times per row, and
  // announcing them would make a screen reader read every row as a wall of
  // identical links. The product name is the one that stays focusable.
  const cellLink = (className: string, children: ReactNode) => (
    <Link
      to={`/${slug}/${id}`}
      state={originState}
      aria-hidden="true"
      tabIndex={-1}
      className={className}
    >
      {children}
    </Link>
  )

  // A hairline where the stretch block starts, so forty bare numbers read as
  // one group and not as forty unexplained columns.
  const groupEdge = (field: string, index: number) =>
    index === firstStretch && isStretchColumn(field) ? 'border-l border-gray-200' : ''

  return (
          <tr
            data-cy="gear-table-row"
            data-id={String(id)}
            onClick={event => onOpen(event, id)}
            className="group cursor-pointer"
          >
            {/* Identity is ONE frozen cell rather than four sticky columns.
                Four would each need a left offset computed from the widths
                of the ones before it — a number that changes with the
                longest product name on the page. Stacking image, brand and
                name in a single pinned cell says the same thing and has one
                offset: zero. */}
            <th
              scope="row"
              className={`${FROZEN_CELL} z-10 border-b border-gray-100 px-3 py-2 text-left font-normal group-hover:bg-gray-50`}
            >
              <div className="flex items-center gap-3">
                {showCompare && (
                <input
                  data-cy="table-compare"
                  type="checkbox"
                  checked={selected}
                  disabled={compareDisabled}
                  onChange={() => onToggleCompare?.(id)}
                  aria-label={`Compare ${String(item.name)}`}
                  className="h-4 w-4 shrink-0 accent-teal-primary disabled:opacity-40"
                />
                )}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-50">
                  {image && (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="max-h-10 max-w-10 object-contain"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    data-cy="gear-table-brand"
                    className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500"
                  >
                    <BrandLink name={item.brand_name} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      data-cy="gear-table-name"
                      to={`/${slug}/${id}`}
                      state={originState}
                      className="font-semibold text-gray-900 hover:text-teal-primary"
                    >
                      {String(item.name)}
                    </Link>
                    <HistoricBadge active={item.active} />
                  </div>
                </div>
              </div>
            </th>
            {columns.map((col, index) => {
              const text = col.value(item, money)
              const secondary = col.secondary?.(item, money) ?? ''
              return (
                <td
                  key={col.field}
                  data-cy="gear-table-cell"
                  data-field={col.field}
                  data-id={String(id)}
                  // p-0 + h-px: the padding lives on the anchor inside, so
                  // the link covers the whole cell rather than the word in
                  // the middle of it. A table cell treats a declared height
                  // as a MINIMUM, so `h-px` doesn't shrink the row — it just
                  // gives the anchor's `h-full` something to resolve
                  // against. Without it the link is as tall as its own text
                  // and the rest of the row height (set by the identity
                  // cell's thumbnail) is dead space.
                  className={`h-px border-b border-gray-100 p-0 align-middle text-gray-900 group-hover:bg-gray-50 ${groupEdge(col.field, index)}`}
                >
                  {cellLink(
                    'flex h-full flex-col justify-center px-3 py-2',
                    text === '' ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <>
                        <span className="whitespace-nowrap">{text}</span>
                        {/* The as-sold price under a converted one, exactly
                            as the compare cell shows it. */}
                        {secondary && (
                          <div className="whitespace-nowrap text-xs text-gray-400">
                            {secondary}
                          </div>
                        )}
                      </>
                    ),
                  )}
                </td>
              )
            })}
          </tr>
  )
})

export default function GearTable({
  items,
  allItems,
  meta,
  sort,
  onSortChange,
  selectedIds = [],
  compareFull = false,
  onToggleCompare,
  showCompare = true,
}: {
  // The filtered, sorted rows to draw.
  items: AnyItem[]
  // Every item of this gear type. Which SPEC columns exist is a property of the
  // gear type, not of the current filters — deriving those from `items` would
  // make columns appear and vanish as you type in the search box. The per-kN
  // stretch block is the deliberate exception (see tableColumns).
  allItems: AnyItem[]
  meta: GearTypeMeta
  sort: SortSpec | null
  onSortChange: (spec: SortSpec) => void
  selectedIds?: number[]
  compareFull?: boolean
  onToggleCompare?: (id: number) => void
  // False on a manufacturer's page, where the sections are different gear types
  // and there is no one table to compare them in. See GearCard.
  showCompare?: boolean
}) {
  const navigate = useNavigate()
  const { priceText } = useCurrency()
  // Same as the cards: a row opened from a filtered table comes back to it.
  // Memoized on its contents, not taken as-is: useOriginState builds a fresh
  // object every render, and an unstable one here would invalidate every
  // memoized row on every render — which is the whole cost this file avoids.
  const rawOrigin = useOriginState()
  const originPath = rawOrigin?.origin.path
  const originLabel = rawOrigin?.origin.label
  const originState = useMemo(
    () => (originPath && originLabel ? { origin: { path: originPath, label: originLabel } } : undefined),
    [originPath, originLabel],
  )
  const money = useCallback<PriceFormatter>(
    item => priceText(item, meta.slug),
    [priceText, meta.slug],
  )

  // Spec columns from the whole gear type (stable while you filter); the kN
  // block from the rows on screen, so its ceiling follows the filter.
  const columns = useMemo(
    () => tableColumns(SPEC_ROWS[meta.slug] ?? [], allItems, money, items),
    [meta.slug, allItems, money, items],
  )

  // The sort a click has just asked for, held locally until the URL echo
  // catches up. `sort` arrives through useSearchParams, which lags a render
  // behind setSort — so a second click on the same header would read the
  // PRE-click sort, conclude the column wasn't active, and re-apply ascending
  // instead of flipping. (Exactly the stale-echo trap SortDropdown documents
  // for its stretch row; it cost this table its direction toggle until
  // table.cy.ts caught it.) Cleared when a new `sort` lands, so external
  // changes — the dropdown, a Back, a deep link — still win.
  const [pendingSort, setPendingSort] = useState<SortSpec | null>(null)
  useEffect(() => setPendingSort(null), [sort])

  const effective = pendingSort ?? sort ?? NAME_SORT

  const applySort = (field: string) => {
    const next = nextSort(effective, field)
    setPendingSort(next)
    onSortChange(next)
  }
  // Dead-space fallback for the whole-row link. The row is made clickable by
  // real anchors — one filling each cell, see `cellLink` below — because a click
  // handler alone is not a link: no context menu, no "open in a new tab", no
  // middle click, no URL in the status bar. The handler survives only to cover
  // the few pixels of gap inside the identity cell that no anchor can fill (a
  // link may not be nested inside another link, and that cell holds three).
  //
  // Four things must NOT be swallowed by it:
  //   · a click on something interactive (the compare checkbox, the brand link,
  //     the name link itself) — `closest` covers the whole subtree of each;
  //   · a modified click, which the browser turns into "open in a new tab" on
  //     the name link and which this handler could only turn into a same-tab
  //     navigation;
  //   · the end of a drag that selected text in a cell, which is a read, not a
  //     click;
  //   · anything a child has already handled (defaultPrevented).
  const openRow = useCallback((event: ReactMouseEvent<HTMLTableRowElement>, id: number) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if ((event.target as HTMLElement).closest('a, button, input, label')) return
    if (window.getSelection()?.toString()) return
    navigate(`/${meta.slug}/${id}`, { state: originState })
  }, [navigate, meta.slug, originState])

  const directionOf = (field: string | null) => {
    const state = sortState(effective, field)
    return state === 'none' ? null : state
  }

  const headerCell = (field: string | null, label: string) => {
    const direction = directionOf(field)
    const inner = (
      <>
        {label}
        {field != null && <SortArrow direction={direction} />}
      </>
    )
    return field == null ? (
      <span className="text-gray-500">{inner}</span>
    ) : (
      <button
        data-cy="gear-table-sort"
        data-field={field}
        data-sort={sortState(effective, field)}
        type="button"
        onClick={() => applySort(field)}
        // `uppercase` is repeated from the <th>, not inherited: browsers reset
        // text-transform on <button>, so without it the sortable headers read
        // "Width" beside a plain "MATERIAL".
        className={`inline-flex items-center whitespace-nowrap uppercase hover:text-gray-900 ${
          direction ? 'text-gray-900' : 'text-gray-500'
        }`}
      >
        {inner}
      </button>
    )
  }

  // The per-kN stretch block: contiguous by construction (the columns replace
  // one spec row in place), so it can be headed by a single spanning cell.
  const firstStretch = columns.findIndex(col => isStretchColumn(col.field))
  const stretchCount = columns.filter(col => isStretchColumn(col.field)).length
  const grouped = stretchCount > 0

  // Which identity sort is engaged, defaulting to Name (which is what a null
  // sort resolves to).
  const identitySort =
    IDENTITY_SORTS.find(entry => entry.field === effective.field) ?? IDENTITY_SORTS[0]

  // Header/body cell chrome. `border-separate` rather than `border-collapse`:
  // a collapsed table drops the borders of `position: sticky` cells, and every
  // cell that pins here (the header row, the frozen identity column) has one.
  //
  // With a group row above it the label row pins BELOW that row rather than at
  // the top of the region, so the two travel together. h-7/top-7 is the one
  // place those two numbers have to agree.
  const groupTh = 'sticky top-0 h-7 bg-white px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400'
  const th = `sticky ${grouped ? 'top-7' : 'top-0'} border-b border-gray-200 bg-white px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide`
  const frozen = FROZEN_CELL

  // The header's own copy of the hairline (the body's lives in GearTableRow).
  const groupEdge = (field: string, index: number) =>
    index === firstStretch && isStretchColumn(field) ? 'border-l border-gray-200' : ''

  return (
    // `isolate` is the same guard the card carries: the z-indices below order
    // the header against the frozen column, and without a stacking context of
    // their own they would compete with the nav (z-20) and CompareBar (z-30).
    //
    // The region scrolls in BOTH axes, which is what makes the pinned header
    // work at all: `overflow-x` alone would make this the sticky containing
    // block and the header would then pin to a box that scrolls away with the
    // page. Its height is the viewport less the nav and the compare bar, so
    // once the toolbar above has scrolled off, the table fills the space under
    // the nav exactly.
    <div
      data-cy="gear-table-scroll"
      className="isolate max-h-[calc(100vh-var(--header-h,96px)-var(--compare-bar-h,0px)-2rem)] overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <table data-cy="gear-table" className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {/* The group row exists only to say "Stretch @ kN" once. Without it
              every one of the forty columns would be as wide as its own
              heading instead of as wide as "0.19%". */}
          {grouped && (
            <tr data-cy="gear-table-group-row">
              <th className={`${groupTh} ${frozen} z-30`} />
              {columns.slice(0, firstStretch).map(col => (
                <th key={col.field} className={`${groupTh} z-20`} />
              ))}
              <th
                data-cy="gear-table-group"
                colSpan={stretchCount}
                scope="colgroup"
                className={`${groupTh} z-20 border-l border-gray-200`}
              >
                {STRETCH_GROUP_LABEL}
              </th>
            </tr>
          )}
          <tr>
            <th
              data-cy="gear-table-header"
              // The column is the identity column; `data-field` names whichever
              // of its two sorts is engaged, so "exactly one header is marked
              // sorted" stays true however you rank the table.
              data-field={identitySort.field}
              data-sort={sortState(effective, identitySort.field)}
              aria-sort={ariaSort(sortState(effective, identitySort.field))}
              scope="col"
              className={`${th} ${frozen} z-30 min-w-[15rem]`}
            >
              <span className="flex items-center gap-2">
                {IDENTITY_SORTS.map((entry, i) => (
                  <Fragment key={entry.field}>
                    {i > 0 && <span className="text-gray-300">·</span>}
                    {headerCell(entry.field, entry.label)}
                  </Fragment>
                ))}
              </span>
            </th>
            {columns.map((col, index) => {
              const field = sortFieldForSpec(meta.slug, col.field)
              const state = sortState(effective, field)
              return (
                <th
                  key={col.field}
                  data-cy="gear-table-header"
                  data-field={col.field}
                  data-sort={state}
                  // Announced only where the header actually sorts; on a plain
                  // label "none" would claim the column is sortable but unsorted.
                  aria-sort={field ? ariaSort(state) : undefined}
                  scope="col"
                  className={`${th} z-20 whitespace-nowrap ${groupEdge(col.field, index)}`}
                >
                  {/* The label alone — every cell prints its own unit
                      ("25 mm", "5.9%"), so repeating it up here said the same
                      thing 250 times down the column. */}
                  {headerCell(field, col.label)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const id = Number(item.id)
            const selected = selectedIds.includes(id)
            return (
              <GearTableRow
                key={String(id)}
                item={item}
                id={id}
                slug={meta.slug}
                columns={columns}
                money={money}
                originState={originState}
                firstStretch={firstStretch}
                selected={selected}
                compareDisabled={compareFull && !selected}
                showCompare={showCompare}
                onToggleCompare={onToggleCompare}
                onOpen={openRow}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
