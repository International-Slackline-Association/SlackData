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
// and the range filter — the webbing model stores grams per metre.

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

// ── Classification bubble on the card ─────────────────────────────────────────
// Webbing only. The same bubble the detail page shows beside the product name is
// overlaid on the card's image area, top-right — so the highline class is
// readable while scanning the grid, without opening every item.

describe('Card classification bubble — Webbings', () => {
  let withClass: Record<string, unknown> | undefined
  let withoutClass: Record<string, unknown> | undefined

  const cardFor = (id: unknown) =>
    cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/webbings/${id}"])`)

  before(() => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      withClass = items.find(i => i.classification != null && i.classification !== '')
      withoutClass = items.find(i => i.classification == null || i.classification === '')
    })
  })

  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('shows the bubble with the item’s class on a classified webbing', () => {
    if (!withClass) return
    cardFor(withClass.id)
      .find('[data-cy="classification-pill"]')
      .should('be.visible')
      .and('have.attr', 'data-classification', String(withClass.classification))
      .and('contain.text', String(withClass.classification))
  })

  it('omits the bubble entirely when the webbing has no classification', () => {
    if (!withoutClass) return
    cardFor(withoutClass.id)
      .find('[data-cy="classification-pill"]')
      .should('not.exist')
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
