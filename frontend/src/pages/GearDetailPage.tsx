// Gear detail page — full spec sheet for one item.
//
// The card body itself lives in GearDetailBody, shared with the listing page's
// Detailed view so the two can't drift. This page owns the fetch, the loading /
// missing states and the back link; everything below that is the shared body.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchGearItem } from '@/api/gear'
import GearDetailBody from '@/components/gear/GearDetailBody'
import SafetyNotice from '@/components/layout/SafetyNotice'
import { getGearType } from '@/config/gearTypes'
import { type AnyItem } from '@/utils/format'
import NotFoundPage from './NotFoundPage'

export default function GearDetailPage() {
  const { slug, id } = useParams()
  const meta = slug ? getGearType(slug) : undefined

  const [item, setItem] = useState<AnyItem | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!meta || !id) return
    let cancelled = false
    setLoading(true)
    setMissing(false)
    fetchGearItem(meta.slug, id)
      .then(data => {
        if (!cancelled) setItem(data as unknown as AnyItem)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [meta, id])

  if (!meta) return <NotFoundPage />
  if (missing) return <NotFoundPage />
  if (loading || !item) {
    return <div data-cy="detail-skeleton" className="py-24 text-center text-gray-400">Loading…</div>
  }

  return (
    <div data-cy="gear-detail" className="mx-auto max-w-5xl">
      <Link
        data-cy="detail-back-link"
        to={`/${meta.slug}`}
        className="text-sm text-gray-500 hover:text-teal-primary"
      >
        ← {meta.label}
      </Link>

      <article className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <GearDetailBody item={item} meta={meta} />
      </article>

      {/* Sits below the spec sheet, on the page where someone is reading the
          individual numbers they might act on. Deliberately here rather than in
          GearDetailBody: that body is shared with the listing's Detailed view,
          which would repeat this callout once per visible item. */}
      <SafetyNotice variant="callout" className="mt-4" />
    </div>
  )
}
