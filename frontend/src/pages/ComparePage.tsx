// Compare view (stub — built out in Phase 7).

import { useParams } from 'react-router-dom'
import { getGearType } from '@/config/gearTypes'
import NotFoundPage from './NotFoundPage'

export default function ComparePage() {
  const { slug } = useParams()
  const meta = slug ? getGearType(slug) : undefined
  if (!meta) return <NotFoundPage />

  return (
    <div data-cy="compare-page">
      <h1 className="text-xl font-bold text-gray-900">Compare {meta.label}</h1>
      <p className="mt-2 text-gray-400 text-sm">Comparison coming soon.</p>
    </div>
  )
}
