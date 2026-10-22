// Every row of one product group, side by side (utils/groups.ts).
//
// Generic stock hardware (the same 8 mm stainless D shackle from Slacktivity,
// SlackGear and Balance Community) is one catalogue row PER SHOP, sharing a
// `product_group`. Each shop states its own numbers — one says 20 kN, another
// 29 kN for what looks like the same part — so the table shows each row as that
// shop states it, never merged, with a link to the shop's own page (a Wayback
// snapshot for a shop that has closed). Discontinued listings stay in, marked
// Historic: the table is the part's whole record.
//
// The same table serves a product whose specs depend on who made it or which
// batch it came from (Slack.fr's and Slack Inov's Reggae): one row per version,
// with the gear type's own columns. Stretch curves are never overlaid here:
// versions of one webbing are nearly always one curve, so the spec sheet shows
// one (utils/groups.ts, groupCurve).
//
// Rendered on the detail page of any member, and on a collapsed group in the
// listing's Detailed view (which already carries its members).
//
// Every row but the one you are on opens that member, across its whole width —
// the same rule, and the same mechanics, as the listing's Table view
// (GearTable.tsx): a <tr> cannot host one stretched link, so each plain cell
// carries its own hidden anchor, and a click handler covers the two cells that
// hold links of their own (the shop's brand page, the shop's product page).

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLink from '@/components/brand/BrandLink'
import type { GearTypeMeta } from '@/config/gearTypes'
import { useCurrency } from '@/context/CurrencyContext'
import { useGearList } from '@/hooks/useGearList'
import { compareMembers, isGroupItem, rangeText } from '@/utils/groups'
import type { AnyItem } from '@/utils/format'
import HistoricBadge from './HistoricBadge'

type Column = { field: string; label: string; unit?: string }

const MBS: Column = { field: 'breaking_strength', label: 'MBS', unit: 'kN' }
const WEIGHT: Column = { field: 'weight', label: 'Weight', unit: 'g' }
const KIT: Column[] = [
  { field: 'webbing_length', label: 'Length', unit: 'm' },
  { field: 'webbing_width', label: 'Width', unit: 'mm' },
  WEIGHT,
]

const COLUMNS: Record<string, Column[]> = {
  connectors: [
    { field: 'mbs_straight_pull', label: 'MBS', unit: 'kN' },
    { field: 'mbs_crossload', label: 'Crossload', unit: 'kN' },
    { field: 'opening', label: 'Opening', unit: 'mm' },
    { field: 'pin_diameter', label: 'Pin', unit: 'mm' },
    WEIGHT,
  ],
  webbings: [
    { field: 'width', label: 'Width', unit: 'mm' },
    { field: 'thickness', label: 'Thickness', unit: 'mm' },
    { field: 'weight', label: 'Weight', unit: 'g/m' },
    MBS,
  ],
  weblocks: [WEIGHT, MBS],
  leashrings: [
    { field: 'inner_diameter', label: 'Inner Ø', unit: 'mm' },
    { field: 'outer_diameter', label: 'Outer Ø', unit: 'mm' },
    WEIGHT,
    MBS,
  ],
  grips: [WEIGHT, { field: 'wll', label: 'WLL', unit: 'kN' }, { field: 'mbs', label: 'MBS', unit: 'kN' }],
  rollers: [WEIGHT, MBS],
  treepros: [{ field: 'width', label: 'Width', unit: 'cm' }, { field: 'length', label: 'Length', unit: 'cm' }, WEIGHT],
  starterkits: KIT,
  tricklinekits: KIT,
  leashes: [{ field: 'length', label: 'Length', unit: 'cm' }, WEIGHT, MBS],
}

export default function VendorTable({ item, meta }: { item: AnyItem; meta: GearTypeMeta }) {
  const group = typeof item.product_group === 'string' && item.product_group !== '' ? item.product_group : null
  const carried = isGroupItem(item)
  // Only fetch when the members aren't already on the item (the detail page).
  const { items: all } = useGearList(meta.slug, group != null && !carried)
  const { priceText } = useCurrency()
  const navigate = useNavigate()
  if (group == null) return null

  const members = (carried
    ? (item._members as AnyItem[])
    : (all as unknown as AnyItem[]).filter(it => it.product_group === group)
  ).slice().sort(compareMembers)
  if (members.length < 2) return null

  // Shops selling one generic part, one leash in its lengths, or versions of
  // one product by maker or batch.
  const shops = meta.slug === 'connectors'
  const lengths = meta.slug === 'leashes'
  // A column every vendor leaves blank is noise.
  const columns = (COLUMNS[meta.slug] ?? []).filter(c => members.some(m => m[c.field] != null))
  // A batch is told apart by its `version`, which a shop listing never needs.
  const showVersion = members.some(m => typeof m.version === 'string' && m.version !== '')
  // Captive pin: a shackle's flag, shown when any shop in the group has one —
  // the one difference a group's rows may hide behind a shared name.
  const showCaptive = members.some(m => m.captive_pin === true)
  // A PPE-certified listing and an uncertified one of the same part are one
  // group; what each shop states it is certified to is shown per row.
  const standardsOf = (m: AnyItem) => (Array.isArray(m.standards) ? (m.standards as string[]) : [])
  const showStandards = members.some(m => standardsOf(m).length > 0)
  // A leash's rows may differ by the rings they come with as well as by length
  // (BC sells each length with and without two rings): the ring counts each
  // row is sold with, e.g. "2", or "1 or 2" for a choice.
  const ringCountsOf = (m: AnyItem) =>
    Array.isArray(m.ring_options) ? (m.ring_options as { count: number }[]).map(o => o.count) : []
  const showRings = lengths && members.some(m => ringCountsOf(m).length > 0)
  const ringsText = (m: AnyItem) => {
    const counts = ringCountsOf(m)
    return counts.length ? counts.join(' or ') : 'None'
  }
  // ...or by how it is built (Slack Inov's leash as rope only or threaded).
  const showConstruction = lengths && new Set(members.map(m => m.construction)).size > 1
  // "N lengths" only while every row IS a length; rows that also differ by
  // rings are options.
  const allLengthsDiffer = new Set(members.map(m => m.length)).size === members.length
  const unit = lengths && !allLengthsDiffer ? 'options' : 'lengths'

  // The fallback for the cells no hidden anchor can fill, because a link may
  // not nest in a link. It stands aside for those links themselves and for a
  // modified click, which the anchors already handle as a real link would.
  const openRow = (event: ReactMouseEvent<HTMLTableRowElement>, id: unknown) => {
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if ((event.target as HTMLElement).closest('a, button, input, label')) return
    navigate(`/${meta.slug}/${id}`)
  }

  return (
    <section data-cy="vendor-table" data-group={group} className="mt-8">
      <h2 className="mb-1 text-lg font-bold text-gray-900">
        {shops ? `Sold by ${members.length} shops` : lengths ? `${members.length} ${unit}` : `${members.length} versions`}
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        {shops
          ? `${group} is generic hardware. Each shop's figures are as that shop states them.`
          : lengths
            ? `${group} comes in ${members.length} ${unit}. Each one's figures are as the maker states them.`
            : `${group} has been made by more than one maker or in more than one batch, and the figures differ. Each version is shown as its maker states it.`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">{shops ? 'Shop' : 'Brand'}</th>
              <th className="px-3 py-2">Listed as</th>
              {showVersion && <th className="px-3 py-2">Version</th>}
              {columns.map(c => (
                <th key={c.field} className="px-3 py-2 text-right">{c.label}</th>
              ))}
              {showStandards && <th className="px-3 py-2">Certification</th>}
              {showCaptive && <th className="px-3 py-2">Captive pin</th>}
              {showConstruction && <th className="px-3 py-2">Construction</th>}
              {showRings && <th className="px-3 py-2">Rings</th>}
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const current = carried ? Number(m.id) === Number(item._current) : Number(m.id) === Number(item.id)
              const price = priceText(m, meta.slug)
              const url = typeof m.product_url === 'string' && m.product_url !== '' ? m.product_url : null
              // A plain cell's whole area as a link to this member, padding
              // on the anchor so the cell, not just its text, is the target.
              // aria-hidden + tabIndex -1: one destination repeated per cell;
              // the "Listed as" name is the one a keyboard or screen reader
              // reaches. The row you are on is not a link at all.
              const cell = (className: string, children: ReactNode) => current ? (
                <div className={`px-3 py-2 ${className}`}>{children}</div>
              ) : (
                <Link
                  to={`/${meta.slug}/${m.id}`}
                  aria-hidden="true"
                  tabIndex={-1}
                  className={`flex h-full items-center px-3 py-2 ${className}`}
                >
                  {children}
                </Link>
              )
              return (
                <tr
                  key={String(m.id)}
                  data-cy="vendor-row"
                  data-id={String(m.id)}
                  data-brand={String(m.brand_name)}
                  data-current={current ? 'true' : 'false'}
                  onClick={current ? undefined : event => openRow(event, m.id)}
                  className={`group border-t border-gray-100 ${current ? 'bg-amber-50' : 'cursor-pointer hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <BrandLink name={m.brand_name} />
                    {m.active === false && <HistoricBadge active={false} className="ml-2 align-middle" />}
                    {/* A row can name other shops that resell it (Spider's, co-listed by Slack Inov). */}
                    {Array.isArray(m.gear_sellers) && m.gear_sellers.length > 0 && (
                      <div data-cy="vendor-sellers" className="text-xs font-normal text-gray-500">
                        sold by {(m.gear_sellers as string[]).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {current ? (
                      <span className="text-gray-900">{String(m.name)}</span>
                    ) : (
                      <Link
                        data-cy="vendor-name"
                        to={`/${meta.slug}/${m.id}`}
                        className="text-teal-primary hover:underline group-hover:underline"
                      >
                        {String(m.name)}
                      </Link>
                    )}
                  </td>
                  {/* h-px + p-0: a table cell treats a height as a minimum, so
                      the anchor's h-full resolves to the full row height. */}
                  {showVersion && (
                    <td data-field="version" className="h-px p-0">
                      {cell('', typeof m.version === 'string' && m.version !== '' ? m.version : '—')}
                    </td>
                  )}
                  {columns.map(c => (
                    <td key={c.field} data-field={c.field} className="h-px whitespace-nowrap p-0 text-right tabular-nums">
                      {cell('justify-end', rangeText(m, c.field, c.unit) || '—')}
                    </td>
                  ))}
                  {showStandards && (
                    <td data-field="standards" className="h-px p-0">
                      {cell('', standardsOf(m).length ? standardsOf(m).join(', ') : '—')}
                    </td>
                  )}
                  {showCaptive && (
                    <td data-field="captive_pin" className="h-px p-0">
                      {cell('', m.captive_pin === true ? 'Yes' : 'No')}
                    </td>
                  )}
                  {showConstruction && (
                    <td data-field="construction" className="h-px p-0">
                      {cell('', typeof m.construction === 'string' ? m.construction : '—')}
                    </td>
                  )}
                  {showRings && (
                    <td data-field="ring_options" className="h-px p-0">
                      {cell('', ringsText(m))}
                    </td>
                  )}
                  <td data-field="price" className="h-px whitespace-nowrap p-0 text-right">
                    {cell('justify-end', price ? price.text : '—')}
                  </td>
                  <td className="px-3 py-2">
                    {url ? (
                      <a data-cy="vendor-link" href={url} target="_blank" rel="noreferrer" className="text-teal-primary hover:underline">
                        {url.includes('web.archive.org') ? 'Archived page ↗' : 'Shop page ↗'}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
