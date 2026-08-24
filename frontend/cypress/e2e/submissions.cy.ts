// The public "suggest a correction" box — DESIGN.md § Suggest a Correction.
//
// Driven against the real backend, like every other spec here. That means these
// tests write real rows into the local submissions store (a separate SQLite file
// from the catalogue — see slack_data/submissions/repository.py). That is the
// point: the thing most likely to break is the submissions router accidentally
// reaching for the read-only catalogue session, and only a real POST catches it.
//
// What is NOT asserted here: the captcha. Local dev has no TURNSTILE_SECRET, so
// `turnstile.is_enabled()` is false and the check is skipped — exactly the mode
// this suite runs in. The captcha's behaviour is covered in tests/test_submissions.py,
// where the secret can be set per-case.

const SLUG = 'webbings'
const API = 'webbing'

// The sentence the success panel exists to deliver. Pinned, because softening it
// is the easiest well-meaning change to make and the most damaging.
const NOT_LIVE = 'Nothing has changed on the site yet'

function openCorrectionForm() {
  cy.fetchAllItems(API).then(items => {
    const id = (items[0] as { id: number }).id
    cy.visit(`/${SLUG}/${id}`)
  })
  cy.getByData('suggest-correction').click()
  cy.getByData('submission-form').should('be.visible')
}

describe('Suggest a correction', () => {
  describe('entry points', () => {
    it('offers a correction button on the detail page', () => {
      cy.fetchAllItems(API).then(items => {
        const id = (items[0] as { id: number }).id
        cy.visit(`/${SLUG}/${id}`)
      })
      cy.getByData('suggest-correction').should('be.visible')
    })

    it('offers a "missing something?" link on the listing', () => {
      cy.visit(`/${SLUG}`)
      cy.getByData('suggest-new-item').should('be.visible')
    })

    it('does NOT put a report control on every card', () => {
      // Deliberate: the card is a scanning surface. See DESIGN.md § Entry points.
      cy.visit(`/${SLUG}`)
      cy.get('[data-cy="gear-card"]').first().within(() => {
        cy.get('[data-cy="suggest-correction"]').should('not.exist')
      })
    })
  })

  describe('the dialog', () => {
    it('opens, shows the current value, and closes on Escape', () => {
      openCorrectionForm()
      // The current value is shown so the submitter corrects what we hold,
      // not what they remember seeing.
      cy.getByData('change-current').should('exist')
      cy.get('body').type('{esc}')
      cy.getByData('submission-form').should('not.exist')
    })

    it('closes on Cancel', () => {
      openCorrectionForm()
      cy.getByData('submission-cancel').click()
      cy.getByData('submission-form').should('not.exist')
    })

    it('only offers fields that gear type actually has', () => {
      openCorrectionForm()
      cy.getByData('change-field')
        .find('option')
        .then(options => {
          const fields = [...options].map(o => (o as HTMLOptionElement).value)
          expect(fields).to.include('breaking_strength')
          expect(fields).to.include('brand_name')
          // Weblock-only — offering it here would guarantee a 422.
          expect(fields).to.not.include('front_pin')
          // Display composites are not model fields.
          expect(fields).to.not.include('width_range')
        })
    })

    it('offers product type as a field, defaulted to the page you came from', () => {
      // The form is the same on every page — only the default differs.
      openCorrectionForm()
      cy.getByData('submission-gear-type').should('have.value', SLUG)
      cy.getByData('submission-gear-type')
        .find('option')
        .should('have.length.at.least', 8)
    })

    it('re-bases the field picker when the product type changes', () => {
      openCorrectionForm()
      cy.getByData('submission-gear-type').select('weblocks')
      cy.getByData('change-field')
        .find('option')
        .then(options => {
          const fields = [...options].map(o => (o as HTMLOptionElement).value)
          expect(fields).to.include('front_pin')          // weblock-only
          expect(fields).to.not.include('webbing_construction')  // webbing-only
        })
    })

    it('says so when changing the type turns a correction into a new-item tip', () => {
      // The id it was opened with belongs to a different table now, so it
      // cannot stay a correction to that item.
      openCorrectionForm()
      cy.getByData('submission-retargeted').should('not.exist')
      cy.getByData('submission-gear-type').select('grips')
      cy.getByData('submission-retargeted').should('be.visible')
      cy.getByData('submission-form').should('contain', 'Suggest a missing item')
    })

    it('captures the brand, because gear ids are not stable', () => {
      // "<brand> <name>" is what actually identifies the item later; the id
      // shifts whenever the seed JSON is reordered. Prefilled from the page.
      openCorrectionForm()
      cy.getByData('submission-gear-brand').invoke('val').should('not.be.empty')
    })

    it('sends the brand with the submission', () => {
      cy.fetchAllItems(API).then(items => {
        const item = items[0] as { id: number; brand_name: string }
        cy.visit(`/${SLUG}/${item.id}`)
        cy.getByData('suggest-correction').click()
        cy.getByData('submission-note').type('Cypress: brand capture.')
        cy.getByData('submission-submit').click()
        cy.getByData('submission-success').should('be.visible')

        cy.request({
          url: `${Cypress.env('apiUrl')}/submissions/?status=pending&limit=100`,
          headers: { Authorization: 'Bearer dev-admin-token' },
        }).then(({ body }) => {
          const mine = (body as { note: string; gear_brand: string }[]).find(
            s => s.note === 'Cypress: brand capture.',
          )
          expect(mine, 'the submission was stored').to.exist
          expect(mine!.gear_brand).to.eq(item.brand_name)
        })
      })
    })

    it('no captcha widget renders without a site key', () => {
      // Local dev and CI have no VITE_TURNSTILE_SITE_KEY, so Cloudflare is
      // never contacted — which is why this suite runs offline.
      openCorrectionForm()
      cy.getByData('turnstile-widget').should('not.exist')
    })

    it('adds and removes change rows', () => {
      openCorrectionForm()
      cy.getByData('change-row').should('have.length', 1)
      cy.getByData('add-change').click()
      cy.getByData('change-row').should('have.length', 2)
      cy.getByData('remove-change').first().click()
      cy.getByData('change-row').should('have.length', 1)
    })
  })

  describe('submitting', () => {
    it('accepts a correction and says it is not live yet', () => {
      openCorrectionForm()
      cy.getByData('change-field').select('breaking_strength')
      cy.getByData('change-value').type('31')
      cy.getByData('submission-note').type('Cypress: manufacturer spec sheet says 31 kN.')
      cy.getByData('submission-submit').click()

      cy.getByData('submission-success').should('be.visible')
      // All three things the panel must say.
      cy.getByData('submission-success').should('contain', NOT_LIVE)
      cy.getByData('submission-success').should('contain', 'moderator')
      cy.getByData('submission-id')
        .invoke('text')
        .should('match', /^[0-9A-HJKMNP-TV-Z]{26}$/)   // a ULID
    })

    it('accepts a note with no changed field', () => {
      openCorrectionForm()
      cy.getByData('submission-note').type('Cypress: the photo is of a different model.')
      cy.getByData('submission-submit').click()
      cy.getByData('submission-success').should('be.visible')
    })

    it('reports a rejection inline and keeps what was typed', () => {
      // A bad URL is refused by the API's validator, so this exercises the real
      // error path rather than a client-side guess at one.
      openCorrectionForm()
      cy.getByData('submission-note').type('Cypress: bad source url.')
      cy.getByData('submission-source-url').type('ftp://example.com/spec.pdf', { force: true })
      cy.getByData('submission-submit').click()

      cy.getByData('submission-error').should('be.visible').and('contain', 'source_url')
      // The form is still there, still filled in — retyping it all would be the
      // wrong punishment for one bad field.
      cy.getByData('submission-form').should('exist')
      cy.getByData('submission-note').should('have.value', 'Cypress: bad source url.')
    })

    it('submits a retargeted correction as a new-item tip', () => {
      openCorrectionForm()
      cy.getByData('submission-gear-type').select('grips')
      cy.getByData('submission-gear-name').clear().type('Cypress Retargeted Grip')
      cy.getByData('submission-note').type('Cypress: type changed mid-form.')
      cy.getByData('submission-submit').click()
      cy.getByData('submission-success').should('be.visible')
    })

    it('submits a new-item tip from the listing', () => {
      cy.visit(`/${SLUG}`)
      cy.getByData('suggest-new-item').click()
      cy.getByData('submission-gear-name').type('Cypress Test Webbing')
      cy.getByData('submission-note').type('Cypress: a product we do not list.')
      cy.getByData('submission-submit').click()
      cy.getByData('submission-success').should('be.visible')
    })
  })

  describe('anti-abuse', () => {
    it('hides the honeypot from a human but keeps it in the DOM', () => {
      openCorrectionForm()
      // Not `display:none` — off-canvas, so a bot checking computed style still
      // fills it. So it exists but cannot be seen.
      cy.getByData('submission-honeypot').should('exist').and('not.be.visible')
      cy.getByData('submission-honeypot').should('have.attr', 'tabindex', '-1')
    })

    it('a filled honeypot looks exactly like success and stores nothing', () => {
      openCorrectionForm()
      cy.getByData('submission-note').type('Cypress: honeypot probe.')
      // `force` is required, and is itself the assertion above working: the
      // field is genuinely not visible, so no human could fill it.
      cy.getByData('submission-honeypot')
        .invoke('val', 'http://spam.example')
        .trigger('input', { force: true })
      cy.getByData('submission-submit').click()

      // A bot must learn nothing: same panel, same well-formed id.
      cy.getByData('submission-success').should('be.visible')
      cy.getByData('submission-id')
        .invoke('text')
        .should('match', /^[0-9A-HJKMNP-TV-Z]{26}$/)
    })
  })

  describe('the catalogue stays read-only', () => {
    it('a correction does not change the item it corrects', () => {
      // The whole premise of Phase 2 in one assertion.
      cy.fetchAllItems(API).then(items => {
        const item = items[0] as { id: number; breaking_strength: number | null }
        cy.visit(`/${SLUG}/${item.id}`)
        cy.getByData('suggest-correction').click()
        cy.getByData('change-field').select('breaking_strength')
        cy.getByData('change-value').type('999')
        cy.getByData('submission-submit').click()
        cy.getByData('submission-success').should('be.visible')

        cy.request(`${Cypress.env('apiUrl')}/${API}/${item.id}`).then(({ body }) => {
          expect(body.breaking_strength).to.eq(item.breaking_strength)
        })
      })
    })
  })
})
