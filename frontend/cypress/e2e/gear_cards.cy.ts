import { GEAR_TYPES } from '../support/gear_types'
import { imageFilesFor } from '../support/images'

// Tests the visual anatomy of a gear card against the DESIGN.md spec.
// Runs for every gear type using real backend data to pick representative items.

GEAR_TYPES.forEach(({ slug, apiPath, label, hasISA }) => {
  describe(`Gear card anatomy — ${label}`, () => {
    let firstItem: Record<string, unknown>

    before(() => {
      // The listing defaults to alphabetical-by-name order, so the first card is
      // the name-first item across the whole dataset — not the API's first row.
      cy.fetchAllItems(apiPath).then((all) => {
        firstItem = [...(all as Record<string, unknown>[])].sort((a, b) =>
          String(a.name).localeCompare(String(b.name)),
        )[0]
      })
    })

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    // ── Required elements on every card ──────────────────────────────────────

    it('shows the brand name above the product name', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-brand"]')
        .should('be.visible')
        .and('contain.text', firstItem.brand_name as string)
    })

    it('shows the product name as a link', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]')
        .should('be.visible')
        .and('contain.text', firstItem.name as string)
        .and('have.attr', 'href')
    })

    it('shows an inline specs row', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-specs"]')
        .should('exist')
    })

    it('shows a Save button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-save"]').should('be.visible')
    })

    it('shows an Alert button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-alert"]').should('be.visible')
    })

    it('shows a Compare button', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="btn-compare"]').should('be.visible')
    })

    // ── Price: shown only when non-null ───────────────────────────────────────
    // Presence/absence only. What the price SAYS — the display currency, the ≈
    // prefix, the /m suffix, data-price-base — belongs to currency.cy.ts. These
    // two hold whatever currency is selected, which is why they assert no text.

    it('shows the price in amber when the item has a price', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        const withPrice = (all as Record<string, unknown>[]).find(i => i.price != null)
        if (!withPrice) return

        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', withPrice.name as string)
          .closest('[data-cy="gear-card"]')
          .find('[data-cy="gear-card-price"]')
          .should('be.visible')
      })
    })

    it('omits the price element entirely when price is null', () => {
      cy.fetchAllItems(apiPath).then((all) => {
        const noPrice = (all as Record<string, unknown>[]).find(i => i.price == null)
        if (!noPrice) return

        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', noPrice.name as string)
          .closest('[data-cy="gear-card"]')
          .find('[data-cy="gear-card-price"]')
          .should('not.exist')
      })
    })

    // ── ISA Approved badge: shown only when isa_certified is true ────────────

    if (hasISA) {
      it('shows the ISA Approved badge on certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('be.visible')
        })
      })

      it('does not show an ISA badge on non-certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', notCertified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('not.exist')
        })
      })
    }

    if (!hasISA) {
      it('never shows an ISA badge (this type has no isa_certified field)', () => {
        cy.get('[data-cy="gear-card"]').first()
          .find('[data-cy="isa-approved-badge"]')
          .should('not.exist')
      })
    }

    // ── Navigation from card ──────────────────────────────────────────────────

    it('navigates to the detail page when the product name is clicked', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]').click()
      cy.url().should('match', new RegExp(`/${slug}/\\d+`))
    })

    it('all cards link to detail URLs with the correct gear-type segment', () => {
      cy.get('[data-cy="gear-card"]').each(($card) => {
        cy.wrap($card).find('[data-cy="gear-card-name"]')
          .should('have.attr', 'href')
          .and('include', `/${slug}/`)
      })
    })

    // ── Card accessibility & interaction ─────────────────────────────────────
    // CSS :hover pseudo-state is not reliably triggerable in Cypress (pointer
    // events don't activate CSS :hover). Shadow-on-hover is tested by visual
    // regression tools, not E2E. Instead, assert the card is keyboard-reachable
    // and that the primary action (clicking the name link) works.

    it('the product name link is keyboard-focusable', () => {
      cy.get('[data-cy="gear-card"]').first()
        .find('[data-cy="gear-card-name"]')
        .focus()
        .should('be.focused')
    })

    it('the Save, Alert, and Compare buttons are keyboard-focusable', () => {
      cy.get('[data-cy="gear-card"]').first().within(() => {
        cy.get('[data-cy="btn-save"]').focus().should('be.focused')
        cy.get('[data-cy="btn-alert"]').focus().should('be.focused')
        cy.get('[data-cy="btn-compare"]').focus().should('be.focused')
      })
    })
  })
})

// ── Weight in the inline specs row ────────────────────────────────────────────
// Webbing only. Weight (g/m) is a primary quick-compare spec for webbing, so it
// sits in the card's inline row between width and breaking strength. Other types
// keep weight on the detail spec sheet only. Unit is `g/m` to match specRows.ts
// and the range filter — the webbing model stores grams per meter.

describe('Card inline weight — Webbings', () => {
  let withWeight: Record<string, unknown> | undefined
  let withoutWeight: Record<string, unknown> | undefined

  const cardFor = (id: unknown) =>
    cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/webbings/${id}"])`)

  before(() => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      withWeight = items.find(i => i.weight != null)
      withoutWeight = items.find(i => i.weight == null)
    })
  })

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('shows the weight with a g/m unit when the webbing has one', () => {
    if (!withWeight) return
    cardFor(withWeight.id)
      .find('[data-cy="gear-card-specs"]')
      .should('contain.text', `${withWeight.weight} g/m`)
  })

  it('omits the weight segment — with no empty separator — when weight is null', () => {
    if (!withoutWeight) return
    cardFor(withoutWeight.id)
      .find('[data-cy="gear-card-specs"]')
      .should('not.contain.text', 'g/m')
      .invoke('text')
      .should('not.match', /·\s*·/)
  })

  it('orders weight after width and before breaking strength', () => {
    // Needs an item carrying all three so the relative order is observable.
    cy.fetchAllItems('webbing').then((all) => {
      const full = (all as Record<string, unknown>[]).find(
        i => i.weight != null && i.width != null && i.breaking_strength != null,
      )
      if (!full) return
      cardFor(full.id)
        .find('[data-cy="gear-card-specs"]')
        .invoke('text')
        .then((text) => {
          expect(text.indexOf(`${full.width} mm`)).to.be.lessThan(text.indexOf(`${full.weight} g/m`))
          expect(text.indexOf(`${full.weight} g/m`))
            .to.be.lessThan(text.indexOf(`${full.breaking_strength} kN`))
        })
    })
  })
})

// Weight stays off the inline row for every other type — it is not a primary
// quick-compare spec there, and those cards have more relevant specs to show.
GEAR_TYPES.filter(g => g.slug !== 'webbings').forEach(({ slug, label }) => {
  describe(`Card inline weight — ${label} (not shown)`, () => {
    it('does not put a g/m weight in the inline specs row', () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="gear-card"]').should('exist')
      cy.get('[data-cy="gear-card-specs"]').each(($row) => {
        expect($row.text()).to.not.contain('g/m')
      })
    })
  })
})

// ── Width range in the inline specs row ───────────────────────────────────────
// Weblocks accept a BAND of webbing widths, so the card's width segment must be
// the whole band ("24–26 mm"), not `width_min` alone — a lock printed as "24 mm"
// reads as "24 mm only", which is exactly the wrong conclusion for a buyer with
// 25 mm webbing. Collapses to a single figure when the bounds coincide (or there
// is no max) so a genuinely single-width lock is not dressed up as a range.
// The formatting rule itself is unit-tested in tests/unit/format.test.ts.

describe('Card inline width range — Weblocks', () => {
  let ranged: Record<string, unknown> | undefined
  let single: Record<string, unknown> | undefined

  const cardFor = (id: unknown) =>
    cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/weblocks/${id}"])`)

  before(() => {
    cy.fetchAllItems('weblock').then((all) => {
      const items = all as Record<string, unknown>[]
      ranged = items.find(i => i.width_max != null && i.width_max !== i.width_min)
      single = items.find(i => i.width_max == null || i.width_max === i.width_min)
    })
  })

  beforeEach(() => {
    cy.visit('/weblocks')
  })

  it('shows both bounds when the lock takes a range of widths', () => {
    if (!ranged) return
    cardFor(ranged.id)
      .find('[data-cy="gear-card-specs"]')
      .should('contain.text', `${ranged.width_min}–${ranged.width_max} mm`)
  })

  it('does not show the minimum on its own', () => {
    if (!ranged) return
    cardFor(ranged.id)
      .find('[data-cy="gear-card-specs"]')
      .invoke('text')
      // "24 mm" must not appear unattached to its upper bound.
      .should('not.match', new RegExp(`(^|[^–\\d])${ranged.width_min} mm`))
  })

  it('collapses to one figure when min and max coincide', () => {
    if (!single) return
    cardFor(single.id)
      .find('[data-cy="gear-card-specs"]')
      .should('contain.text', `${single.width_min} mm`)
      .and('not.contain.text', `${single.width_min}–`)
  })

  it('keeps the width between the material and the breaking strength', () => {
    cy.fetchAllItems('weblock').then((all) => {
      const full = (all as Record<string, unknown>[]).find(
        i => i.material != null && i.width_max != null && i.breaking_strength != null,
      )
      if (!full) return
      cardFor(full.id)
        .find('[data-cy="gear-card-specs"]')
        .invoke('text')
        .then((text) => {
          const width = text.indexOf(`${full.width_min}`)
          expect(text.indexOf(String(full.material))).to.be.lessThan(width)
          expect(width).to.be.lessThan(text.indexOf(`${full.breaking_strength} kN`))
        })
    })
  })
})

// ── Classification bubble on the card ─────────────────────────────────────────
// Webbing only, and only in two cases (see src/.../ClassificationBubble.tsx):
//   · the webbing is ISA certified → its granted class (A+/A/B/C). A letter
//     class is an ISA grant, so an uncertified webbing must not show one even
//     though the backend computes a class for every webbing — the bubble would
//     read as certification.
//   · breaking_strength < 22 kN → the gray "Not for Highline" pill, certified or
//     not. Below the Type C floor no fiber is highline-rated, so that's a fact
//     about the webbing, not a withheld grant.
// Everything else shows nothing — including an uncertified "Not for Highline" at
// 22 kN+ (e.g. 25 kN polyester, which misses Type C only because ISA doesn't
// certify PES that low), and any webbing whose strength is unknown.
// On items that do qualify, the same bubble the detail page shows beside the
// product name is overlaid on the card's image area, top-right — so the class is
// readable while scanning the grid.

const HIGHLINE_MIN_KN = 22
const NOT_FOR_HIGHLINE = 'Not for Highline'

describe('Card classification bubble — Webbings', () => {
  let withClass: Record<string, unknown> | undefined
  let uncertifiedWithClass: Record<string, unknown> | undefined
  let weakUncertified: Record<string, unknown> | undefined
  let strongUncertifiedNfh: Record<string, unknown> | undefined
  let withoutClass: Record<string, unknown> | undefined

  const cardFor = (id: unknown) =>
    cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/webbings/${id}"])`)

  before(() => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      const classed = (i: Record<string, unknown>) =>
        i.classification != null && i.classification !== ''
      const kn = (i: Record<string, unknown>) =>
        typeof i.breaking_strength === 'number' ? i.breaking_strength : null
      const weak = (i: Record<string, unknown>) => {
        const v = kn(i)
        return v !== null && v < HIGHLINE_MIN_KN
      }

      withClass = items.find(i => classed(i) && i.isa_certified === true)
      // Uncertified with a LETTER class — the case that must stay hidden. Its
      // strength is irrelevant: a sub-22 kN webbing is never a letter class.
      uncertifiedWithClass = items.find(
        i => classed(i) && i.isa_certified !== true && i.classification !== NOT_FOR_HIGHLINE,
      )
      // Uncertified and under the floor — the case the pill must come back for.
      weakUncertified = items.find(
        i => i.isa_certified !== true && i.classification === NOT_FOR_HIGHLINE && weak(i),
      )
      // "Not for Highline" for a certification reason rather than a strength one
      // (>= 22 kN, or strength unknown) — still hidden.
      strongUncertifiedNfh = items.find(
        i => i.isa_certified !== true && i.classification === NOT_FOR_HIGHLINE && !weak(i),
      )
      // The dataset currently classifies every webbing (the class is computed
      // from fibers + strength), so this one usually finds nothing and the
      // test below bails — it guards the null path for when it doesn't.
      withoutClass = items.find(i => !classed(i))
    })
  })

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('shows the bubble with the item’s class on a certified, classified webbing', () => {
    if (!withClass) return
    cardFor(withClass.id)
      .find('[data-cy="classification-pill"]')
      .should('be.visible')
      .and('have.attr', 'data-classification', String(withClass.classification))
      .and('contain.text', String(withClass.classification))
  })

  it('omits the letter class on a webbing that is not ISA certified', () => {
    if (!uncertifiedWithClass) return
    cardFor(uncertifiedWithClass.id)
      .find('[data-cy="classification-pill"]')
      .should('not.exist')
  })

  it('shows "Not for Highline" on an uncertified webbing under 22 kN', () => {
    if (!weakUncertified) return
    cardFor(weakUncertified.id)
      .find('[data-cy="classification-pill"]')
      .should('be.visible')
      .and('have.attr', 'data-classification', NOT_FOR_HIGHLINE)
      .and('contain.text', NOT_FOR_HIGHLINE)
  })

  it('omits "Not for Highline" when the webbing is 22 kN or more', () => {
    if (!strongUncertifiedNfh) return
    cardFor(strongUncertifiedNfh.id)
      .find('[data-cy="classification-pill"]')
      .should('not.exist')
  })

  it('omits the bubble entirely when the webbing has no classification', () => {
    if (!withoutClass) return
    cardFor(withoutClass.id)
      .find('[data-cy="classification-pill"]')
      .should('not.exist')
  })

  it('shows a bubble only where certification or sub-22 kN justifies it', () => {
    // Sweep the whole grid: every rendered bubble is either a letter class on a
    // card that also carries the ISA stamp, or a "Not for Highline" pill on a
    // card whose data-breaking-strength is under the floor. (dataAttrs() spells
    // field names with dashes, and writes "" for a null value.)
    cy.get('[data-cy="gear-card"]').should('exist')
    cy.get('[data-cy="gear-card"]').each(($card) => {
      const $pill = $card.find('[data-cy="classification-pill"]')
      if ($pill.length === 0) return
      const cls = $pill.attr('data-classification')
      const certified = $card.find('[data-cy="isa-approved-badge"]').length > 0
      if (cls === NOT_FOR_HIGHLINE) {
        // A certified webbing shows its granted class at any strength; an
        // uncertified one only as the sub-22 kN warning.
        if (certified) return
        const raw = $card.attr('data-breaking-strength')
        expect(raw, `${NOT_FOR_HIGHLINE} pill card states a breaking strength`)
          .to.not.be.oneOf([undefined, ''])
        expect(Number(raw), `${NOT_FOR_HIGHLINE} pill is on a sub-22 kN card`)
          .to.be.lessThan(HIGHLINE_MIN_KN)
      } else {
        expect(certified, `letter class ${cls} is on a certified card`).to.equal(true)
      }
    })
  })

  it('overlays the bubble on the top-right of the image area', () => {
    if (!withClass) return
    cardFor(withClass.id).within(() => {
      cy.get('[data-cy="gear-card-image-area"]').then(($area) => {
        cy.get('[data-cy="classification-pill"]').then(($pill) => {
          const area = $area[0].getBoundingClientRect()
          const pill = $pill[0].getBoundingClientRect()
          // Inside the image area …
          expect(pill.top).to.be.gte(area.top)
          expect(pill.bottom).to.be.lte(area.bottom)
          // … pinned to the right half and the top half of it.
          expect(pill.left).to.be.gt(area.left + area.width / 2)
          expect(pill.right).to.be.lte(area.right)
          expect(pill.top).to.be.lt(area.top + area.height / 2)
        })
      })
    })
  })

  it('stacks the bubble above the ISA stamp when the item is also certified', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const both = (all as Record<string, unknown>[]).find(
        i => i.classification != null && i.classification !== '' && i.isa_certified === true,
      )
      if (!both) return
      cardFor(both.id).within(() => {
        cy.get('[data-cy="classification-pill"]').then(($pill) => {
          cy.get('[data-cy="isa-approved-badge"]').then(($badge) => {
            expect($pill[0].getBoundingClientRect().bottom)
              .to.be.lte($badge[0].getBoundingClientRect().top + 1)
          })
        })
      })
    })
  })
})

// Non-webbing types have no classification field at all — nothing should render.
GEAR_TYPES.filter(g => g.slug !== 'webbings').forEach(({ slug, label }) => {
  describe(`Card classification bubble — ${label} (none expected)`, () => {
    it('never renders a classification bubble', () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="gear-card"]').should('exist')
      cy.get('[data-cy="classification-pill"]').should('not.exist')
    })
  })
})

// ── Card image carousel ───────────────────────────────────────────────────────
// A card shows EVERY image the manifest holds for that product, not just the
// primary one: dots (one per image) plus prev/next controls, wrapping in both
// directions. Products with a single image get no carousel chrome at all.
// Expected image sets come from the manifest (cypress/support/images.ts) so the
// assertions are anchored to the real image library, not to the DOM's own claim.

GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Card image carousel — ${label}`, () => {
    let multi: { item: Record<string, unknown>; files: string[] } | undefined
    let single: { item: Record<string, unknown>; files: string[] } | undefined

    // Exact card lookup by detail href — a `contains(name)` match would pick the
    // wrong product whenever one name is a substring of another.
    const cardFor = (id: unknown) =>
      cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/${slug}/${id}"])`)

    before(() => {
      cy.fetchAllItems(apiPath).then((all) => {
        const withFiles = (all as Record<string, unknown>[]).map(item => ({
          item,
          files: imageFilesFor(slug, String(item.brand_name), String(item.name)),
        }))
        multi = withFiles.find(x => x.files.length > 1)
        single = withFiles.find(x => x.files.length === 1)
      })
    })

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    it('renders one dot per image for a multi-image product', () => {
      if (!multi) return
      cardFor(multi.item.id)
        .find('[data-cy="card-image-dot"]')
        .should('have.length', multi.files.length)
    })

    it('reports the full image count on the image area', () => {
      if (!multi) return
      cardFor(multi.item.id)
        .find('[data-cy="gear-card-image-area"]')
        .should('have.attr', 'data-image-count', String(multi.files.length))
    })

    it('shows prev/next controls for a multi-image product', () => {
      if (!multi) return
      cardFor(multi.item.id).within(() => {
        cy.get('[data-cy="card-image-prev"]').should('exist')
        cy.get('[data-cy="card-image-next"]').should('exist')
      })
    })

    it('starts on the primary (first) image', () => {
      if (!multi) return
      cardFor(multi.item.id)
        .find('[data-cy="gear-card-img"]')
        .should('have.attr', 'src')
        .and('include', multi.files[0])
    })

    it('next advances to the second image and moves the active dot', () => {
      if (!multi) return
      cardFor(multi.item.id).within(() => {
        cy.get('[data-cy="card-image-next"]').click()
        cy.get('[data-cy="gear-card-img"]').should('have.attr', 'src').and('include', multi!.files[1])
        cy.get('[data-cy="card-image-dot"]').eq(1).should('have.attr', 'data-active', 'true')
        cy.get('[data-cy="card-image-dot"]').eq(0).should('have.attr', 'data-active', 'false')
      })
    })

    it('cycles through every image and wraps back to the first', () => {
      if (!multi) return
      cardFor(multi.item.id).within(() => {
        // Step through each image in turn, asserting the manifest order.
        multi!.files.slice(1).forEach((file) => {
          cy.get('[data-cy="card-image-next"]').click()
          cy.get('[data-cy="gear-card-img"]').should('have.attr', 'src').and('include', file)
        })
        // One more click wraps to the primary image.
        cy.get('[data-cy="card-image-next"]').click()
        cy.get('[data-cy="gear-card-img"]').should('have.attr', 'src').and('include', multi!.files[0])
      })
    })

    it('prev from the first image wraps to the last', () => {
      if (!multi) return
      cardFor(multi.item.id).within(() => {
        cy.get('[data-cy="card-image-prev"]').click()
        cy.get('[data-cy="gear-card-img"]')
          .should('have.attr', 'src')
          .and('include', multi!.files[multi!.files.length - 1])
      })
    })

    it('clicking a dot jumps straight to that image', () => {
      if (!multi) return
      const last = multi.files.length - 1
      cardFor(multi.item.id).within(() => {
        cy.get('[data-cy="card-image-dot"]').eq(last).click()
        cy.get('[data-cy="gear-card-img"]').should('have.attr', 'src').and('include', multi!.files[last])
        cy.get('[data-cy="card-image-dot"]').eq(last).should('have.attr', 'data-active', 'true')
      })
    })

    it('carousel controls do not navigate to the detail page', () => {
      if (!multi) return
      cardFor(multi.item.id).find('[data-cy="card-image-next"]').click()
      cy.url().should('not.include', `/${slug}/${multi.item.id}`)
    })

    it('single-image products show no dots and no controls', () => {
      if (!single) return
      cardFor(single.item.id).within(() => {
        cy.get('[data-cy="gear-card-img"]').should('be.visible')
        cy.get('[data-cy="card-image-dot"]').should('not.exist')
        cy.get('[data-cy="card-image-next"]').should('not.exist')
        cy.get('[data-cy="card-image-prev"]').should('not.exist')
      })
    })
  })
})

// ── Card image fit ────────────────────────────────────────────────────────────
// DESIGN.md § Gear Card Anatomy → Image area. Nothing is ever cropped: the photo
// is fitted inside the band, and since every shot in the library is narrower
// (0.67–1.54 w/h) than the ~1.9 band, that always lands as a fit by HEIGHT with
// bars left and right. The bars are filled by a blurred copy of the same file,
// so they carry the photo's own background colour instead of a grey gutter.
//
// Measured, not read off the class list: the <img> box always fills the band, so
// the size that matters is the PAINTED rectangle inside it. `painted()` applies
// the object-fit: contain math to the real band and the real file — the numbers
// only come out right if the fit really is contain (asserted alongside) and the
// band really is wider than the shot, which is the invariant worth holding.

// The rectangle an object-fit: contain image actually paints inside its box.
function painted(box: DOMRect, nat: { w: number; h: number }) {
  const scale = Math.min(box.width / nat.w, box.height / nat.h)
  const w = nat.w * scale
  const h = nat.h * scale
  return { w, h, left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2 }
}

GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Card image fit — ${label}`, () => {
    let withImages: { item: Record<string, unknown>; files: string[] } | undefined
    let multi: { item: Record<string, unknown>; files: string[] } | undefined
    let none: Record<string, unknown> | undefined

    const cardFor = (id: unknown) =>
      cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/${slug}/${id}"])`)

    // Band rect, image box, the file's intrinsic size and the object-fit mode.
    // Scrolls the card into view and waits for the file to decode first: images
    // are lazy, and an undecoded one has no intrinsic size to fit.
    const measure = (
      id: unknown,
      fn: (r: {
        area: DOMRect
        box: DOMRect
        nat: { w: number; h: number }
        fit: string
      }) => void,
    ) => {
      cardFor(id).scrollIntoView()
      cardFor(id)
        .find('[data-cy="gear-card-img"]')
        .should(($img) => {
          expect(($img[0] as HTMLImageElement).naturalWidth, 'image has decoded').to.be.greaterThan(0)
        })
      cardFor(id).then(($card) => {
        const $img = $card.find('[data-cy="gear-card-img"]')
        const img = $img[0] as HTMLImageElement
        fn({
          area: $card.find('[data-cy="gear-card-image-area"]')[0].getBoundingClientRect(),
          box: img.getBoundingClientRect(),
          nat: { w: img.naturalWidth, h: img.naturalHeight },
          fit: $img.css('object-fit'),
        })
      })
    }

    before(() => {
      cy.fetchAllItems(apiPath).then((all) => {
        const withFiles = (all as Record<string, unknown>[]).map(item => ({
          item,
          files: imageFilesFor(slug, String(item.brand_name), String(item.name)),
        }))
        withImages = withFiles.find(x => x.files.length > 0)
        multi = withFiles.find(x => x.files.length > 1)
        none = withFiles.find(x => x.files.length === 0)?.item
      })
    })

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    it('fits the whole photo inside the band, cropping nothing', () => {
      if (!withImages) return
      measure(withImages.item.id, ({ area, box, fit }) => {
        expect(fit, 'fitted, not cropped — cover would slice off the overflow').to.equal('contain')
        // The box fills the band; object-fit does the letterboxing inside it.
        expect(box.width, 'box spans the band').to.be.closeTo(area.width, 1)
        expect(box.height, 'box spans the band').to.be.closeTo(area.height, 1)
      })
    })

    it('scales the image to the full height of the band', () => {
      if (!withImages) return
      measure(withImages.item.id, ({ area, box, nat }) => {
        const p = painted(box, nat)
        expect(p.h, 'image height fills the band').to.be.closeTo(area.height, 1)
        expect(p.top, 'nothing cropped off the top').to.be.gte(area.top - 1)
        expect(p.top + p.h, 'nothing cropped off the bottom').to.be.lte(area.bottom + 1)
      })
    })

    it('pillarboxes it, centred, instead of filling the band edge to edge', () => {
      if (!withImages) return
      measure(withImages.item.id, ({ area, box, nat }) => {
        const p = painted(box, nat)
        // Holds for every file we hold today. A shot wider than the band would
        // fit by width instead and letterbox top/bottom — the backdrop covers
        // either case, but the vertical fit is what the card band is tuned for.
        expect(nat.w / nat.h, 'shot is narrower than the band').to.be.lessThan(
          area.width / area.height,
        )
        expect(p.w, 'image is narrower than the band').to.be.lessThan(area.width)
        expect(p.left, 'bar on the left').to.be.gt(area.left)
        expect(p.left + p.w, 'bar on the right').to.be.lt(area.right)
        expect(p.left - area.left, 'bars are even — image is centred').to.be.closeTo(
          area.right - (p.left + p.w),
          2,
        )
      })
    })

    it('fills the bars with a blurred copy of the image, behind it', () => {
      if (!withImages) return
      cardFor(withImages.item.id).scrollIntoView()
      cardFor(withImages.item.id).then(($card) => {
        const $backdrop = $card.find('[data-cy="card-image-backdrop"]')
        expect($backdrop, 'backdrop exists').to.have.length(1)
        expect($backdrop.attr('src'), 'shows the current image').to.include(withImages!.files[0])
        expect($backdrop.css('filter'), 'blurred, not a second sharp picture').to.match(/blur\(/)
        expect($backdrop.attr('aria-hidden'), 'decorative').to.equal('true')
        // Lazy like the image it backs — a CSS background would fetch for every
        // off-screen card in the grid.
        expect($backdrop.attr('loading'), 'lazily loaded').to.equal('lazy')

        const area = $card.find('[data-cy="gear-card-image-area"]')[0].getBoundingClientRect()
        const bd = $backdrop[0].getBoundingClientRect()
        expect(bd.width, 'spans the band').to.be.gte(area.width - 1)
        expect(bd.height, 'spans the band').to.be.gte(area.height - 1)

        // Painted under the sharp image: the image comes later in the DOM *and*
        // is positioned, so it joins the same paint layer as the absolute
        // backdrop and wins on order. A static image would be painted under it.
        const $img = $card.find('[data-cy="gear-card-img"]')
        const FOLLOWING = 4 // Node.DOCUMENT_POSITION_FOLLOWING
        expect($backdrop[0].compareDocumentPosition($img[0]) & FOLLOWING, 'image comes after')
          .to.be.greaterThan(0)
        expect($img.css('position'), 'image is in the positioned layer').to.not.equal('static')
      })
    })

    it('clips the band, so the over-scaled backdrop cannot spill onto the content', () => {
      if (!withImages) return
      // The backdrop is deliberately scaled past the band's edges (it pushes the
      // blur's own soft border out of frame), so its *rect* is larger than the
      // band by design — what has to hold is that the band paints nothing
      // outside itself. That is the clip, not the geometry.
      cardFor(withImages.item.id).scrollIntoView()
      cardFor(withImages.item.id)
        .find('[data-cy="gear-card-image-area"]')
        .should(($area) => {
          expect($area.css('overflow'), 'band clips its own backdrop').to.equal('hidden')
        })
    })

    it('swaps the backdrop with the carousel', () => {
      if (!multi) return
      cardFor(multi.item.id).find('[data-cy="card-image-next"]').click()
      cardFor(multi.item.id)
        .find('[data-cy="card-image-backdrop"]')
        .should('have.attr', 'src')
        .and('include', multi.files[1])
    })

    it('renders no backdrop for a product with no image', () => {
      if (!none) return
      cardFor(none.id).within(() => {
        cy.get('[data-cy="card-image-backdrop"]').should('not.exist')
        cy.contains('No image').should('be.visible')
      })
    })
  })
})
