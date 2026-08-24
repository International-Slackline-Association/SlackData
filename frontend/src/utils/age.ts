// Relative timestamps for the admin queue.
//
// Pure arithmetic over a timestamp, so it lives here and is covered by the node
// unit suite rather than by Cypress — the repo's rule is that anything invisible
// in a screenshot belongs in tests/unit (see CLAUDE.md).

// [how many of this unit make the next one, this unit's name]. The last entry
// has no larger unit, which is what stops the loop.
const UNITS: [number, string][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.35, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
]

/**
 * "3 days ago" — coarse on purpose; the queue cares about order of magnitude.
 *
 * `now` is injectable so the test doesn't depend on the wall clock.
 */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  let value = Math.max(0, (now - then) / 1000)
  let index = 0
  // Step up a unit at a time. The label is the unit the value is now IN, which
  // is why it is read after the loop rather than assigned inside it — assigning
  // it alongside the division is an off-by-one that renders 120s as "2 seconds".
  while (index < UNITS.length - 1 && value >= UNITS[index][0]) {
    value /= UNITS[index][0]
    index += 1
  }

  const rounded = Math.floor(value)
  const label = UNITS[index][1]
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`
}
