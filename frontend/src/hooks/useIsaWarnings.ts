// Every ISA warning, indexed by the gear item it is against.
//
// Fetched once per page load and shared by every component that asks: the table
// is small (~90 rows for ~500 items) and completely static between deploys, so
// one request beats one per detail view — and the listing's Detailed view
// renders the same body component once per visible item, which would otherwise
// be a request per card.
//
// A failed fetch is not an error state here. The gear row's own `isa_warning`
// enum still renders the severity, so losing this data downgrades the banner
// from "here is what is wrong" to "there is a warning" rather than hiding it.

import { useEffect, useState } from 'react'
import { fetchIsaWarnings, warningKey } from '@/api/isaWarnings'
import type { IsaGearWarning } from '@/types'

export type IsaWarningIndex = Map<string, IsaGearWarning[]>

let cache: Promise<IsaWarningIndex> | null = null

function buildIndex(warnings: IsaGearWarning[]): IsaWarningIndex {
  const index: IsaWarningIndex = new Map()
  for (const w of warnings) {
    const key = warningKey(w.gear_type, w.gear_id)
    const list = index.get(key)
    if (list) list.push(w)
    else index.set(key, [w])
  }
  return index
}

function load(): Promise<IsaWarningIndex> {
  // Failure resolves to an empty index rather than rejecting, so the cache
  // holds a usable value and callers need no error branch.
  cache ??= fetchIsaWarnings().then(buildIndex).catch(() => new Map())
  return cache
}

/** The warnings against one gear item, newest first. Empty until loaded. */
export function useIsaWarnings(gearType: string, gearId: number | string | undefined) {
  const [index, setIndex] = useState<IsaWarningIndex | null>(null)

  useEffect(() => {
    let cancelled = false
    load().then(result => {
      if (!cancelled) setIndex(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (index === null || gearId == null) return []
  return index.get(warningKey(gearType, gearId)) ?? []
}
