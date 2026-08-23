// Overlapping thumbs on a dual-thumb range slider — DESIGN.md § Left Filter
// Sidebar → Range slider → "Overlapping thumbs".
//
// The two <input type="range"> elements are stacked, so where the thumbs overlap
// only the top one (range-max) receives the pointer. Park both on the same value
// and the pair is stuck: max is clamped by min and min cannot be grabbed at all.
// At the top of the domain there is no way out but clearing the filter.
//
// The contract: while the thumbs overlap, the DIRECTION of the drag picks the
// bound — a leftward first movement moves min even though max took the grab —
// and that role is sticky until the gesture ends.
//
// The decision logic is unit-tested in tests/unit/rangeDrag.test.ts; this spec
// pins the DOM wiring (which input listens, when the role resets).

const SCOPE = '[data-cy="filter-group"][data-group="width"]'

// React ignores jQuery .val(); a real drag has to go through the native setter
// plus a bubbling input event, which is what the browser itself dispatches.
function driveThumb(which: 'min' | 'max', value: number) {
  cy.get(SCOPE).find(`[data-cy="range-${which}"]`).then($el => {
    const input = $el[0] as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// A gesture = pointerdown, one or more moves, pointerup. The role is decided on
// the first move and held until the pointerup.
//
// force: true because the input itself is `pointer-events: none` — only its
// ::-webkit-slider-thumb is interactive, and Cypress cannot target a pseudo
// element. The browser dispatches the real pointerdown on that thumb, which
// bubbles from this same input, so forcing reproduces it faithfully.
function grab(which: 'min' | 'max') {
  cy.get(SCOPE).find(`[data-cy="range-${which}"]`).trigger('pointerdown', { force: true })
}

function release(which: 'min' | 'max') {
  cy.get(SCOPE).find(`[data-cy="range-${which}"]`).trigger('pointerup', { force: true })
}

// Arrange a bound as its own complete gesture, so setup never leaks a sticky
// role into the gesture a test is actually exercising.
function setBound(which: 'min' | 'max', value: number) {
  grab(which)
  driveThumb(which, value)
  release(which)
  // Gate on the URL echo landing: the bounds live in the query string, so the
  // next gesture would otherwise be decided against pre-echo props.
  cy.get(SCOPE).find(`[data-cy="range-${which}"]`).should('have.value', String(value))
}

function bounds(): Cypress.Chainable<{ lo: number; hi: number; domLo: number; domHi: number }> {
  return cy.get(SCOPE).find('[data-cy="range-min"]').then($min => {
    return cy.get(SCOPE).find('[data-cy="range-max"]').then($max => ({
      lo: Number(($min[0] as HTMLInputElement).value),
      hi: Number(($max[0] as HTMLInputElement).value),
      domLo: Number($min.attr('min')),
      domHi: Number($max.attr('max')),
    }))
  })
}

describe('Dual-thumb slider — overlapping thumbs', () => {
  beforeEach(() => {
    cy.visit('/webbings')
    // Data-driven domain: wait until it has loaded (max > min).
    cy.get(SCOPE).find('[data-cy="range-max"]').should($el => {
      expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
    })
  })

  it('escapes the unrecoverable stack at the top of the domain', () => {
    bounds().then(({ domHi, domLo }) => {
      const target = domLo + Math.floor((domHi - domLo) / 2)
      // Park both thumbs on the domain max — max cannot move, min is buried.
      setBound('min', domHi)
      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(domHi))

      // Grab the stack (max is on top) and drag left.
      grab('max')
      driveThumb('max', target)

      // The min bound moved; the max bound stayed at the top.
      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(target))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(domHi))
    })
  })

  it('moves min when an overlapping stack mid-domain is dragged left', () => {
    bounds().then(({ domHi, domLo }) => {
      const mid = domLo + Math.floor((domHi - domLo) / 2)
      const left = domLo + Math.floor((mid - domLo) / 2)
      setBound('max', mid)
      setBound('min', mid)

      grab('max')
      driveThumb('max', left)

      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(left))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(mid))
    })
  })

  it('moves max when an overlapping stack mid-domain is dragged right', () => {
    bounds().then(({ domHi, domLo }) => {
      const mid = domLo + Math.floor((domHi - domLo) / 2)
      const right = mid + Math.max(1, Math.floor((domHi - mid) / 2))
      setBound('max', mid)
      setBound('min', mid)

      grab('max')
      driveThumb('max', right)

      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(right))
      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(mid))
    })
  })

  it('holds the redirected role for the rest of the gesture', () => {
    bounds().then(({ domHi, domLo }) => {
      const mid = domLo + Math.floor((domHi - domLo) / 2)
      const left = domLo + Math.floor((mid - domLo) / 2)
      const back = left + Math.max(1, Math.floor((mid - left) / 2)) // back right, still below mid
      setBound('max', mid)
      setBound('min', mid)

      grab('max')
      driveThumb('max', left)
      // Same gesture, pointer reverses — the min thumb must follow it rather
      // than the gesture jumping back to the max bound.
      driveThumb('max', back)

      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(back))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(mid))
    })
  })

  it('releases the role on pointerup so the next gesture moves max again', () => {
    bounds().then(({ domHi, domLo }) => {
      const mid = domLo + Math.floor((domHi - domLo) / 2)
      const left = domLo + Math.floor((mid - domLo) / 2)
      setBound('max', mid)
      setBound('min', mid)

      grab('max')
      driveThumb('max', left)
      release('max')
      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(left))

      // Thumbs are now apart. A fresh grab of the max input moves the max bound.
      const lower = left + Math.max(1, Math.floor((mid - left) / 2))
      grab('max')
      driveThumb('max', lower)

      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(lower))
      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(left))
    })
  })

  it('does not hold a role across changes that never began with a pointerdown', () => {
    // Programmatic writes (and the suite's own setSlider helper) dispatch an
    // input event with no gesture around it. Carrying a role between them would
    // make a second write land on the bound the first one moved.
    bounds().then(({ domHi, domLo }) => {
      const lower = domLo + Math.floor((domHi - domLo) / 4)
      const upper = domLo + Math.floor((3 * (domHi - domLo)) / 4)
      driveThumb('max', upper)
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(upper))
      driveThumb('min', lower)

      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(lower))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(upper))
    })
  })

  it('leaves separated thumbs alone — each input still moves its own bound', () => {
    bounds().then(({ domHi, domLo }) => {
      const quarter = domLo + Math.floor((domHi - domLo) / 4)
      const threeQuarter = domLo + Math.floor((3 * (domHi - domLo)) / 4)
      setBound('min', quarter)
      setBound('max', threeQuarter)

      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(quarter))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(threeQuarter))
    })
  })

  it('still clamps separated thumbs instead of swapping them', () => {
    bounds().then(({ domHi, domLo }) => {
      const quarter = domLo + Math.floor((domHi - domLo) / 4)
      const threeQuarter = domLo + Math.floor((3 * (domHi - domLo)) / 4)
      setBound('min', quarter)
      setBound('max', threeQuarter)

      // Drive the max thumb below the min thumb: it clamps at min, and the min
      // bound is untouched — a swap here would teleport the thumb mid-drag.
      grab('max')
      driveThumb('max', domLo)

      cy.get(SCOPE).find('[data-cy="range-min"]').should('have.value', String(quarter))
      cy.get(SCOPE).find('[data-cy="range-max"]').should('have.value', String(quarter))
    })
  })
})
