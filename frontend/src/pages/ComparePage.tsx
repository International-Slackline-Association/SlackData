// Side-by-side compare view. The selection is carried entirely in the URL
// (?ids=1,2,3) so this page is deep-linkable and independent of the listing
// page's in-memory state: it fetches the gear type and picks out the requested
// ids, preserving their URL order for the columns.
//
// Rows reuse SPEC_ROWS (Phase 6) so the compared fields, labels and formatting
// match the detail page exactly. Every configured row renders — a blank cell
// (·"—") reads more honestly across a comparison than a dropped row would.

import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import { useGearList } from '@/hooks/useGearList'
import { SPEC_ROWS } from '@/config/specRows'
import type { AnyItem } from '@/utils/format'
import NotFoundPage from './NotFoundPage'

export default function ComparePage() {
  const { slug } = useParams()
  const meta = slug ? getGearType(slug) : undefined
  const [params] = useSearchParams()
  const { items, loading } = useGearList(meta?.slug ?? '', !!meta?.available)

  const ids = useMemo(() => {
    const raw = params.get('ids')
    if (!raw) return []
    return raw
      .split(',')
      .map(s => Number(s))
      .filter(n => Number.isFinite(n))
  }, [params])

  // The requested items, in URL order, dropping any id that isn't in the dataset.
  const columns = useMemo(() => {
    const byId = new Map((items as unknown as AnyItem[]).map(it => [Number(it.id), it]))
    return ids.map(id => byId.get(id)).filter((it): it is AnyItem => it != null)
  }, [items, ids])

  if (!meta) return <NotFoundPage />

  const rows = SPEC_ROWS[meta.slug] ?? []

  return (
    <div data-cy="compare-page">
      <Link
        data-cy="compare-back-link"
        to={`/${meta.slug}`}
        className="inline-flex items-center gap-1 text-sm text-teal-primary hover:underline"
      >
        ← {meta.label}
      </Link>

      <h1 className="mb-6 mt-3 text-2xl font-bold text-gray-900">Compare {meta.label}</h1>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : columns.length === 0 ? (
        <p className="text-gray-500">Nothing to compare — pick items from the listing.</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-cy="compare-table" className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {/* Empty top-left corner above the field-label column. */}
                <th className="sticky left-0 z-10 bg-white" />
                {columns.map(item => (
                  <th
                    key={String(item.id)}
                    data-cy="compare-col"
                    data-id={String(item.id)}
                    className="min-w-[10rem] border-b border-gray-200 px-4 py-3 text-left align-bottom"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {String(item.brand_name)}
                    </div>
                    <Link
                      data-cy="compare-col-name"
                      to={`/${meta.slug}/${item.id}`}
                      className="font-bold text-gray-900 hover:text-teal-primary"
                    >
                      {String(item.name)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.field} data-cy="compare-row" data-field={row.field}>
                  <th
                    data-cy="compare-field-label"
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-b border-gray-100 bg-white px-4 py-2.5 text-left font-normal text-gray-500"
                  >
                    {row.label}
                    {row.unit ? ` (${row.unit})` : ''}
                  </th>
                  {columns.map(item => {
                    const text = row.value(item)
                    return (
                      <td
                        key={String(item.id)}
                        className="border-b border-gray-100 px-4 py-2.5 align-top text-gray-900"
                      >
                        {text === '' ? <span className="text-gray-300">—</span> : text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
