// The rate cap's refusal (LIVE_EDITING_PHASE_6.md, D53, P6-F): a save beyond
// 20 in any hour or 100 in any 24 hours answers 429 with when the next one is
// possible. Turned into words here, in the reader's own time zone, so every
// dialog that saves says the same thing. The dialog stays open, so nothing
// typed is lost.

export interface CapDetail {
  limit: number
  /** "hour" or "24 hours" */
  window: string
  /** ISO 8601, UTC */
  retry_at: string
}

export function isCapDetail(detail: unknown): detail is CapDetail {
  if (!detail || typeof detail !== 'object') return false
  const d = detail as Record<string, unknown>
  return typeof d.retry_at === 'string' && typeof d.limit === 'number' && typeof d.window === 'string'
}

export function capMessage(detail: CapDetail, now: Date = new Date()): string {
  const at = new Date(detail.retry_at)
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const when = at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'long' })} ${time}`
  return (
    `You have saved ${detail.limit} changes in the last ${detail.window}, the most one account can. ` +
    `You can save again at ${when}. What you typed is still here.`
  )
}
