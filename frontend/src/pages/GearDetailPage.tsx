// Gear detail page (stub — built out in Phase 6).

import { useParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import NotFoundPage from './NotFoundPage'

export default function GearDetailPage() {
  const { slug, id } = useParams()
  const meta = slug ? getGearType(slug) : undefined
  if (!meta) return <NotFoundPage />

  return (
    <div data-cy="gear-detail">
      <h1 className="text-xl font-bold text-gray-900">
        {meta.label} #{id}
      </h1>
      <p className="mt-2 text-gray-400 text-sm">Detail coming soon.</p>
    </div>
  )
}
