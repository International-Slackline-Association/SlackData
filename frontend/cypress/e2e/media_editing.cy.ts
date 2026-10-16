// Photos and manuals for admins — live editing phase 4 (LIVE_EDITING_PHASE_4.md).
//
// The whole path, against the real API in store mode with a filesystem media
// store (MEDIA_DIR, as CI starts it): the browser resizes the photo, asks for
// upload forms, posts each file to its form, and saves the list; the next page
// shows it, served from /media. Every test works on an item or brand it created
// itself, so no other spec's photos move.

const DEV_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${DEV_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

// Two different 1x1 PNGs: real images, so the browser can decode and resize them.
const RED = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const DOT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PDF = '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'

function png(base64: string, fileName: string) {
  return { contents: Cypress.Buffer.from(base64, 'base64'), fileName, mimeType: 'image/png' }
}

function signedIn() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, DEV_TOKEN)
    },
  }
}

const unique = (label: string) => `${label} ${Date.now()}`

function newGrip(name: string) {
  return cy
    .request({
      method: 'POST',
      url: `${api()}/edit/grips`,
      headers: AUTH,
      body: { fields: { name, brand: 'Gibbon', material: 'Aluminum', width_min: 25 } },
    })
    .then(response => Number(response.body.key))
}

function openMedia(id: number) {
  cy.visit(`/grips/${id}`, signedIn())
  cy.getByData('item-media').click()
  cy.getByData('media-form').should('have.attr', 'data-loaded', 'true')
}

function save() {
  cy.getByData('dialog-confirm').click()
  cy.getByData('media-dialog').should('not.exist')
}

describe('Photos and manuals', () => {
  before(() => {
    // The first-sign-in notice would cover the page (account.cy.ts).
    cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
  })

  it('adds a photo: resized in the browser, served from /media, logged', () => {
    newGrip(unique('Photo Grip')).then(id => {
      openMedia(id)
      cy.getByData('media-add-photos').selectFile(png(RED, 'red.png'), { force: true })
      cy.getByData('media-photo').should('have.length', 1).and('have.attr', 'data-new', 'true')
      cy.getByData('dialog-why').type("the maker's photo")
      save()

      cy.getByData('detail-img').should('have.attr', 'src').and('include', `/media/grips/${id}/`)
      cy.getByData('detail-img').should('have.attr', 'data-size', 'large')
      cy.getByData('change-media').first().should('have.attr', 'data-field', 'photos').and('contain', 'added 1 photo')

      // Re-encoded to WebP before it left the browser (Electron's Chromium can).
      cy.request(`${api()}/media/manifest`).then(({ body }) => {
        const [photo] = body.photos.grips[String(id)]
        expect(photo.small).to.match(/-480\.webp$/)
        expect(photo.large).to.match(/-1600\.webp$/)
        cy.request(`${body.base}/${photo.large}`).its('headers').its('content-type').should('eq', 'image/webp')
      })
    })
  })

  it('reorders and removes photos as one list', () => {
    newGrip(unique('Two Photo Grip')).then(id => {
      openMedia(id)
      cy.getByData('media-add-photos').selectFile([png(RED, 'red.png'), png(DOT, 'dot.png')], { force: true })
      save()
      cy.request(`${api()}/media/manifest`).then(({ body }) => {
        const [first, second] = body.photos.grips[String(id)]

        openMedia(id)
        cy.getByData('media-photo-later').first().click()
        save()
        cy.getByData('change-media').first().should('contain', 'reordered')
        cy.request(`${api()}/media/manifest`).its('body.photos.grips').its(String(id)).should('deep.equal', [second, first])

        openMedia(id)
        cy.getByData('media-photo-remove').first().click()
        cy.getByData('media-photo').should('have.length', 1)
        save()
        cy.getByData('change-media').first().should('contain', 'removed 1 photo')
        cy.request(`${api()}/media/manifest`).its('body.photos.grips').its(String(id)).should('deep.equal', [first])
        // Nothing is deleted: the photo taken off is still served.
        cy.request(`${body.base}/${second.large}`).its('status').should('eq', 200)
      })
    })
  })

  it('adds a manual with the title typed for it', () => {
    newGrip(unique('Manual Grip')).then(id => {
      openMedia(id)
      cy.getByData('media-add-manuals').selectFile(
        { contents: Cypress.Buffer.from(PDF), fileName: 'user-manual.pdf', mimeType: 'application/pdf' },
        { force: true },
      )
      cy.getByData('media-manual-title').should('have.value', 'User manual').clear().type('User manual (EN)')
      save()
      cy.getByData('product-manuals').should('be.visible')
      cy.getByData('manual-listing').should('have.length', 1).and('contain', 'User manual (EN)')
      cy.getByData('change-media').first().should('have.attr', 'data-field', 'manuals').and('contain', 'User manual (EN)')
    })
  })

  it('refuses a file that is not a photo before anything is uploaded', () => {
    newGrip(unique('Refusing Grip')).then(id => {
      openMedia(id)
      cy.getByData('media-add-photos').selectFile(
        { contents: Cypress.Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), fileName: 'x.svg', mimeType: 'image/svg+xml' },
        { force: true },
      )
      cy.getByData('dialog-error').should('contain', 'JPEG, PNG or WebP')
      cy.getByData('media-photo').should('not.exist')
    })
  })

  it('shows the small photo on a card first, then the large one', () => {
    newGrip(unique('Card Photo Grip')).then(id => {
      openMedia(id)
      cy.getByData('media-add-photos').selectFile(png(DOT, 'dot.png'), { force: true })
      save()
      cy.visit('/grips')
      cy.get(`[data-cy="gear-card"]:has([data-cy="gear-card-name"][href="/grips/${id}"])`)
        .find('[data-cy="gear-card-img"]')
        .scrollIntoView()
        .should('have.attr', 'data-size', 'large')
        .and('have.attr', 'src')
        .and('match', /-1600\.webp$/)
    })
  })

  it("sets a brand's logo", () => {
    const name = unique('Logo Brand')
    cy.request({ method: 'POST', url: `${api()}/edit/brand`, headers: AUTH, body: { name, fields: { country: 'DE' } } }).then(
      ({ body }) => {
        const catalogId = body.entry.catalog_id
        // A brand has a page once it has a product.
        cy.request({
          method: 'POST',
          url: `${api()}/edit/grips`,
          headers: AUTH,
          body: { fields: { name: unique('Logo Brand Grip'), brand: name, material: 'Aluminum', width_min: 25 } },
        })
        cy.visit(`/manufacturers/${catalogId}`, signedIn())
        cy.getByData('brand-media').click()
        cy.getByData('media-form').should('have.attr', 'data-loaded', 'true')
        cy.getByData('brand-media-add-logo').selectFile(png(RED, 'logo.png'), { force: true })
        cy.getByData('brand-media-logo').should('be.visible')
        cy.getByData('dialog-confirm').click()
        cy.getByData('brand-media-dialog').should('not.exist')
        cy.request(`${api()}/media/manifest`).its('body.logos').its(name).should('match', new RegExp(`^brands/${catalogId}/logo-`))
      },
    )
  })
})
