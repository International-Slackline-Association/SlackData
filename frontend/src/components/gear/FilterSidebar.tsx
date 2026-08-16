// Left filter sidebar. Renders one collapsible group per entry in the per-type
// filter config: pill groups (values derived from the loaded dataset) and range
// groups (min/max inputs). All state lives in the URL via useUrlState, so the
// listing page re-derives the visible list from it. The webbing stretch widget
// is appended separately (StretchFilter).
//
// Layout: a sticky flex column, capped to the viewport. The status bubble is
// pinned to the top; the header and every group live in one inner scroll region
// (data-cy="filter-scroll") that slides beneath it.

import { useMemo } from 'react'
import type { GearTypeMeta } from '@/config/gearTypes'
import { filterGroupsFor, type FilterGroupMeta } from '@/config/filterGroups'
import { derivePillOptions } from '@/utils/filter'
import { rangeDomain } from '@/utils/range'
import type { useUrlState } from '@/hooks/useUrlState'
import type { AnyItem } from '@/utils/format'
import FilterGroup from './FilterGroup'
import RangeSlider from './RangeSlider'
import StatusToggle, { type Status } from './StatusToggle'

type UrlState = ReturnType<typeof useUrlState>

// A boolean pill group is hidden when nothing in the data is `true` — e.g. no
// ISA-certified rollers means the whole "ISA Certified" toggle is dropped rather
// than showing a lone, useless "No". Enum groups are left as-is even when empty
// (isa_warning currently has no data but is still a valid, forthcoming field).
function pillGroupVisible(meta: FilterGroupMeta, items: AnyItem[]): boolean {
  if (meta.type !== 'pill' || meta.pillKind !== 'bool') return true
  const options = derivePillOptions(items, meta.group, meta.pillKind, meta.capitalize, meta.order)
  return options.some(o => o.value === 'true')
}

// Pill filter group. Groups with exactly two options are single-select (a radio
// with a clear): picking one replaces the other, re-picking the active one clears
// back to "all". Groups with 3+ options are multi-select (OR within the group)
// and get subtle All / None shortcuts.
function PillGroup({ meta, url, items }: { meta: FilterGroupMeta; url: UrlState; items: AnyItem[] }) {
  const options = derivePillOptions(items, meta.group, meta.pillKind, meta.capitalize, meta.order)
  const single = options.length === 2
  const selected = url.getPillValues(meta.group)

  // Both branches decide inside the hook, off the pending-params mirror — never
  // from `selected` here, which reflects the last committed URL and lags a fast
  // second click (see setPillExclusive in useUrlState).
  const onPick = (value: string) => {
    if (single) url.setPillExclusive(meta.group, value)
    else url.togglePill(meta.group, value)
  }

  return (
    <div data-cy="pill-group" data-select={single ? 'single' : 'multi'}>
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
        {options.map(opt => (
          <Pill
            key={opt.value}
            value={opt.value}
            active={selected.includes(opt.value)}
            label={opt.label}
            onClick={() => onPick(opt.value)}
          />
        ))}
      </div>
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
        'rounded-full border px-3 py-1 text-xs transition-colors ' +
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
  unit,
  url,
  items,
}: {
  group: string
  unit?: string
  url: UrlState
  items: AnyItem[]
}) {
  const domain = useMemo(() => {
    const vals = items
      .map(i => i[group])
      .filter(v => v != null && v !== '')
      .map(Number)
      .filter(v => Number.isFinite(v))
    return rangeDomain(vals)
  }, [items, group])

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
      onMinChange={v => url.setRangeBound(group, 'min', v <= domain.lo ? '' : String(v))}
      onMaxChange={v => url.setRangeBound(group, 'max', v >= domain.hi ? '' : String(v))}
    />
  )
}

export default function FilterSidebar({
  meta,
  items,
  url,
  status,
  onStatusChange,
  onClearAll,
  children,
}: {
  meta: GearTypeMeta
  items: AnyItem[]
  url: UrlState
  status: Status
  onStatusChange: (next: Status) => void
  onClearAll: () => void // clears filters + search + status (the page owns status)
  children?: React.ReactNode // webbing stretch widget slots in here
}) {
  const groups = filterGroupsFor(meta.slug)

  return (
    <aside
      data-cy="filter-sidebar"
      className="flex w-[280px] shrink-0 flex-col self-start sticky top-[calc(var(--header-h,96px)+1rem)] max-h-[calc(100vh-var(--header-h,96px)-6rem)]"
    >
      {/* Lifecycle scope comes first — it bounds everything below it, so it is
          pinned outside the scroll region and never scrolls away. */}
      <div className="shrink-0">
        <StatusToggle status={status} onChange={onStatusChange} />
      </div>

      {/* Everything below the bubble scrolls as one. `min-h-0` lets this shrink
          under the aside's max-height, which is what turns on the scrollbar. */}
      <div data-cy="filter-scroll" className="min-h-0 flex-1 overflow-y-auto pb-4">
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
          {groups
            .filter(g => pillGroupVisible(g, items))
            .map(g => (
              <FilterGroup key={g.group} group={g.group} label={g.label}>
                {g.type === 'pill' ? (
                  <PillGroup meta={g} url={url} items={items} />
                ) : (
                  <RangeControl group={g.group} unit={g.unit} url={url} items={items} />
                )}
              </FilterGroup>
            ))}
          {children}
        </div>
      </div>
    </aside>
  )
}
