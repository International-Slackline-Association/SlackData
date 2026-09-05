// Unit tests for the chart geometry — `npm run test:unit`.
//
// These cover what a screenshot cannot show: whether an axis tick is a number a
// human reads, whether the last tick survives float accumulation, and whether a
// magnitude axis starts at zero. A stretch chart with a truncated baseline
// LOOKS fine and lies about the product, so the zero-based rule is pinned here.
// The DOM contract is covered by cypress/e2e/compare.cy.ts.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  boxesOverlap,
  extent,
  nearestX,
  niceScale,
  niceStep,
  placeLabels,
  polylinePoints,
  project,
  segmentHitsBox,
  segmentsOf,
  SERIES_COLORS,
  seriesColor,
  xUnion,
  type Series,
} from '../../src/utils/chart.ts'

describe('niceStep', () => {
  test('is always 1, 2 or 5 times a power of ten', () => {
    for (let span = 0.05; span < 5000; span *= 1.17) {
      const step = niceStep(span)
      const mantissa = step / 10 ** Math.floor(Math.log10(step))
      assert.ok(
        [1, 2, 5].some(m => Math.abs(mantissa - m) < 1e-9),
        `step ${step} for span ${span} is not a 1/2/5 step`,
      )
    }
  })

  test('divides the span into roughly the requested number of intervals', () => {
    for (const span of [7, 23, 140, 1900]) {
      const n = span / niceStep(span, 5)
      assert.ok(n >= 2 && n <= 12, `span ${span} produced ${n} intervals`)
    }
  })

  test('survives a degenerate span instead of returning NaN or 0', () => {
    for (const span of [0, -3, NaN, Infinity]) {
      assert.equal(niceStep(span), 1)
    }
  })
})

describe('niceScale', () => {
  test('rounds outward, so no point falls off the plot', () => {
    const s = niceScale(3, 17)
    assert.ok(s.lo <= 3 && s.hi >= 17)
  })

  test('bounds are exact multiples of the step, and the ticks span them', () => {
    const s = niceScale(0.4, 9.3)
    assert.equal(Math.abs(s.lo % s.step) < 1e-9, true)
    assert.equal(s.ticks[0], s.lo)
    assert.equal(s.ticks[s.ticks.length - 1], s.hi)
  })

  test('a zero-based axis always starts at zero', () => {
    // The stretch case: percentages clustered at 4–6% must still be drawn
    // against a 0 baseline, or a 1% difference looks like a doubling.
    const s = niceScale(4.1, 6.2, { zeroBased: true })
    assert.equal(s.lo, 0)
    assert.equal(s.ticks[0], 0)
  })

  test('a non-zero-based axis may start above zero', () => {
    const s = niceScale(100, 140)
    assert.ok(s.lo > 0)
  })

  test('ticks render without float dust', () => {
    for (const s of [niceScale(0, 1), niceScale(0, 0.7), niceScale(0, 3.5), niceScale(0, 23)]) {
      for (const t of s.ticks) {
        assert.match(String(t), /^-?\d+(\.\d{1,6})?$/, `tick ${t} is not clean`)
      }
    }
  })

  test('a flat or single-point series still gets a usable domain', () => {
    const flat = niceScale(5, 5, { zeroBased: true })
    assert.ok(flat.hi > flat.lo)
    assert.equal(flat.lo, 0)
    const zero = niceScale(0, 0, { zeroBased: true })
    assert.ok(zero.hi > zero.lo)
  })
})

describe('project', () => {
  const s = niceScale(0, 10, { zeroBased: true })

  test('maps the domain bounds onto the pixel bounds', () => {
    assert.equal(project(s.lo, s, 40, 240), 40)
    assert.equal(project(s.hi, s, 40, 240), 240)
  })

  test('is linear at the midpoint', () => {
    assert.equal(project((s.lo + s.hi) / 2, s, 0, 100), 50)
  })

  test('inverted pixel bounds give an upward y axis', () => {
    // y is passed bottom-pixel-first because SVG's origin is top-left.
    const top = project(s.hi, s, 300, 20)
    const bottom = project(s.lo, s, 300, 20)
    assert.ok(top < bottom)
  })
})

describe('polylinePoints', () => {
  test('emits "x,y" pairs, rounded, in order', () => {
    assert.equal(
      polylinePoints([{ px: 1.005, py: 2 }, { px: 30, py: 4.126 }]),
      '1,2 30,4.13',
    )
  })

  test('an empty series is an empty string, not "NaN,NaN"', () => {
    assert.equal(polylinePoints([]), '')
  })
})

describe('seriesColor', () => {
  test('assigns the fixed slots in order', () => {
    SERIES_COLORS.forEach((hex, i) => assert.equal(seriesColor(i), hex))
  })

  test('never cycles — past the last slot it is the neutral, not slot 1 again', () => {
    const n = SERIES_COLORS.length
    assert.notEqual(seriesColor(n), seriesColor(0))
    assert.equal(seriesColor(n), seriesColor(n + 5))
  })

  // Ten items can be compared; eight is where a validated categorical scale
  // ends, so the chart plots at most eight lines (see StretchChart).
  test('carries a slot for every line the chart will draw', () => {
    assert.ok(SERIES_COLORS.length >= 8)
  })

  test('the palette has no duplicate hues', () => {
    assert.equal(new Set(SERIES_COLORS).size, SERIES_COLORS.length)
  })
})

const series: Series[] = [
  { id: 'a', label: 'A', color: '#000', points: [{ x: 5, y: 3 }, { x: 10, y: 5 }] },
  { id: 'b', label: 'B', color: '#111', points: [{ x: 10, y: 4 }, { x: 20, y: 9 }] },
]

describe('xUnion', () => {
  test('is the sorted union across series, deduplicated', () => {
    assert.deepEqual(xUnion(series), [5, 10, 20])
  })

  test('is empty for no series', () => {
    assert.deepEqual(xUnion([]), [])
  })
})

describe('nearestX', () => {
  test('snaps to the closest measured value', () => {
    assert.equal(nearestX([5, 10, 20], 12), 10)
    assert.equal(nearestX([5, 10, 20], 16), 20)
  })

  test('returns null when there is nothing to snap to', () => {
    assert.equal(nearestX([], 3), null)
  })
})

describe('extent', () => {
  test('spans every point of every series', () => {
    assert.deepEqual(extent(series), { minX: 5, maxX: 20, minY: 3, maxY: 9 })
  })

  test('is null when nothing is plotted', () => {
    assert.equal(extent([]), null)
    assert.equal(extent([{ id: 'a', label: 'A', color: '#000', points: [] }]), null)
  })
})

// ─── Direct-label placement ──────────────────────────────────────────────────
// The rule these enforce: a label goes NEXT TO the point it names (a leader
// line back to a gutter reads as a flat curve — fatal for a webbing measured at
// one load), and it covers neither a plotted line nor another label.

describe('segmentHitsBox', () => {
  const box = { x: 10, y: 10, w: 20, h: 10 }

  test('detects a segment crossing the box', () => {
    assert.equal(segmentHitsBox({ x: 0, y: 15 }, { x: 40, y: 15 }, box), true)
  })

  test('detects a segment that merely clips a corner', () => {
    assert.equal(segmentHitsBox({ x: 0, y: 25 }, { x: 20, y: 5 }, box), true)
  })

  test('ignores a segment that passes by', () => {
    assert.equal(segmentHitsBox({ x: 0, y: 40 }, { x: 40, y: 40 }, box), false)
  })

  test('ignores a segment that stops short of the box', () => {
    assert.equal(segmentHitsBox({ x: 0, y: 15 }, { x: 5, y: 15 }, box), false)
  })

  test('detects a segment contained in the box', () => {
    assert.equal(segmentHitsBox({ x: 12, y: 12 }, { x: 18, y: 18 }, box), true)
  })
})

describe('boxesOverlap', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 }

  test('true when they intersect, false when they clear', () => {
    assert.equal(boxesOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true)
    assert.equal(boxesOverlap(a, { x: 20, y: 0, w: 10, h: 10 }), false)
  })

  test('the pad keeps a gap between them', () => {
    assert.equal(boxesOverlap(a, { x: 11, y: 0, w: 10, h: 10 }), false)
    assert.equal(boxesOverlap(a, { x: 11, y: 0, w: 10, h: 10 }, 3), true)
  })
})

describe('placeLabels', () => {
  const bounds = { x: 0, y: 0, w: 400, h: 200 }
  const size = { w: 60, h: 13 }

  test('puts a label immediately right of its point when nothing is in the way', () => {
    const [box] = placeLabels([{ x: 100, y: 100, ...size }], [], bounds)
    assert.equal(box.x, 108)
    assert.ok(Math.abs(box.y + box.h / 2 - 100) < 1e-9)
  })

  test('stays close to its point — never parked in a far gutter', () => {
    const [box] = placeLabels([{ x: 100, y: 100, ...size }], [], bounds)
    assert.ok(box.x - 100 < 40, `label drifted ${box.x - 100} from its point`)
  })

  test('moves off a line rather than sitting on it', () => {
    // A line running right through the default slot.
    const line: [{ x: number; y: number }, { x: number; y: number }][] =
      [[{ x: 0, y: 100 }, { x: 400, y: 100 }]]
    const [box] = placeLabels([{ x: 100, y: 100, ...size }], line, bounds)
    assert.equal(segmentHitsBox(line[0][0], line[0][1], box), false)
  })

  test('separates two labels whose points nearly coincide', () => {
    const boxes = placeLabels(
      [{ x: 100, y: 100, ...size }, { x: 102, y: 102, ...size }],
      [],
      bounds,
    )
    assert.equal(boxesOverlap(boxes[0], boxes[1]), false)
  })

  test('flips to the left of a point pinned at the right edge', () => {
    const [box] = placeLabels([{ x: 395, y: 100, ...size }], [], bounds)
    assert.ok(box.x + box.w <= bounds.x + bounds.w, 'label ran off the canvas')
    assert.ok(box.x < 395, 'label should have flipped to the left')
  })

  test('keeps every label on the canvas', () => {
    for (const anchor of [{ x: 2, y: 2 }, { x: 398, y: 198 }, { x: 200, y: 0 }]) {
      const [box] = placeLabels([{ ...anchor, ...size }], [], bounds)
      assert.ok(box.x >= bounds.x && box.x + box.w <= bounds.w, `x ${box.x} off canvas`)
      assert.ok(box.y >= bounds.y && box.y + box.h <= bounds.h, `y ${box.y} off canvas`)
    }
  })

  test('is deterministic — the same input places identically', () => {
    const anchors = [{ x: 100, y: 100, ...size }, { x: 104, y: 101, ...size }]
    assert.deepEqual(placeLabels(anchors, [], bounds), placeLabels(anchors, [], bounds))
  })
})

describe('segmentsOf', () => {
  const id = (v: number) => v

  test('a two-point series contributes one segment', () => {
    assert.equal(segmentsOf([series[0]], id, id).length, 1)
  })

  test('a single-point series contributes none — it has no line to avoid', () => {
    const lone: Series[] = [{ id: 'x', label: 'X', color: '#000', points: [{ x: 5, y: 3 }] }]
    assert.deepEqual(segmentsOf(lone, id, id), [])
  })
})
