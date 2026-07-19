// The detail page's SPECIFICATIONS block: a two-column grid of label/value
// pairs driven by config/specRows.ts. Rows whose value resolves to '' are
// omitted entirely. The webbing stretch curve is the one full-width row — it
// spans both columns as a load/stretch table once it has enough points.

import { SPEC_ROWS, STRETCH_TABLE_MIN_POINTS, type SpecRowDef } from '@/config/specRows'
import type { GearSlug } from '@/types'
import type { AnyItem } from '@/utils/format'
import { displayPoints } from '@/utils/stretch'

function SpecValue({ row, text }: { row: SpecRowDef; text: string }) {
  if (row.render === 'chips') {
    const chips = text.split(',').map(c => c.trim()).filter(Boolean)
    return (
      <span className="inline-flex flex-wrap justify-end gap-1">
        {chips.map(chip => (
          <span
            key={chip}
            data-cy="color-chip"
            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
          >
            {chip}
          </span>
        ))}
      </span>
    )
  }

  return <>{text}</>
}

// The stretch curve: load across the top, stretch beneath — one column per
// MEASURED point (nothing interpolated, no fixed column set), so curves with 3
// points and curves with 20 both read honestly. Long curves scroll horizontally
// inside this block rather than widening the page; the row-label column is
// sticky so you never lose track of which row you're reading.
function StretchTable({ item }: { item: AnyItem }) {
  const pts = displayPoints(item.stretch)
  if (!pts.length) return null

  const cell = 'whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums'
  const stub = 'sticky left-0 z-10 bg-white px-2.5 py-1.5 text-left font-normal text-gray-500'

  return (
    <div className="mt-2 overflow-x-auto">
      <table data-cy="stretch-table" className="w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-gray-200">
            <th scope="row" className={stub}>
              Load
            </th>
            {pts.map(p => (
              <td key={p.kn} data-cy="stretch-kn" className={`${cell} text-gray-500`}>
                {p.kn} kN
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={stub}>
              Stretch
            </th>
            {pts.map(p => (
              <td
                key={p.kn}
                data-cy="stretch-percent"
                data-kn={p.kn}
                className={`${cell} font-medium text-gray-900`}
              >
                {p.percent}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function SpecTable({ item, slug }: { item: AnyItem; slug: GearSlug }) {
  const rows = (SPEC_ROWS[slug] ?? [])
    .map(row => ({ row, text: row.value(item) }))
    .filter(({ text }) => text !== '')
  const stretchPoints = displayPoints(item.stretch).length

  return (
    <section data-cy="spec-table" className="mt-8">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#00897B' }} />
        Specifications
      </h2>

      {/* Two balanced columns of label/value pairs rather than one full-width
          row per spec — at this card width a single column strands the value
          far from its label. Collapses to one column on narrow screens. */}
      <dl className="mt-3 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {rows.map(({ row, text }) =>
          // A curve of 3+ points earns the stacked table, which spans both
          // columns; 1–2 points fall through to the normal inline row. Same
          // data-cy/data-field contract either way.
          row.render === 'stretch' && stretchPoints >= STRETCH_TABLE_MIN_POINTS ? (
            <div
              key={row.field}
              data-cy="spec-row"
              data-field={row.field}
              className="border-b border-gray-200 py-2.5 sm:col-span-2"
            >
              <dt className="text-sm text-gray-500">{row.label}</dt>
              <dd>
                <StretchTable item={item} />
              </dd>
            </div>
          ) : (
            <div
              key={row.field}
              data-cy="spec-row"
              data-field={row.field}
              className="flex items-baseline justify-between gap-4 border-b border-gray-200 py-2.5"
            >
              <dt className="shrink-0 text-sm text-gray-500">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-gray-900">
                <SpecValue row={row} text={text} />
              </dd>
            </div>
          ),
        )}
      </dl>
    </section>
  )
}
