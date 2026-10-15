// How the change log describes a change to an entry's media (phase 4): "added 2
// photos, reordered", not two JSON lists. Pure, for tests/unit/mediaChanges.test.ts.
//
// `photos` and an item's `manuals` are lists of {id, …}; a brand's `manuals`
// is {gear type: list}; `logo` is one key. Ids are the media ids, so a file
// kept in place is the same id before and after.

export const MEDIA_FIELDS = new Set(['photos', 'manuals', 'logo'])

type WithId = { id: string; title?: string; small?: string }

function list(value: unknown): WithId[] {
  if (Array.isArray(value)) return value as WithId[]
  if (value && typeof value === 'object') return Object.values(value as Record<string, WithId[]>).flat()
  return []
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The photos a change added, for thumbnails. */
export function addedPhotos(before: unknown, after: unknown): WithId[] {
  const held = new Set(list(before).map(p => p.id))
  return list(after).filter(p => !held.has(p.id))
}

/** One line for a media field's change, e.g. "added 2 photos, removed 1". */
export function describeMediaChange(field: string, before: unknown, after: unknown): string {
  if (field === 'logo') {
    if (!before) return 'added a logo'
    if (!after) return 'removed the logo'
    return 'replaced the logo'
  }
  const was = list(before)
  const now = list(after)
  const wasIds = new Set(was.map(m => m.id))
  const nowIds = new Set(now.map(m => m.id))
  const added = now.filter(m => !wasIds.has(m.id))
  const removed = was.filter(m => !nowIds.has(m.id))
  const parts: string[] = []
  const [one, many] = field === 'photos' ? ['photo', 'photos'] : ['document', 'documents']
  if (added.length) {
    parts.push(
      field === 'photos'
        ? `added ${count(added.length, one, many)}`
        : `added ${added.map(m => `“${m.title}”`).join(', ')}`,
    )
  }
  if (removed.length) {
    parts.push(
      field === 'photos'
        ? `removed ${count(removed.length, one, many)}`
        : `removed ${removed.map(m => `“${m.title}”`).join(', ')}`,
    )
  }
  const kept = now.filter(m => wasIds.has(m.id))
  const keptBefore = was.filter(m => nowIds.has(m.id))
  if (kept.map(m => m.id).join() !== keptBefore.map(m => m.id).join()) parts.push('reordered')
  const titles = new Map(was.map(m => [m.id, m.title]))
  const retitled = kept.filter(m => m.title !== undefined && titles.get(m.id) !== m.title)
  if (retitled.length) parts.push(`retitled ${retitled.map(m => `“${m.title}”`).join(', ')}`)
  return parts.join(', ') || 'unchanged'
}
