import { GEAR_TYPES } from '../support/gear_types'

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
    if (slug === 'webbings') {
      it('renders classification as a pill, not plain text', () => {
        cy.request(`${api()}/webbing/?limit=100`).then(({ body }) => {
          const withClass = (body as Record<string, unknown>[])
            .find(i => i.classification != null)
          if (!withClass) return
          cy.visit(`/webbings/${withClass.id}`)
          cy.get('[data-cy="spec-row"][data-field="classification"]')
            .find('[data-cy="classification-pill"]')
            .should('be.visible')
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

    // ── 404-like: unknown ID ──────────────────────────────────────────────────

    it('shows a not-found message for an unknown item ID', () => {
      cy.visit(`/${slug}/999999`)
      cy.get('[data-cy="not-found"]').should('be.visible')
    })
  })
})
