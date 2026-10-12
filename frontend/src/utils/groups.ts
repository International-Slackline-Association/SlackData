// Generic parts several shops sell — the same 8 mm stainless D shackle from
// Slacktivity, SlackGear and Balance Community — are one row PER SHOP in the
// catalogue, each with that shop's own specs, price and link, sharing a
// `product_group` (slack_data/models/connectors.py). The listing shows such a
// group as ONE card; the detail page lists its rows as a vendor table.
//
// `collapseGroups` runs AFTER search and filters and BEFORE sort, which gives
// the range semantics the card promises for free:
//   - a group stays in the listing if ANY vendor matches the filters, because
//     the filters already ran on the vendor rows;
//   - the card's numbers are the MIN over the vendors still matching, so a
//     range filter's bounds always hold for what the card reports, and sort
//     ranks a group by its lowest stated value;
//   - `_ranges` keeps min..max per field for display ("20–29 kN").
// Only a group with two or more matching vendors collapses; a lone vendor
// shows as its own plain row, the same as a part only one shop sells.
//
// Dependency-free (only erased `import type`s) like utils/compare.ts, because
// `npm run test:unit` loads it under `node --experimental-strip-types` and the
// Cypress helpers import it too.

import { naturalCompare } from './compare.ts'

type Item = Record<string, unknown>

// Numeric fields a group reports as min (and min..max in `_ranges`).
export const GROUP_NUMERIC_FIELDS = [
  'mbs_straight_pull', 'mbs_crossload', 'mbs_gate_open',
  'opening', 'pin_diameter', 'rope_diameter', 'weight',
] as const

// Text (and flag) specs a group shows only when every shop agrees on them.
const GROUP_TEXT_FIELDS = ['connector_style', 'closure', 'material', 'alloy', 'standards', 'captive_pin'] as const

export interface GroupMeta {
  _members: Item[]
  _ranges: Record<string, [number, number]>
  // Spec fields the shops do NOT all state identically (a differing value, or
  // some shops silent). The detail page's spec sheet leaves these out — they
  // live in the vendor table, as each shop states them — while the listing
  // card still shows the numeric ones as a range.
  _varies: string[]
  // The member whose page is open (detail page only), highlighted in the table.
  _current?: number
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Current vendors first, then by brand A→Z, then name — the vendor table's order,
// and the member whose page the card opens.
export function compareMembers(a: Item, b: Item): number {
  const rank = (it: Item) => (it.active === false ? 1 : 0)
  return rank(a) - rank(b)
    || naturalCompare(String(a.brand_name ?? ''), String(b.brand_name ?? ''))
    || naturalCompare(String(a.name ?? ''), String(b.name ?? ''))
}

export function vendorNames(members: Item[]): string[] {
  return [...new Set(members.map(m => String(m.brand_name ?? '')))]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function groupItem(group: string, members: Item[]): Item & GroupMeta {
  const sorted = [...members].sort(compareMembers)
  const first = sorted[0]
  const ranges: Record<string, [number, number]> = {}
  const mins: Record<string, number | null> = {}
  for (const field of GROUP_NUMERIC_FIELDS) {
    const values = sorted.map(m => num(m[field])).filter((v): v is number => v != null)
    mins[field] = values.length ? Math.min(...values) : null
    if (values.length) ranges[field] = [Math.min(...values), Math.max(...values)]
  }
  // Price comes from ONE vendor — the cheapest by the normalized price_base —
  // so the as-sold amount, its currency and both derived figures stay a set.
  const priced = sorted.filter(m => num(m.price_base) != null)
  const cheapest = priced.length
    ? priced.reduce((lo, m) => (num(m.price_base)! < num(lo.price_base)! ? m : lo))
    : null
  const displays = priced.map(m => num(m.price_display)).filter((v): v is number => v != null)
  if (displays.length) ranges.price_display = [Math.min(...displays), Math.max(...displays)]

  const varies: string[] = []
  const agreed: Record<string, unknown> = {}
  for (const field of [...GROUP_NUMERIC_FIELDS, ...GROUP_TEXT_FIELDS]) {
    const all = sorted.every(m => same(m[field], first[field]))
    if (!all) varies.push(field)
    // Numbers keep the min (what sort and the range filters compare); text that
    // the shops disagree on is simply not the group's to state.
    if ((GROUP_TEXT_FIELDS as readonly string[]).includes(field)) agreed[field] = all ? first[field] : null
  }

  const anyActive = sorted.some(m => m.active === true)
  const allHistoric = sorted.every(m => m.active === false)
  return {
    ...first,
    ...mins,
    ...agreed,
    // A blurb or note belongs to one shop's listing, not to the part.
    description: null,
    notes: null,
    name: group,
    brand_name: vendorNames(sorted).join(', '),
    brands: [...new Set(sorted.flatMap(m => (m.brands as string[] | undefined) ?? [String(m.brand_name)]))],
    price: cheapest ? cheapest.price : null,
    currency: cheapest ? cheapest.currency : null,
    price_base: cheapest ? cheapest.price_base : null,
    price_display: cheapest ? cheapest.price_display : null,
    active: anyActive ? true : allHistoric ? false : null,
    // The card's outbound link would go to ONE shop of several; the vendor
    // table on the detail page carries every shop's link instead.
    product_url: null,
    product_group: group,
    _members: sorted,
    _ranges: ranges,
    _varies: varies,
  }
}

// The group a detail page shows for one of its members: the same object the
// listing's card is built from, but keyed to the member that was opened, so
// ISA lookups, compare and the table's highlight all mean that row.
export function groupFor(members: Item[], current: Item): (Item & GroupMeta) | null {
  const group = current.product_group
  if (typeof group !== 'string' || members.length < 2) return null
  return { ...groupItem(group, members), id: current.id, _current: Number(current.id) }
}

export function collapseGroups<T extends Item>(items: T[]): T[] {
  const buckets = new Map<string, T[]>()
  for (const it of items) {
    const g = it.product_group
    if (typeof g === 'string' && g !== '') {
      const b = buckets.get(g)
      if (b) b.push(it)
      else buckets.set(g, [it])
    }
  }
  const emitted = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const g = it.product_group
    const members = typeof g === 'string' ? buckets.get(g) : undefined
    if (!members || members.length < 2) {
      out.push(it)
    } else if (!emitted.has(g as string)) {
      emitted.add(g as string)
      out.push(groupItem(g as string, members) as unknown as T)
    }
  }
  return out
}

export function isGroupItem(item: Item): item is Item & GroupMeta {
  return Array.isArray(item._members)
}

// "20–29" (or "20" when every vendor states the same), with the unit appended.
// Falls back to the plain value on an ordinary row.
export function rangeText(item: Item, field: string, unit?: string): string {
  const r = (item._ranges as Record<string, [number, number]> | undefined)?.[field]
  const fmt = (n: number) => String(Math.round(n * 100) / 100)
  let text: string
  if (r) text = r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}–${fmt(r[1])}`
  else {
    const v = num(item[field])
    if (v == null) return ''
    text = fmt(v)
  }
  return unit ? `${text} ${unit}` : text
}
