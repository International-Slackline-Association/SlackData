import { GEAR_TYPES } from '../support/gear_types'

// ISA Approved badge behaviour.
// Reference: DESIGN.md — the stamp badge (charcoal frame, teal + coral ISA mark,
// white "APPROVED" text with teal checkmark) is the ONLY representation of
// certification. Generic pills or checkmarks are wrong.

const ISA_TYPES  = GEAR_TYPES.filter(t => t.hasISA)
const NO_ISA     = GEAR_TYPES.filter(t => !t.hasISA)

// ── On gear listing cards ─────────────────────────────────────────────────────

describe('ISA Approved badge — gear cards', () => {
  ISA_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows the ISA Approved stamp on certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return // skip if no certified items in dataset

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('be.visible')
        })
      })

      it('does not show the ISA badge on non-certified items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', notCertified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('not.exist')
        })
      })

      it('positions the ISA badge inside the card image area', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="gear-card-image-area"]')
            .find('[data-cy="isa-approved-badge"]')
            .should('exist')
        })
      })

      it('does not use a plain checkmark or text pill for ISA certification', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', certified.name as string)
            .closest('[data-cy="gear-card"]')
            .within(() => {
              cy.get('[data-cy="isa-checkmark"]').should('not.exist')
              cy.get('[data-cy="isa-pill"]').should('not.exist')
            })
        })
      })
    })
  })

  NO_ISA.forEach(({ slug, label }) => {
    it(`${label}: never shows any ISA badge (type has no isa_certified field)`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
    })
  })
})

// ── On gear detail pages ──────────────────────────────────────────────────────

describe('ISA certification block — gear detail page', () => {
  ISA_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows the ISA Approved stamp badge for a certified item', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}/${certified.id}`)
          cy.get('[data-cy="isa-certification-block"]').should('be.visible')
          cy.get('[data-cy="isa-approved-badge"]').should('be.visible')
          cy.get('[data-cy="isa-not-certified-text"]').should('not.exist')
        })
      })

      it('notes the certification under the stamp, linking to the ISA standards and /safety', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const certified = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
          if (!certified) return

          cy.visit(`/${slug}/${certified.id}`)
          cy.get('[data-cy="isa-certification-block"]')
            .find('[data-cy="isa-certification-note"]')
            .should('be.visible')
          cy.get('[data-cy="isa-certification-note-standards"]')
            .should('have.attr', 'href', 'https://www.slacklineinternational.org/isa-gear-standards/')
          cy.get('[data-cy="isa-certification-note-safety"]').click()
          cy.location('pathname').should('eq', '/safety')
          cy.location('hash').should('eq', '#isa-certification')
          cy.get('#isa-certification').should(($section) => {
            const { top } = $section[0].getBoundingClientRect()
            expect(top).to.be.gte(0)
            expect(top).to.be.lt(Cypress.config('viewportHeight') / 2)
          })
        })
      })

      it('shows no certification note on a non-certified item', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.visit(`/${slug}/${notCertified.id}`)
          cy.get('[data-cy="isa-certification-block"]').should('be.visible')
          cy.get('[data-cy="isa-certification-note"]').should('not.exist')
        })
      })

      it('shows subdued "Not ISA Certified" text (no badge) for a non-certified item', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const notCertified = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
          if (!notCertified) return

          cy.visit(`/${slug}/${notCertified.id}`)
          cy.get('[data-cy="isa-certification-block"]').should('be.visible')
          cy.get('[data-cy="isa-not-certified-text"]').should('be.visible')
          cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
        })
      })

      it('renders the certification block above the spec table', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const item = all[0] as Record<string, unknown>
          cy.visit(`/${slug}/${item.id}`)

          cy.get('[data-cy="isa-certification-block"]').then(($cert) => {
            cy.get('[data-cy="spec-table"]').then(($spec) => {
              const certBottom  = $cert[0].getBoundingClientRect().bottom
              const specTop     = $spec[0].getBoundingClientRect().top
              expect(certBottom).to.be.lte(specTop)
            })
          })
        })
      })
    })
  })

  NO_ISA.forEach(({ slug, apiPath, label }) => {
    it(`${label}: omits the ISA certification block entirely`, () => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        cy.visit(`/${slug}/${body[0].id}`)
        cy.get('[data-cy="isa-certification-block"]').should('not.exist')
        cy.get('[data-cy="isa-approved-badge"]').should('not.exist')
        cy.get('[data-cy="isa-not-certified-text"]').should('not.exist')
      })
    })
  })
})

// ── The detail-page stamp and the not-for-highline line ────────────────────────
// Card labels (stamp / "Not ISA Certified" / class letter) are covered in
// gear_cards.cy.ts. Certification comes only from the ISA's approved-gear list
// (isa_certified.json → the gear rows and /isacertification).

describe('ISA stamp — gear detail page', () => {
  // The certificate's details are the ISA's record, so the page no longer
  // repeats them: the stamp sits right of the name and price and links to the
  // ISA's approved-gear list.
  it('sits to the right of the name and price, and links to the ISA approved-gear list', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const item = (all as Record<string, unknown>[]).find(i => i.isa_certified === true)
      expect(item, 'a certified webbing').to.be.an('object')
      cy.visit(`/webbings/${item!.id}`)
      cy.get('[data-cy="isa-stamp-link"]')
        .should('have.attr', 'href', 'https://data.slacklineinternational.org/safety/isa-approved-gear/')
        .and('have.attr', 'target', '_blank')
        .find('[data-cy="isa-approved-badge"]')
        .should('be.visible')
      cy.get('[data-cy="isa-stamp-link"]').then(($stamp) => {
        const stamp = $stamp[0].getBoundingClientRect()
        cy.get('[data-cy="detail-name"]').then(($name) => {
          const name = $name[0].getBoundingClientRect()
          expect(stamp.left, 'right of the name').to.be.gte(name.right)
          expect(stamp.top, 'level with the header, not below it').to.be.lt(name.bottom)
        })
      })
    })
  })

  it('no longer lists the certificate details', () => {
    cy.visit('/webbing/63') // Marathon: a Webbing and a Sewn Loop certificate
    cy.get('[data-cy="isa-stamp-link"]').should('be.visible')
    cy.get('[data-cy="isa-certificates"]').should('not.exist')
    cy.get('[data-cy="isa-certificate"]').should('not.exist')
  })

  it('shows no stamp link on an uncertified item', () => {
    cy.fetchAllItems('weblock').then((all) => {
      const item = (all as Record<string, unknown>[]).find(i => i.isa_certified === false)
      if (!item) return
      cy.visit(`/weblocks/${item.id}`)
      cy.get('[data-cy="isa-not-certified-text"]').should('be.visible')
      cy.get('[data-cy="isa-stamp-link"]').should('not.exist')
    })
  })

  it('kits carry no isa_certified field and no certification block', () => {
    ;['starterkit', 'tricklinekit'].forEach((apiPath) => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        expect(body[0]).not.to.have.property('isa_certified')
      })
    })
  })
})

describe('Manufacturer states not for highlining — gear detail page', () => {
  it('shows the line directly under the certification block, linked to its source', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const item = (all as Record<string, unknown>[]).find(
        i => i.manufacturer_not_for_highline === true,
      )
      expect(item, 'a webbing its maker says is not for highlining').to.be.an('object')
      cy.visit(`/webbings/${item!.id}`)
      cy.get('[data-cy="manufacturer-not-for-highline"]')
        .should('be.visible')
        .and('contain.text', 'Manufacturer states not for highlining')
      if (item!.manufacturer_not_for_highline_source) {
        cy.get('[data-cy="manufacturer-not-for-highline-source"]')
          .should('have.attr', 'href', String(item!.manufacturer_not_for_highline_source))
      }
      cy.get('[data-cy="isa-certification-block"]').then(($block) => {
        cy.get('[data-cy="manufacturer-not-for-highline"]').then(($line) => {
          const gap = $line[0].getBoundingClientRect().top - $block[0].getBoundingClientRect().bottom
          expect(gap, 'directly under the block').to.be.within(0, 16)
        })
      })
    })
  })

  it('says nothing when the maker markets it for highlining, or nobody checked', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      const marketed = items.find(i => i.manufacturer_not_for_highline === false)
      const unchecked = items.find(i => i.manufacturer_not_for_highline == null)
      ;[marketed, unchecked].forEach((item) => {
        if (!item) return
        cy.visit(`/webbings/${item.id}`)
        cy.get('[data-cy="detail-name"]').should('be.visible')
        cy.get('[data-cy="manufacturer-not-for-highline"]').should('not.exist')
      })
    })
  })

  it('never appears on a card', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="gear-card"]').should('have.length.greaterThan', 0)
    cy.get('[data-cy="manufacturer-not-for-highline"]').should('not.exist')
  })
})

// ── ISA Warning banner ────────────────────────────────────────────────────────

// ── The official ISA stamp PNGs ───────────────────────────────────────────────
// Every certified item wears the ISA's own stamp for its standard, and the
// image actually loads — a 404 would fall back to the drawn badge, which the
// tests above would still pass. Which file a certificate maps to is unit-tested
// (tests/unit/isaStamp.test.ts); this checks the served page.

describe('ISA stamp images', () => {
  ISA_TYPES.forEach(({ slug, apiPath, label }) => {
    it(`${label}: every certified item shows a loaded stamp for its standard`, () => {
      cy.fetchAllItems(apiPath).then((all) => {
        const certified = (all as Record<string, unknown>[]).filter(i => i.isa_certified === true)
        certified.forEach((item) => {
          const standard = /^ISA:(\d+)/.exec(String(item.isa_certificate))?.[1]
          expect(standard, `${item.name} has an isa_certificate`).to.be.a('string')

          cy.visit(`/${slug}/${item.id}`)
          cy.get('[data-cy="isa-stamp-link"] img[data-cy="isa-approved-badge"]')
            .should('be.visible')
            .and('have.attr', 'src')
            .and('match', new RegExp(`/isa-labels/ISA${standard}[A-Cplus]*\\.png$`))
          cy.get('[data-cy="isa-stamp-link"] img[data-cy="isa-approved-badge"]')
            .should(($img) => {
              expect(($img[0] as HTMLImageElement).naturalWidth, 'stamp loaded').to.be.greaterThan(0)
            })
        })
      })
    })
  })

  // `+` is spelled `plus` in the filename — the one stamp whose path could be
  // mangled by encoding. Marathon (webbing 63) holds ISA:41:A+.
  it('an A+ webbing (Marathon) wears the A+ stamp', () => {
    cy.visit('/webbing/63')
    cy.get('[data-cy="isa-stamp-link"] [data-cy="isa-approved-badge"]')
      .should('have.attr', 'src', '/isa-labels/ISA41Aplus.png')
  })
})

describe('ISA Warning banner', () => {
  const WARNING_TYPES = GEAR_TYPES.filter(t => t.hasISAWarning)
  const NO_WARNING    = GEAR_TYPES.filter(t => !t.hasISAWarning)

  WARNING_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows an amber warning banner when isa_warning is set', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const withWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning != null)
          if (!withWarning) return

          cy.visit(`/${slug}/${withWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]')
            .should('be.visible')
            .and('contain.text', withWarning.isa_warning as string)
        })
      })

      it('positions the warning banner between the header and the spec table', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const withWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning != null)
          if (!withWarning) return

          cy.visit(`/${slug}/${withWarning.id}`)
          cy.get('[data-cy="detail-name"]').then(($name) => {
            cy.get('[data-cy="isa-warning-banner"]').then(($banner) => {
              cy.get('[data-cy="spec-table"]').then(($spec) => {
                expect($name[0].getBoundingClientRect().bottom)
                  .to.be.lte($banner[0].getBoundingClientRect().top)
                expect($banner[0].getBoundingClientRect().bottom)
                  .to.be.lte($spec[0].getBoundingClientRect().top)
              })
            })
          })
        })
      })

      it('hides the warning banner when isa_warning is null', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const noWarning = (all as Record<string, unknown>[]).find(i => i.isa_warning == null)
          if (!noWarning) return

          cy.visit(`/${slug}/${noWarning.id}`)
          cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
        })
      })
    })
  })

  NO_WARNING.forEach(({ slug, apiPath, label }) => {
    it(`${label}: never shows an ISA warning banner`, () => {
      cy.request(`${Cypress.env('apiUrl')}/${apiPath}/?limit=1`).then(({ body }) => {
        cy.visit(`/${slug}/${body[0].id}`)
        cy.get('[data-cy="isa-warning-banner"]').should('not.exist')
      })
    })
  })
})
