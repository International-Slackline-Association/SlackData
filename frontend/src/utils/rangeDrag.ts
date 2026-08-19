// Which bound a dual-thumb slider gesture is actually moving — see RangeSlider.tsx
// for the control and DESIGN.md § Left Filter Sidebar → Range slider
// ("Overlapping thumbs") for the behaviour this encodes.
//
// The two <input type="range"> elements are stacked, so where the thumbs overlap
// only the top one (range-max) receives the pointer. Both parked on the same
// value, max is clamped by min and min cannot be grabbed at all — at the top of
// the domain that is stuck for good, short of clearing the filter. Two
// overlapping thumbs are indistinguishable, though, so the drag's direction can
// pick the bound for free: nothing jumps, because there is nothing to jump.

// Thumb diameter in px — keep in step with the h-3.5 / w-3.5 thumb styles in
// RangeSlider. Two thumbs closer together than this are one circle on screen no
// matter what the numbers say, so overlap is measured here rather than by
// comparing values.
export const THUMB_PX = 14

/**
 * Do the thumbs render as a single grabbable circle?
 *
 * Equal bounds always do. Otherwise it is a pixel question: one step apart on a
 * wide domain is two distinct numbers occupying the same 14px. An unmeasured
 * track (0px, before layout) can only answer for the equal case — guessing on a
 * width we do not have would redirect drags that are nowhere near each other.
 */
export function thumbsOverlap(
  lo: number,
  hi: number,
  domainLo: number,
  domainHi: number,
  trackPx: number,
): boolean {
  if (lo === hi) return true
  const span = domainHi - domainLo
  if (span <= 0) return true
  if (trackPx <= 0) return false
  return ((hi - lo) / span) * trackPx < THUMB_PX
}

/**
 * The bound a change from `source` should be applied to.
 *
 * `active` is the role already established for this gesture, and it wins
 * outright: once a leftward drag off a stack has been handed to the min bound,
 * the pointer coming back right must keep moving that same thumb rather than
 * switching identity mid-stroke.
 *
 * Separated thumbs are never redirected — each is individually grabbable, so a
 * crossing value is just a clamp. Swapping there WOULD teleport a thumb, which
 * is exactly why the redirect is confined to the overlapping case.
 */
export function resolveDragRole({
  source,
  value,
  lo,
  hi,
  overlapping,
  active,
}: {
  source: 'min' | 'max'
  value: number
  lo: number
  hi: number
  overlapping: boolean
  active: 'min' | 'max' | null
}): 'min' | 'max' {
  if (active) return active
  if (!overlapping) return source
  if (source === 'max' && value < lo) return 'min'
  if (source === 'min' && value > hi) return 'max'
  return source
}
