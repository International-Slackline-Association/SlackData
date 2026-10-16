// Admin triage — DESIGN.md § Admin Triage.
//
// The token is the local dev token (`ADMIN_DEV_TOKEN` in slack_data/api/auth.py),
// put into sessionStorage exactly the way auth/AuthContext.tsx's dev mode reads
// it. **No real credentials here, and none needed:** hosted, that token is dead —
// auth.py refuses it whenever the ISA pool is configured or the process is
// hosted, and tests/test_auth.py asserts that.
//
// Since live editing phase 6 the public suggestion box is gone (D56), so the
// queue holds what it stored before it closed, and manufacturers' photo links
// (P5-H). This spec makes the second kind — a brand's key sends an update with
// a photo link — and checks it is handled the phase 6 way (P6-G): no JSON
// patch, a link to the item, Mark handled. The pending suggestions' half is
// pytest's (tests/test_submissions.py): nothing can create one any more.

export {}

const DEV_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const AUTH = { Authorization: `Bearer ${DEV_TOKEN}` }
const api = () => Cypress.env('apiUrl') as string

function signIn() {
  // The first-sign-in notice (account.cy.ts) would otherwise cover the page.
  // Acknowledging it is idempotent, so this is safe on every run.
  cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
  cy.window().then(win => win.sessionStorage.setItem(TOKEN_KEY, DEV_TOKEN))
}

function signOut() {
  cy.window().then(win => win.sessionStorage.removeItem(TOKEN_KEY))
}

const run = Date.now()
const BRAND = `Triage Maker ${run}`
const PHOTO = `https://example.com/triage-${run}.jpg`
let itemId: number

/** A brand, a product of theirs, a key, and one update from it with a photo
 *  link: an applied update left in the queue for its photo. */
function brandUpdateWithAPhoto() {
  cy.request({ method: 'POST', url: `${api()}/me/notice`, headers: AUTH, body: { name: 'Local Admin' } })
  cy.request({ method: 'POST', url: `${api()}/edit/brand`, headers: AUTH, body: { name: BRAND, fields: { country: 'DE' } } }).then(
    ({ body }) => {
      const catalogId = body.entry.catalog_id as number
      cy.request({
        method: 'POST',
        url: `${api()}/edit/grips`,
        headers: AUTH,
        body: { fields: { name: `Triage Grip ${run}`, brand: BRAND, material: 'Aluminum', width_min: 25 } },
      }).then(({ body: created }) => {
        itemId = Number(created.key)
        cy.request({ method: 'POST', url: `${api()}/me/brands/${catalogId}/keys`, headers: AUTH, body: {} }).then(
          ({ body: key }) => {
            cy.request({
              method: 'POST',
              url: `${api()}/manufacturer/gear`,
              headers: { Authorization: `Bearer ${key.key}` },
              body: {
                items: [
                  {
                    gear_type: 'grips',
                    gear_id: itemId,
                    name: `Triage Grip ${run}`,
                    changes: { notes: 'From the maker' },
                    image_urls: [PHOTO],
                  },
                ],
              },
            })
          },
        )
      })
    },
  )
}

function ourRow() {
  return cy.contains('[data-cy="submission-row"]', `Triage Grip ${run}`)
}

describe('Admin triage', () => {
  before(brandUpdateWithAPhoto)

  describe('when logged out', () => {
    it('shows a sign-in prompt, not a 404', () => {
      cy.visit('/admin')
      signOut()
      cy.reload()
      cy.getByData('admin-login').should('be.visible')
      cy.getByData('admin-page').should('not.exist')
      // /admin is a static route and must outrank the :slug gear-type pattern.
      cy.getByData('not-found').should('not.exist')
    })

    it('does not render the queue', () => {
      cy.visit('/admin')
      signOut()
      cy.reload()
      cy.getByData('submission-row').should('not.exist')
    })
  })

  describe('when signed in', () => {
    beforeEach(() => {
      cy.visit('/admin')
      signIn()
      cy.reload()
      cy.getByData('admin-page', { timeout: 10000 }).should('be.visible')
    })

    it('says plainly that this is the local dev token, not a real login', () => {
      cy.getByData('admin-dev-mode').should('be.visible')
    })

    it('shows only what is waiting, with no status filter, no Approve and no JSON patch', () => {
      cy.getByData('admin-status-filter').should('not.exist')
      ourRow().within(() => {
        cy.getByData('applied-live').should('be.visible')
        cy.getByData('submission-row-image').should('contain', `triage-${run}.jpg`)
        cy.getByData('photo-upload-note').should('be.visible')
        cy.getByData('open-item').should('have.attr', 'href', `/grips/${itemId}`)
      })
      cy.get('[data-cy="approve"], [data-cy="approved-patch"]').should('not.exist')
    })

    it('marking it handled takes it off the queue, for good', () => {
      ourRow().within(() => {
        cy.getByData('review-note').type('photo uploaded')
        cy.getByData('mark-handled').click()
      })
      ourRow().should('not.exist')
      cy.reload()
      cy.getByData('admin-page').should('be.visible')
      ourRow().should('not.exist')
    })

    it('signing out returns to the prompt', () => {
      cy.getByData('admin-signout').click()
      cy.getByData('admin-login').should('be.visible')
    })
  })

  describe('a bad token', () => {
    it('the API refuses it, and the error is shown', () => {
      // The distinction the page is built around: a token in the browser only
      // asks. Authority is the server's — `GET /me` answers 401, so there is no
      // signed-in person and the queue never loads.
      cy.visit('/admin')
      cy.window().then(win => win.sessionStorage.setItem(TOKEN_KEY, 'not-the-token'))
      cy.reload()
      cy.getByData('admin-login-error', { timeout: 10000 }).should('contain', '401')
      cy.getByData('submission-row').should('not.exist')
    })
  })
})
