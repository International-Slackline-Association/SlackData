// The leash rings a leash is sold with — the one place a gear type links to
// another (`ring_options` on models/leashes.py, LEASHES_REVIEW.md § Q2).
//
// Each option is a ring we hold and how many come with it: Slacktivity sells its
// leash with one or two HighlineRings, so that is two options of one ring. A
// sewn or spliced set has one permanent ring, and the heading says so rather
// than offering it as a choice. Each ring links to its own page, where its
// specs and certification are; nothing about the ring is repeated here.
//
// Rings a leash comes with that we do not hold are named in its notes, not
// here: an option with no page to open would be a claim we cannot back.

import { Link } from 'react-router-dom'
import { useGearList } from '@/hooks/useGearList'
import type { AnyItem } from '@/utils/format'

interface Option {
  leashring_id: number
  count: number
}

function optionsOf(item: AnyItem): Option[] {
  const raw = item.ring_options
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (o): o is Option => typeof o?.leashring_id === 'number' && typeof o?.count === 'number',
  )
}

export default function RingOptions({ item }: { item: AnyItem }) {
  const options = optionsOf(item)
  const { items: rings, loading } = useGearList('leashrings', options.length > 0)
  if (options.length === 0) return null

  const byId = new Map(rings.map(r => [Number(r.id), r as unknown as AnyItem]))
  const heading =
    item.ring_end === 'Sewn' ? 'Sewn to' : item.ring_end === 'Spliced' ? 'Spliced to' : 'Sold with'

  return (
    <section data-cy="ring-options" className="mt-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{heading}</h2>
      <ul>
        {options.map(option => {
          const ring = byId.get(option.leashring_id)
          const name = ring ? `${String(ring.brand_name)} ${String(ring.name)}` : loading ? '…' : `Leash ring #${option.leashring_id}`
          return (
            <li
              key={`${option.leashring_id}-${option.count}`}
              data-cy="ring-option"
              data-leashring-id={option.leashring_id}
              data-count={option.count}
              className="border-b border-gray-100 py-2 text-sm text-gray-900 last:border-b-0"
            >
              <span className="font-medium tabular-nums">{option.count}×</span>{' '}
              <Link to={`/leashrings/${option.leashring_id}`} className="font-medium text-teal-primary hover:underline">
                {name}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
