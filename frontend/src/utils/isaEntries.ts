// The admin page's view of ISA certificates and warnings (live editing phase
// 7, P7-B): what an entry is called, what it is matched to, and the order the
// queue is worked in — unmatched first, then as the ISA numbers them.

import type { IsaEntry, IsaKind, IsaMatchBlock } from '@/types'

/** The block's own target, then each `also` target — as the build reads them. */
export function matchTargets(match: IsaMatchBlock | undefined): IsaMatchBlock[] {
  if (!match) return []
  const { also, ...primary } = match
  return [primary, ...(also ?? [])].filter(t => t.gearType && t.gearIds.length > 0)
}

export function isMatched(entry: IsaEntry): boolean {
  return matchTargets(entry.entry.match).length > 0
}

/** The gear type as a match names it (`webbing`) → the site's slug (`webbings`). */
export function slugOf(gearType: string): string {
  return `${gearType}s`
}

/** Does this entry land on `slug` item `id`? */
export function landsOn(entry: IsaEntry, slug: string, id: number): boolean {
  return matchTargets(entry.entry.match).some(t => slugOf(t.gearType ?? '') === slug && t.gearIds.includes(id))
}

export function entryTitle(kind: IsaKind, entry: IsaEntry): string {
  const e = entry.entry
  const product = [e.manufacturer, e.model].filter(Boolean).join(' ')
  const tag = kind === 'certificates' ? e.certificate : e.status
  return tag ? `${product || entry.key} — ${String(tag)}` : product || entry.key
}

/** "approved_gear_12" and "12" sort by their number; our own keys come last. */
function keyOrder(key: string): number {
  const number = Number(key.split(/[_-]/).pop())
  return key.startsWith('slackdata-') ? 1e9 + number : Number.isFinite(number) ? number : 1e12
}

export function sortEntries(entries: IsaEntry[]): IsaEntry[] {
  return [...entries].sort(
    (a, b) => Number(isMatched(a)) - Number(isMatched(b)) || keyOrder(a.key) - keyOrder(b.key),
  )
}
