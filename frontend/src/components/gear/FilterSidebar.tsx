// Left filter sidebar. Renders one collapsible group per entry in the per-type
// filter config: pill groups (values derived from the loaded dataset) and range
// groups (min/max inputs). All state lives in the URL via useUrlState, so the
// listing page re-derives the visible list from it. The webbing stretch widget
// is appended separately (StretchFilter).
//
// Layout: a sticky flex column, capped to the viewport. The status bubble is
// pinned to the top; the header and every group live in one inner scroll region
// (data-cy="filter-scroll") that slides beneath it.

import { useMemo, useState } from 'react'
import type { GearTypeMeta } from '@/config/gearTypes'
import { BRAND_GROUP, filterGroupsFor, type FilterGroupMeta } from '@/config/filterGroups'
import { useCurrency } from '@/context/CurrencyContext'
import { moneyPrecision, symbolFor } from '@/utils/money'
import {
  derivePillOptions,
  foldPillOptions,
  NO_VALUE_PILL,
  PILL_FOLD_THRESHOLD,
  withSelectedOptions,
} from '@/utils/filter'
import { rangeDomain } from '@/utils/range'
import type { useUrlState } from '@/hooks/useUrlState'
import type { AnyItem } from '@/utils/format'
import FilterGroup from './FilterGroup'
import RangeSlider from './RangeSlider'
import StatusToggle, { type Status } from './StatusToggle'

type UrlState = ReturnType<typeof useUrlState>

// A boolean pill group is hidden when nothing in the data is `true` — e.g. no
// ISA-certified rollers means the whole "ISA Certified" toggle is dropped rather
// than showing a lone, useless "No".
//
// A `includeNone` group (isa_warning) is hidden when the only pill left would be
// "None" — a gear type nothing has been warned about doesn't need a filter whose
// single option selects everything.
function pillGroupVisible(meta: FilterGroupMeta, items: AnyItem[]): boolean {
  if (meta.type !== 'pill') return true
  if (meta.includeNone) {
    return derivePillOptions(items, meta).some(o => o.value !== NO_VALUE_PILL)
  }
  if (meta.pillKind !== 'bool') return true
  return derivePillOptions(items, meta).some(o => o.value === 'true')
}

// Pill filter group. Groups with exactly two options are single-select (a radio
// with a clear): picking one replaces the other, re-picking the active one clears
// back to "all". Groups with 3+ options are multi-select (OR within the group)
// and get subtle All / None shortcuts.
function PillGroup({ meta, url, items }: { meta: FilterGroupMeta; url: UrlState; items: AnyItem[] }) {
  const selected = url.getPillValues(meta.group)
  // `withSelectedOptions` is a no-op for every group whose options come from the
  // whole scope — a value cannot be selected there without existing. It earns
  // its keep on the faceted Brand group, where the other filters can narrow a
  // selected brand out of its own list; see the function's own note.
  const options = withSelectedOptions(derivePillOptions(items, meta), selected)
  const single = options.length === 2

  // A long group (Brand: 45 webbing brands) searches and folds. Both bits of
  // state are LOCAL and deliberately not in the URL — they are ways of looking
  // at the control, not part of the view being shared, and a shared link that
  // reopened someone else's half-typed brand search would be noise. Only groups
  // that declare `searchable` and actually have a long list get either.
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const foldable = (meta.searchable ?? false) && options.length > PILL_FOLD_THRESHOLD
  const { shown, hidden } = foldable
    ? foldPillOptions(options, { query, expanded, selected })
    : { shown: options, hidden: 0 }

  // Both branches decide inside the hook, off the pending-params mirror — never
  // from `selected` here, which reflects the last committed URL and lags a fast
  // second click (see setPillExclusive in useUrlState).
  const onPick = (value: string) => {
    if (single) url.setPillExclusive(meta.group, value)
    else url.togglePill(meta.group, value)
  }

  return (
    <div data-cy="pill-group" data-select={single ? 'single' : 'multi'}>
      {foldable && (
        <input
          data-cy="pill-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          className="mb-2 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-teal-primary focus:outline-none"
        />
      )}
      {options.length >= 3 && (
        <div className="mb-1.5 flex gap-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
          <button
            data-cy="pill-select-all"
            type="button"
            onClick={() => url.setPillValues(meta.group, options.map(o => o.value))}
            className="hover:text-teal-primary hover:underline"
          >
            All
          </button>
          <span aria-hidden>·</span>
          <button
            data-cy="pill-select-none"
            type="button"
            onClick={() => url.setPillValues(meta.group, [])}
            className="hover:text-teal-primary hover:underline"
          >
            None
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {shown.map(opt => (
          <Pill
            key={opt.value}
            value={opt.value}
            active={selected.includes(opt.value)}
            label={opt.label}
            onClick={() => onPick(opt.value)}
          />
        ))}
      </div>
      {/* The fold's own control. Shown while folded (there is more to see) and
          while expanded (there is a way back), but never while searching — a
          result set the viewer narrowed themselves is shown whole. */}
      {foldable && query.trim() === '' && (hidden > 0 || expanded) && (
        <button
          data-cy="pill-more"
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-[11px] font-medium text-teal-primary hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${options.length}`}
        </button>
      )}
      {foldable && shown.length === 0 && (
        <p data-cy="pill-no-match" className="text-xs text-gray-400">
          No {meta.label.toLowerCase()} matches “{query.trim()}”.
        </p>
      )}
    </div>
  )
}

function Pill({
  active,
  label,
  value,
  onClick,
}: {
  active: boolean
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      data-cy="filter-pill"
      type="button"
      data-value={value}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className={
        // min-h-9 (36px) rather than the 44px used for primary controls: pills
        // sit in dense wrapping groups where 44px would push the longer filter
        // lists past a phone screen, and they are large, well-spaced targets in
        // both axes already.
        'inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs transition-colors sm:min-h-0 sm:px-3 sm:py-1 ' +
        (active
          ? 'border-teal-primary bg-teal-50 text-teal-primary'
          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800')
      }
      style={active ? { background: '#E0F2F1' } : undefined}
    >
      {label}
    </button>
  )
}

// A URL-backed range slider for a numeric group. The slider domain is the
// data's [min, max]; the current thumbs come from the URL (or the domain bounds
// when unset). A thumb at a domain bound means "no constraint" (param deleted),
// so clear-all — which empties the URL — restores the full span automatically.
function RangeControl({
  group,
  field,
  unit,
  step,
  decimals,
  url,
  items,
  extraParams,
}: {
  group: string           // URL key + data-group
  field: string           // the item field read for the domain (== group, except price)
  unit?: string
  step?: number           // overrides the data-derived step — 0.01 for money
  decimals?: number       // fixed decimal places on the bound labels — 2 for money
  url: UrlState
  items: AnyItem[]
  // Written alongside the bound in the same URL mutation. Price uses it to keep
  // ?cur= beside the numbers, so a shared link's bounds stay readable.
  extraParams?: Record<string, string>
}) {
  const domain = useMemo(() => {
    const vals = items
      .map(i => i[field])
      .filter(v => v != null && v !== '')
      .map(Number)
      .filter(v => Number.isFinite(v))
    return rangeDomain(vals, step)
  }, [items, field, step])

  const rawMin = url.params.get(`${group}_min`)
  const rawMax = url.params.get(`${group}_max`)
  const lo = rawMin != null && rawMin !== '' ? Number(rawMin) : domain.lo
  const hi = rawMax != null && rawMax !== '' ? Number(rawMax) : domain.hi

  // A thumb at its domain bound means "no constraint" → delete that param. Each
  // write touches only its own key, preserving the other via the URL.
  return (
    <RangeSlider
      domainLo={domain.lo}
      domainHi={domain.hi}
      lo={lo}
      hi={hi}
      unit={unit}
      step={domain.step}
      decimals={decimals}
      onMinChange={v =>
        url.setRangeBound(group, 'min', v <= domain.lo ? '' : String(v), extraParams)
      }
      onMaxChange={v =>
        url.setRangeBound(group, 'max', v >= domain.hi ? '' : String(v), extraParams)
      }
    />
  )
}

export default function FilterSidebar({
  meta,
  items,
  brandItems,
  url,
  status,
  onStatusChange,
  onClearAll,
  variant = 'sidebar',
  children,
}: {
  meta: GearTypeMeta
  items: AnyItem[]
  // The items the Brand group derives its pills from: everything the OTHER
  // controls leave in play, so the brand list answers "who still has something
  // here" rather than listing 45 brands most of which no longer match. Every
  // other group derives from `items` (the whole status scope) on purpose — a
  // spec axis that reshuffled its own pills on every click would be unusable.
  // Falls back to `items` when the page does not supply it.
  brandItems?: AnyItem[]
  url: UrlState
  status: Status
  onStatusChange: (next: Status) => void
  onClearAll: () => void // clears filters + search + status (the page owns status)
  // 'sidebar' — the desktop column: fixed width, sticky, self-scrolling.
  // 'sheet'   — inside the mobile bottom sheet, which owns width and scrolling.
  // The component is rendered ONCE either way (the page picks by matchMedia, not
  // by `hidden lg:block`) so [data-cy="filter-sidebar"] stays single-instance.
  variant?: 'sidebar' | 'sheet'
  children?: React.ReactNode // webbing stretch widget slots in here
}) {
  const groups = filterGroupsFor(meta.slug)
  // Brand renders after everything else INCLUDING the webbing stretch widget,
  // which slots in as `children` between the config groups and the end of the
  // list. It is the longest group in the sidebar and the least specific, so it
  // sits at the bottom rather than pushing the spec filters people came for
  // under a wall of brand pills. Config order already puts it last; this is
  // what keeps it below the widget too.
  const ordered = groups.filter(g => g.group !== BRAND_GROUP.group)
  const brand = groups.find(g => g.group === BRAND_GROUP.group)
  const { display, rates } = useCurrency()
  // How finely the price slider moves, in the currency on screen — cents for the
  // dollar, whole yen for the yen. Recomputed when either changes.
  const money = moneyPrecision(display, rates)

  return (
    <aside
      data-cy="filter-sidebar"
      data-variant={variant}
      className={
        variant === 'sheet'
          ? // The Sheet supplies the height cap and the scrolling. Keeping the
            // aside's own sticky/max-h here would nest a second scroll region
            // inside the sheet's — two scrollbars fighting one swipe.
            'flex w-full flex-col'
          : 'flex w-[280px] shrink-0 flex-col self-start sticky top-[calc(var(--header-h,96px)+1rem)] max-h-[calc(100vh-var(--header-h,96px)-6rem)]'
      }
    >
      {/* Lifecycle scope comes first — it bounds everything below it, so it is
          pinned outside the scroll region and never scrolls away. */}
      {/* In the sheet the bubble sticks to the top of the sheet's scroll region
          instead, which keeps DESIGN.md's "the scope control never scrolls away"
          true in both layouts. */}
      <div
        className={
          variant === 'sheet' ? 'sticky top-0 z-10 -mt-1 bg-white pb-1 pt-1' : 'shrink-0'
        }
      >
        <StatusToggle status={status} onChange={onStatusChange} />
      </div>

      {/* Everything below the bubble scrolls as one. `min-h-0` lets this shrink
          under the aside's max-height, which is what turns on the scrollbar. */}
      <div
        data-cy="filter-scroll"
        className={
          variant === 'sheet' ? 'pb-2' : 'min-h-0 flex-1 overflow-y-auto pb-4'
        }
      >
        <div className="mb-3 flex items-center justify-between">
          <div
            data-cy="filter-sidebar-header"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Find your {meta.label.toUpperCase()}
          </div>
          <button
            data-cy="clear-filters"
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-medium text-teal-primary hover:underline"
          >
            Clear all
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white px-4">
          {ordered
            .filter(g => pillGroupVisible(g, items))
            .map(g => (
              <FilterGroup key={g.group} group={g.group} label={g.label}>
                {g.type === 'pill' ? (
                  <PillGroup meta={g} url={url} items={items} />
                ) : (
                  <RangeControl
                    group={g.group}
                    field={g.valueField ?? g.group}
                    // The price slider's unit is the viewer's currency, so it
                    // moves with the top-nav selector rather than being fixed —
                    // and so do its step and decimals. Every other field keeps
                    // its data-derived step.
                    unit={g.currencyUnit ? symbolFor(display) : g.unit}
                    step={g.currencyUnit ? money.step : undefined}
                    decimals={g.currencyUnit ? money.decimals : undefined}
                    url={url}
                    items={items}
                    extraParams={g.currencyUnit ? { cur: display } : undefined}
                  />
                )}
              </FilterGroup>
            ))}
          {children}
          {brand && (
            <FilterGroup key={brand.group} group={brand.group} label={brand.label}>
              <PillGroup meta={brand} url={url} items={brandItems ?? items} />
            </FilterGroup>
          )}
        </div>
      </div>
    </aside>
  )
}
