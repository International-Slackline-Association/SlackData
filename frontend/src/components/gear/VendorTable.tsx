// "Sold by" — every shop's listing of one generic part, side by side.
//
// Generic stock hardware (the same 8 mm stainless D shackle from Slacktivity,
// SlackGear and Balance Community) is one catalogue row PER SHOP, sharing a
// `product_group` (utils/groups.ts). Each shop states its own numbers — one says
// 20 kN, another 29 kN for what looks like the same part — so the table shows
// each row as that shop states it, never merged, with a link to the shop's own
// page (a Wayback snapshot for a shop that has closed). Discontinued listings
// stay in, marked Historic: the table is the part's whole record.
//
// Rendered on the detail page of any member, and on a collapsed group in the
// listing's Detailed view (which already carries its members).

import { Link } from 'react-router-dom'
import BrandLink from '@/components/brand/BrandLink'
import type { GearTypeMeta } from '@/config/gearTypes'
import { useCurrency } from '@/context/CurrencyContext'
import { useGearList } from '@/hooks/useGearList'
import { compareMembers, isGroupItem, rangeText } from '@/utils/groups'
import type { AnyItem } from '@/utils/format'
import HistoricBadge from './HistoricBadge'

const COLUMNS: { field: string; label: string; unit?: string }[] = [
  { field: 'mbs_straight_pull', label: 'MBS', unit: 'kN' },
  { field: 'mbs_crossload', label: 'Crossload', unit: 'kN' },
  { field: 'opening', label: 'Opening', unit: 'mm' },
  { field: 'pin_diameter', label: 'Pin', unit: 'mm' },
  { field: 'weight', label: 'Weight', unit: 'g' },
]

export default function VendorTable({ item, meta }: { item: AnyItem; meta: GearTypeMeta }) {
  const group = typeof item.product_group === 'string' && item.product_group !== '' ? item.product_group : null
  const carried = isGroupItem(item)
  // Only fetch when the members aren't already on the item (the detail page).
  const { items: all } = useGearList(meta.slug, group != null && !carried)
  const { priceText } = useCurrency()
  if (group == null) return null

  const members = (carried
    ? (item._members as AnyItem[])
    : (all as unknown as AnyItem[]).filter(it => it.product_group === group)
  ).slice().sort(compareMembers)
  if (members.length < 2) return null

  // A column every vendor leaves blank is noise.
  const columns = COLUMNS.filter(c => members.some(m => m[c.field] != null))
  // Captive pin: a shackle's flag, shown when any shop in the group has one —
  // the one difference a group's rows may hide behind a shared name.
  const showCaptive = members.some(m => m.captive_pin === true)
  // A PPE-certified listing and an uncertified one of the same part are one
  // group; what each shop states it is certified to is shown per row.
  const standardsOf = (m: AnyItem) => (Array.isArray(m.standards) ? (m.standards as string[]) : [])
  const showStandards = members.some(m => standardsOf(m).length > 0)

  return (
    <section data-cy="vendor-table" data-group={group} className="mt-8">
      <h2 className="mb-1 text-lg font-bold text-gray-900">Sold by {members.length} shops</h2>
      <p className="mb-3 text-sm text-gray-500">
        {group} is generic hardware. Each shop's figures are as that shop states them.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Shop</th>
              <th className="px-3 py-2">Listed as</th>
              {columns.map(c => (
                <th key={c.field} className="px-3 py-2 text-right">{c.label}</th>
              ))}
              {showStandards && <th className="px-3 py-2">Certification</th>}
              {showCaptive && <th className="px-3 py-2">Captive pin</th>}
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const current = carried ? Number(m.id) === Number(item._current) : Number(m.id) === Number(item.id)
              const price = priceText(m, meta.slug)
              const url = typeof m.product_url === 'string' && m.product_url !== '' ? m.product_url : null
              return (
                <tr
                  key={String(m.id)}
                  data-cy="vendor-row"
                  data-id={String(m.id)}
                  data-brand={String(m.brand_name)}
                  data-current={current ? 'true' : 'false'}
                  className={`border-t border-gray-100 ${current ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-3 py-2 font-medium">
                    <BrandLink name={m.brand_name} />
                    {m.active === false && <HistoricBadge active={false} className="ml-2 align-middle" />}
                    {/* A named maker's row (Peguet) is sold by the shops that resell it. */}
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
                      <Link to={`/${meta.slug}/${m.id}`} className="text-teal-primary hover:underline">
                        {String(m.name)}
                      </Link>
                    )}
                  </td>
                  {columns.map(c => (
                    <td key={c.field} data-field={c.field} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {rangeText(m, c.field, c.unit) || '—'}
                    </td>
                  ))}
                  {showStandards && (
                    <td data-field="standards" className="px-3 py-2">
                      {standardsOf(m).length ? standardsOf(m).join(', ') : '—'}
                    </td>
                  )}
                  {showCaptive && (
                    <td data-field="captive_pin" className="px-3 py-2">{m.captive_pin === true ? 'Yes' : 'No'}</td>
                  )}
                  <td data-field="price" className="whitespace-nowrap px-3 py-2 text-right">
                    {price ? price.text : '—'}
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
