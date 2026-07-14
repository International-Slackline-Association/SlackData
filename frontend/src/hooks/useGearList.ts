// Fetches the full item list for a gear type (paginated to completion).
// `enabled` is false for upcoming/no-data types so we don't hit a missing route.

import { useEffect, useState } from 'react'
import { fetchGearList } from '@/api/gear'
import type { GearItem } from '@/types'

export function useGearList(slug: string, enabled = true) {
  const [items, setItems] = useState<GearItem[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchGearList(slug)
      .then(data => {
        if (!cancelled) setItems(data)
      })
      .catch(err => {
        if (!cancelled) setError(err as Error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, enabled])

  return { items, loading, error }
}
