import { GEAR_TYPES } from '../support/gear_types'
import { imageFilesFor } from '../support/images'

// Detail page tests run for every gear type.
// The `before` hook fetches a real item from the API so assertions
// can verify both structure and actual data values.

GEAR_TYPES.forEach(({ slug, apiPath, label, hasISA, hasISAWarning, specFields }) => {
  describe(`Gear detail page — ${label}`, () => {
    let item: Record<string, unknown>
    const api = () => Cypress.env('apiUrl')

    before(() => {
      cy.request(`${api()}/${apiPath}/?limit=1`).then(({ body }) => {
        item = body[0]
      })
    })

    beforeEach(() => {
      cy.visit(`/${slug}/${item.id}`)
    })

    // ── Back link ─────────────────────────────────────────────────────────────

    it(`shows a back link labelled "← ${label}"`, () => {
      cy.get('[data-cy="detail-back-link"]')
        .should('be.visible')
        .and('contain.text', label)
    })

    it('back link navigates to the gear listing page', () => {
      cy.get('[data-cy="detail-back-link"]').click()
      cy.url().should('include', `/${slug}`)
    })

    // ── Header block (brand + name + price) ───────────────────────────────────

    it('shows the brand name', () => {
      cy.get('[data-cy="detail-brand"]')
        .should('be.visible')
        .and('contain.text', item.brand_name as string)
    })

    it('shows the product name', () => {
      cy.get('[data-cy="detail-name"]')
        .should('be.visible')
        .and('contain.text', item.name as string)
    })

    // Presence/absence only — the converted amount, the ≈ prefix and the
    // "as sold" secondary line are currency.cy.ts's business.
    it('shows the price when it is set', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const withPrice = (body as Record<string, unknown>[]).find(i => i.price != null)
        if (!withPrice) return
        cy.visit(`/${slug}/${withPrice.id}`)
        cy.get('[data-cy="detail-price"]').should('be.visible')
      })
    })

    it('omits the price element entirely when price is null', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const noPrice = (body as Record<string, unknown>[]).find(i => i.price == null)
        if (!noPrice) return
        cy.visit(`/${slug}/${noPrice.id}`)
        cy.get('[data-cy="detail-price"]').should('not.exist')
      })
    })

    // ── Tree protectors: price_unit appended ──────────────────────────────────

    if (slug === 'treepros') {
      it('appends the price unit (single / pair) to the price', () => {
        cy.request(`${api()}/treepro/?limit=100`).then(({ body }) => {
          const withPriceUnit = (body as Record<string, unknown>[])
            .find(i => i.price != null && i.price_unit != null)
          if (!withPriceUnit) return
          cy.visit(`/treepros/${withPriceUnit.id}`)
          cy.get('[data-cy="detail-price"]')
            .should('contain.text', withPriceUnit.price_unit as string)
        })
      })
    }

    // ── Spec table ────────────────────────────────────────────────────────────

    it('shows the SPECIFICATIONS section heading', () => {
      cy.get('[data-cy="spec-table"]').should('be.visible')
    })

    // For fields marked alwaysPresent, assert visibility unconditionally.
    // For optional fields, fetch an item where the field is set, then assert.
    specFields.forEach(({ field, label: fieldLabel, unit, alwaysPresent }) => {
      if (alwaysPresent) {
        it(`shows the "${fieldLabel}" spec row`, () => {
          cy.get(`[data-cy="spec-row"][data-field="${field}"]`).should('be.visible')
        })

        if (unit) {
          it(`appends "${unit}" to the ${fieldLabel} value`, () => {
            cy.get(`[data-cy="spec-row"][data-field="${field}"]`).should('contain.text', unit)
          })
        }
      } else {
        it(`shows the "${fieldLabel}" spec row when the field is non-null`, () => {
          cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
            const withField = (body as Record<string, unknown>[]).find(i => i[field] != null)
            if (!withField) return
            cy.visit(`/${slug}/${withField.id}`)
            cy.get(`[data-cy="spec-row"][data-field="${field}"]`).should('be.visible')
            if (unit) {
              cy.get(`[data-cy="spec-row"][data-field="${field}"]`).should('contain.text', unit)
            }
          })
        })

        it(`omits the "${fieldLabel}" spec row when the field is null`, () => {
          cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
            const nullField = (body as Record<string, unknown>[]).find(i => i[field] == null)
            if (!nullField) return
            cy.visit(`/${slug}/${nullField.id}`)
            cy.get(`[data-cy="spec-row"][data-field="${field}"]`).should('not.exist')
          })
        })
      }
    })

    // Weblock: width shown as "min–max mm" or "min mm" ───────────────────────
    if (slug === 'weblocks') {
      it('formats the width range as "min–maxmm" when width_max is set', () => {
        cy.request(`${api()}/weblock/?limit=100`).then(({ body }) => {
          const withRange = (body as Record<string, unknown>[])
            .find(i => i.width_max != null)
          if (!withRange) return
          cy.visit(`/weblocks/${withRange.id}`)
          cy.get('[data-cy="spec-row"][data-field="width_range"]')
            .should('contain.text', `${withRange.width_min}`)
            .and('contain.text', `${withRange.width_max}`)
            .and('contain.text', 'mm')
        })
      })
    }

    // Webbing: classification rendered as a colored pill ─────────────────────
    // Shown in two cases only: a letter class on an ISA-certified webbing (the
    // class is an ISA grant, so it appears only where certification does), and
    // "Not for Highline" on any webbing under 22 kN (a strength fact, not a
    // grant). See src/components/gear/ClassificationBubble.tsx.
    if (slug === 'webbings') {
      it('renders classification as a bubble beside the name, not as a spec row', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const withClass = (body as Record<string, unknown>[])
            .find(i => i.classification != null && i.isa_certified === true)
          if (!withClass) return
          cy.visit(`/webbings/${withClass.id}`)

          // The bubble carries the class letter and sits next to the title …
          cy.get('[data-cy="classification-pill"]')
            .should('be.visible')
            .and('have.attr', 'data-classification', String(withClass.classification))

          // … and classification is no longer duplicated in the spec grid.
          cy.get('[data-cy="spec-row"][data-field="classification"]').should('not.exist')

          cy.get('[data-cy="detail-name"]').then(($name) => {
            cy.get('[data-cy="classification-pill"]').then(($pill) => {
              const name = $name[0].getBoundingClientRect()
              const pill = $pill[0].getBoundingClientRect()
              // Same line, bubble to the right of the name.
              expect(pill.left).to.be.gte(name.right - 1)
              expect(pill.top).to.be.lt(name.bottom)
            })
          })
        })
      })

      it('omits the letter class on a webbing that is not ISA certified', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const uncertified = (body as Record<string, unknown>[]).find(
            i =>
              i.classification != null &&
              i.classification !== 'Not for Highline' &&
              i.isa_certified !== true,
          )
          if (!uncertified) return
          cy.visit(`/webbings/${uncertified.id}`)
          // The page has loaded (the ISA block always renders for webbings) …
          cy.get('[data-cy="isa-not-certified-text"]').should('be.visible')
          // … and no class is claimed for it.
          cy.get('[data-cy="classification-pill"]').should('not.exist')
        })
      })

      it('shows "Not for Highline" on an uncertified webbing under 22 kN', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const weak = (body as Record<string, unknown>[]).find(
            i =>
              i.classification === 'Not for Highline' &&
              i.isa_certified !== true &&
              typeof i.breaking_strength === 'number' &&
              i.breaking_strength < 22,
          )
          if (!weak) return
          cy.visit(`/webbings/${weak.id}`)
          cy.get('[data-cy="classification-pill"]')
            .should('be.visible')
            .and('have.attr', 'data-classification', 'Not for Highline')
            // The warning is about strength, so it must not be titled an ISA type.
            .and('have.attr', 'title')
            .and('not.contain', 'ISA Type')
        })
      })

      it('omits "Not for Highline" when the webbing is 22 kN or more', () => {
        // Uncertified and unclassed for a certification reason rather than a
        // strength one (e.g. 25 kN polyester — no Type C for PES). Nothing to warn
        // about, so nothing renders.
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const strong = (body as Record<string, unknown>[]).find(
            i =>
              i.classification === 'Not for Highline' &&
              i.isa_certified !== true &&
              typeof i.breaking_strength === 'number' &&
              i.breaking_strength >= 22,
          )
          if (!strong) return
          cy.visit(`/webbings/${strong.id}`)
          cy.get('[data-cy="isa-not-certified-text"]').should('be.visible')
          cy.get('[data-cy="classification-pill"]').should('not.exist')
        })
      })
    }

    // Webbing: the stretch curve ──────────────────────────────────────────────
    // A curve of 3+ measured points renders as a two-row Load/Stretch table;
    // 1–2 points render as inline text ("3.4% @ 10 kN · 4.7% @ 15 kN"), because
    // a table one or two columns wide is all chrome and no signal. 0 kN is
    // dropped from the display (every curve reads 0% there).
    if (slug === 'webbings') {
      // Mirrors displayPoints() in src/utils/stretch.ts.
      const displayPoints = (raw: unknown): { kn: number; percent: number }[] => {
        if (typeof raw !== 'string' || raw === '') return []
        let pts: { kn: number; percent: number }[] = []
        try {
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          pts = parsed.filter(
            (p: unknown): p is { kn: number; percent: number } =>
              !!p && typeof p === 'object' &&
              typeof (p as { kn: unknown }).kn === 'number' &&
              typeof (p as { percent: unknown }).percent === 'number',
          )
        } catch {
          return []
        }
        const nonZero = pts.filter(p => p.kn !== 0)
        return [...(nonZero.length ? nonZero : pts)].sort((a, b) => a.kn - b.kn)
      }

      it('renders a curve of 3+ points as a Load/Stretch table, one column per measured point', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const long = (body as Record<string, unknown>[])
            .find(i => displayPoints(i.stretch).length >= 3)
          if (!long) return
          const pts = displayPoints(long.stretch)
          cy.visit(`/webbings/${long.id}`)

          cy.get('[data-cy="spec-row"][data-field="stretch"]')
            .find('[data-cy="stretch-table"]').should('exist')

          // Exactly one column per measured point, in ascending kN order …
          cy.get('[data-cy="stretch-kn"]').should('have.length', pts.length)
          cy.get('[data-cy="stretch-percent"]').should('have.length', pts.length)
          cy.get('[data-cy="stretch-percent"]').then(($cells) => {
            const kns = [...$cells].map(c => Number(c.getAttribute('data-kn')))
            expect(kns).to.deep.equal(pts.map(p => p.kn))
          })

          // … and no 0 kN column, since every curve reads 0% there.
          cy.get('[data-cy="stretch-percent"][data-kn="0"]').should('not.exist')
        })
      })

      it('renders a curve of 1–2 points as inline text, with no table', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const short = (body as Record<string, unknown>[]).find(i => {
            const n = displayPoints(i.stretch).length
            return n >= 1 && n < 3
          })
          if (!short) return
          const pts = displayPoints(short.stretch)
          cy.visit(`/webbings/${short.id}`)

          cy.get('[data-cy="spec-row"][data-field="stretch"]').should('be.visible')
          cy.get('[data-cy="stretch-table"]').should('not.exist')
          cy.get('[data-cy="spec-row"][data-field="stretch"]')
            .should('contain.text', `${pts[0].percent}% @ ${pts[0].kn} kN`)
        })
      })

      it('omits the stretch row entirely when there are no measured points', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const none = (body as Record<string, unknown>[])
            .find(i => displayPoints(i.stretch).length === 0)
          if (!none) return
          cy.visit(`/webbings/${none.id}`)
          cy.get('[data-cy="spec-row"][data-field="stretch"]').should('not.exist')
        })
      })
    }

    // ── Description ───────────────────────────────────────────────────────────

    it('shows the description when it is set', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const withDesc = (body as Record<string, unknown>[]).find(i => i.description)
        if (!withDesc) return
        cy.visit(`/${slug}/${withDesc.id}`)
        cy.get('[data-cy="detail-description"]').should('be.visible')
      })
    })

    it('omits the description when it is null', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const noDesc = (body as Record<string, unknown>[]).find(i => !i.description)
        if (!noDesc) return
        cy.visit(`/${slug}/${noDesc.id}`)
        cy.get('[data-cy="detail-description"]').should('not.exist')
      })
    })

    // ── View product button ───────────────────────────────────────────────────

    it('shows a "View product" button when product_url is set', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const withUrl = (body as Record<string, unknown>[]).find(i => i.product_url)
        if (!withUrl) return
        cy.visit(`/${slug}/${withUrl.id}`)
        cy.get('[data-cy="view-product-btn"]')
          .should('be.visible')
          .and('have.attr', 'href', withUrl.product_url as string)
          .and('have.attr', 'target', '_blank')
          .and('have.attr', 'rel', 'noopener noreferrer')
      })
    })

    it('omits the "View product" button when product_url is null', () => {
      cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
        const noUrl = (body as Record<string, unknown>[]).find(i => !i.product_url)
        if (!noUrl) return
        cy.visit(`/${slug}/${noUrl.id}`)
        cy.get('[data-cy="view-product-btn"]').should('not.exist')
      })
    })

    // ── ISA warning banner ────────────────────────────────────────────────────

    if (hasISAWarning) {
      it('shows the ISA warning banner when isa_warning is set', () => {
        cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
          const withWarning = (body as Record<string, unknown>[])
            .find(i => i.isa_warning != null)
          if (!withWarning) return
          cy.visit(`/${slug}/${withWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]').should('be.visible')
        })
      })

      it('hides the ISA warning banner when isa_warning is null', () => {
        cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
          const noWarning = (body as Record<string, unknown>[])
            .find(i => i.isa_warning == null)
          if (!noWarning) return
          cy.visit(`/${slug}/${noWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
        })
      })
    }

    if (!hasISAWarning) {
      it('never shows an ISA warning banner (this type has no isa_warning field)', () => {
        cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
      })
    }

    // ── Image carousel ────────────────────────────────────────────────────────
    // The detail page shares its body (and therefore its image carousel) with
    // the listing's Detailed view, so every image we hold for a product is
    // browsable here too — same controls as the cards, but the visible <img>
    // keeps this page's own detail-img hook.

    describe('image carousel', () => {
      let multi: { item: Record<string, unknown>; files: string[] } | undefined
      let single: { item: Record<string, unknown>; files: string[] } | undefined

      before(() => {
        cy.request(`${api()}/${apiPath}/?limit=100`).then(({ body }) => {
          const withFiles = (body as Record<string, unknown>[]).map(i => ({
            item: i,
            files: imageFilesFor(slug, String(i.brand_name), String(i.name)),
          }))
          multi = withFiles.find(x => x.files.length > 1)
          single = withFiles.find(x => x.files.length === 1)
        })
      })

      it('renders one dot per image for a multi-image product', () => {
        if (!multi) return
        cy.visit(`/${slug}/${multi.item.id}`)
        cy.get('[data-cy="card-image-dot"]').should('have.length', multi.files.length)
      })

      it('starts on the primary (first) image', () => {
        if (!multi) return
        cy.visit(`/${slug}/${multi.item.id}`)
        cy.get('[data-cy="detail-img"]').should('have.attr', 'src').and('include', multi.files[0])
      })

      it('next advances to the second image and moves the active dot', () => {
        if (!multi) return
        cy.visit(`/${slug}/${multi.item.id}`)
        cy.get('[data-cy="card-image-next"]').click()
        cy.get('[data-cy="detail-img"]').should('have.attr', 'src').and('include', multi!.files[1])
        cy.get('[data-cy="card-image-dot"]').eq(1).should('have.attr', 'data-active', 'true')
      })

      it('shows no carousel chrome for a single-image product', () => {
        if (!single) return
        cy.visit(`/${slug}/${single.item.id}`)
        cy.get('[data-cy="detail-img"]').should('be.visible')
        cy.get('[data-cy="card-image-dot"]').should('not.exist')
        cy.get('[data-cy="card-image-next"]').should('not.exist')
      })

      // The band follows the same rule as the listing cards — fit by height,
      // blurred copy behind the leftover width (DESIGN.md § Gear Card Anatomy →
      // Image area, § Gear Detail Page). It is the same component, so this is a
      // wiring check that the detail band didn't grow its own treatment, not a
      // second copy of the spec — gear_cards.cy.ts owns the full geometry.
      it('fits the image to the band height and backs it with a blurred copy', () => {
        const chosen = multi ?? single
        if (!chosen) return
        cy.visit(`/${slug}/${chosen.item.id}`)
        cy.get('[data-cy="detail-img"]').should(($img) => {
          expect(($img[0] as HTMLImageElement).naturalWidth, 'image has decoded').to.be.greaterThan(0)
        })
        cy.get('[data-cy="detail-image-area"]').then(($area) => {
          const area = $area[0].getBoundingClientRect()
          const $img = $area.find('[data-cy="detail-img"]')
          const img = $img[0] as HTMLImageElement
          const box = img.getBoundingClientRect()
          expect($img.css('object-fit'), 'fitted, not cropped').to.equal('contain')
          expect(box.width, 'box spans the band').to.be.closeTo(area.width, 1)
          expect(box.height, 'box spans the band').to.be.closeTo(area.height, 1)

          // This band is much squarer than the cards' (~1.1 vs ~1.9 w/h), so
          // which axis ends up flush depends on the shot. What holds either way
          // is that the whole photo is inside the band and one axis fills it —
          // the blurred backdrop takes care of the leftover.
          const scale = Math.min(area.width / img.naturalWidth, area.height / img.naturalHeight)
          const w = img.naturalWidth * scale
          const h = img.naturalHeight * scale
          expect(w, 'painted width within the band').to.be.lte(area.width + 1)
          expect(h, 'painted height within the band').to.be.lte(area.height + 1)
          expect(
            Math.abs(w - area.width) < 1 || Math.abs(h - area.height) < 1,
            'one axis fills the band',
          ).to.equal(true)

          const $backdrop = $area.find('[data-cy="card-image-backdrop"]')
          expect($backdrop.attr('src'), 'backdrop is the same file').to.equal(img.getAttribute('src'))
          expect($backdrop.css('filter'), 'backdrop is blurred').to.match(/blur\(/)
        })
      })
    })

    // ── 404-like: unknown ID ──────────────────────────────────────────────────

    it('shows a not-found message for an unknown item ID', () => {
      cy.visit(`/${slug}/999999`)
      cy.get('[data-cy="not-found"]').should('be.visible')
    })
  })
})
