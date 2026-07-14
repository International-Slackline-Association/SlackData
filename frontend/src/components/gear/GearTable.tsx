// Chart (table) view — same items as the grid, tabular. Each row links to the
// item's detail page (gear_listing.cy.ts). `className` lets the page hide it
// when the Cards view is active.

import { Link } from 'react-router-dom'
import type { GearTypeMeta } from '@/config/gearTypes'
import { INLINE_SPECS } from '@/config/gearFields'
import { formatPrice, formatValue, type AnyItem } from '@/utils/format'

export default function GearTable({
  items,
  meta,
  className = '',
}: {
  items: AnyItem[]
  meta: GearTypeMeta
  className?: string
}) {
  const specs = INLINE_SPECS[meta.slug] ?? []

  return (
    <div data-cy="gear-table" className={`overflow-x-auto rounded-xl border border-gray-200 bg-white ${className}`}>
      <table className="w-full text-sm">
        <thead data-cy="gear-table-header" className="border-b border-gray-200 text-left text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Brand</th>
            {specs.map(s => (
              <th key={s.field} className="px-4 py-3 font-medium capitalize">
                {s.field.replace(/_/g, ' ')}
              </th>
            ))}
            <th className="px-4 py-3 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr data-cy="gear-table-row" key={String(item.id)} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2">
                <Link to={`/${meta.slug}/${item.id}`} className="font-medium text-teal-primary hover:underline">
                  {String(item.name)}
                </Link>
              </td>
              <td className="px-4 py-2 text-gray-600">{String(item.brand_name)}</td>
              {specs.map(s => (
                <td key={s.field} className="px-4 py-2 text-gray-600">
                  {formatValue(item[s.field], s.unit) || '—'}
                </td>
              ))}
              <td className="px-4 py-2 text-gray-600">
                {formatPrice(item.price, item.currency) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
