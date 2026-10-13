// Signing in — LIVE_EDITING_PLAN.md phase 1.
//
// Locally the "sign-in" is the dev token in sessionStorage (auth/AuthContext.tsx,
// dev mode), the same one admin_triage.cy.ts uses: the real ISA hosted sign-in
// cannot be driven from CI. What this covers is what happens once someone is
// signed in — the first-sign-in notice, the account menu, the admins panel —
// and that an anonymous visitor sees none of it.
//
// The notice is shown until `notice_seen_at` is set and a name has been typed
// in (`name_set`), and the dev
// admin is one person shared by every spec, so its notice state is whatever the
// last run left. The notice tests therefore stub `GET /me`; the admins panel
// runs against the real API.

const DEV_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'

const ME = {
  sub: 'dev-admin',
  isa_id: 'ISA_DEVADMIN',
  name: 'Local Admin',
  email: 'dev-admin@localhost',
  email_verified: true,
  roles: ['admin'],
  notice_seen_at: null,
  name_set: false,
  dev: true,
}

const SEEN = { notice_seen_at: '2026-10-13T00:00:00.000Z', name_set: true }

function signedIn() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.setItem(TOKEN_KEY, DEV_TOKEN)
    },
  }
}

describe('Signing in', () => {
  describe('anonymous', () => {
    it('shows no account menu and no notice', () => {
      cy.visit('/webbings')
      cy.getByData('nav-tab').should('have.length.greaterThan', 0)
      cy.getByData('account-menu').should('not.exist')
      cy.getByData('sign-in-notice').should('not.exist')
    })

    it('does not load the sign-in library', () => {
      // D41: anonymous visitors download nothing extra. Locally the mode is
      // dev, so the library has no reason to load at all.
      cy.intercept('GET', '**/IsaSession*').as('library')
      cy.visit('/webbings')
      cy.getByData('nav-tab').should('have.length.greaterThan', 0)
      cy.get('@library.all').should('have.length', 0)
    })
  })

  describe('the first-sign-in notice', () => {
    it('is shown until it is acknowledged, and then never again', () => {
      cy.intercept('GET', '**/me', { body: ME }).as('me')
      cy.intercept('POST', '**/me/notice', {
        body: { ...ME, ...SEEN },
      }).as('notice')

      cy.visit('/webbings', signedIn())
      cy.wait('@me')
      cy.getByData('sign-in-notice')
        .should('be.visible')
        .and('contain', 'ISA_DEVADMIN')
        .and('contain', 'publicly')
      // A name the token carried is offered; the person may change it.
      cy.getByData('sign-in-notice-name').should('have.value', 'Local Admin')

      cy.getByData('sign-in-notice-ok').click()
      cy.wait('@notice').its('request.body').should('deep.equal', { name: 'Local Admin' })
      cy.getByData('sign-in-notice').should('not.exist')
    })

    it('asks for a name when the ISA account gave none', () => {
      // The ISA token carries no name for SlackData's client: the API falls
      // back to the ISA id, which must never be offered as the name.
      cy.intercept('GET', '**/me', { body: { ...ME, name: 'ISA_DEVADMIN' } })
      cy.intercept('POST', '**/me/notice', {
        body: { ...ME, ...SEEN, name: 'Ada Lovelace' },
      }).as('notice')
      cy.visit('/webbings', signedIn())
      cy.getByData('sign-in-notice-name').should('have.value', '')
      cy.getByData('sign-in-notice-ok').should('be.disabled')
      cy.getByData('sign-in-notice-name').type('  Ada Lovelace ')
      cy.getByData('sign-in-notice-ok').click()
      cy.wait('@notice').its('request.body').should('deep.equal', { name: 'Ada Lovelace' })
      cy.getByData('sign-in-notice').should('not.exist')
      cy.getByData('account-menu').should('have.text', 'AL')
    })

    it('comes back for someone who acknowledged it but gave no name', () => {
      cy.intercept('GET', '**/me', {
        body: { ...ME, name: 'ISA_DEVADMIN', notice_seen_at: '2026-10-13T00:00:00.000Z' },
      })
      cy.visit('/webbings', signedIn())
      cy.getByData('sign-in-notice').should('be.visible')
      cy.getByData('sign-in-notice-name').should('have.value', '')
    })

    it('is not shown to someone who has acknowledged it', () => {
      cy.intercept('GET', '**/me', {
        body: { ...ME, ...SEEN },
      }).as('me')
      cy.visit('/webbings', signedIn())
      cy.wait('@me')
      cy.getByData('account-menu').should('be.visible')
      cy.getByData('sign-in-notice').should('not.exist')
    })

    it('stays up if saving fails, and says so', () => {
      cy.intercept('GET', '**/me', { body: ME })
      cy.intercept('POST', '**/me/notice', { statusCode: 500, body: {} })
      cy.visit('/webbings', signedIn())
      cy.getByData('sign-in-notice-ok').click()
      cy.getByData('sign-in-notice-error').should('be.visible')
      cy.getByData('sign-in-notice').should('be.visible')
    })
  })

  describe('the account menu', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/me', {
        body: { ...ME, ...SEEN },
      })
    })

    it('names the person and links an admin to /admin', () => {
      cy.visit('/webbings', signedIn())
      cy.getByData('account-menu').should('have.text', 'LA').click()
      cy.getByData('account-name').should('have.text', 'Local Admin')
      cy.getByData('account-admin-link').click()
      cy.location('pathname').should('eq', '/admin')
    })

    it('offers no admin link to someone who is not one', () => {
      cy.intercept('GET', '**/me', {
        body: { ...ME, roles: [], ...SEEN },
      })
      cy.visit('/webbings', signedIn())
      cy.getByData('account-menu').click()
      cy.getByData('account-admin-link').should('not.exist')
    })

    it('changes the name', () => {
      cy.intercept('PATCH', '**/me/name', {
        body: { ...ME, ...SEEN, name: 'Grace Hopper' },
      }).as('rename')
      cy.visit('/webbings', signedIn())
      cy.getByData('account-menu').click()
      cy.getByData('account-change-name').click()
      cy.getByData('account-name-input').should('have.value', 'Local Admin').clear().type('Grace Hopper')
      cy.getByData('account-name-save').click()
      cy.wait('@rename').its('request.body').should('deep.equal', { name: 'Grace Hopper' })
      cy.getByData('account-name').should('have.text', 'Grace Hopper')
      cy.getByData('account-menu').should('have.text', 'GH')
    })

    it('keeps the form open if a rename fails, and says so', () => {
      cy.intercept('PATCH', '**/me/name', { statusCode: 500, body: {} })
      cy.visit('/webbings', signedIn())
      cy.getByData('account-menu').click()
      cy.getByData('account-change-name').click()
      cy.getByData('account-name-input').clear().type('Grace Hopper')
      cy.getByData('account-name-save').click()
      cy.getByData('account-name-error').should('be.visible')
      cy.getByData('account-name-form').should('be.visible')
    })

    it('signs out', () => {
      cy.visit('/webbings', signedIn())
      cy.getByData('account-menu').click()
      cy.getByData('account-signout').click()
      cy.getByData('account-menu').should('not.exist')
      cy.window().then(win => expect(win.sessionStorage.getItem(TOKEN_KEY)).to.equal(null))
    })
  })

  describe('/admin for someone who is not an admin', () => {
    it('says so, rather than showing an empty queue', () => {
      cy.intercept('GET', '**/me', {
        body: { ...ME, roles: [], ...SEEN },
      })
      cy.visit('/admin', signedIn())
      cy.getByData('admin-not-admin').should('be.visible')
      cy.getByData('admin-page').should('not.exist')
    })
  })

  describe('the admins panel (real API)', () => {
    beforeEach(() => {
      cy.request({
        method: 'POST',
        url: `${Cypress.env('apiUrl')}/me/notice`,
        headers: { Authorization: `Bearer ${DEV_TOKEN}` },
        body: { name: 'Local Admin' },
      })
      cy.visit('/admin', signedIn())
      cy.getByData('admin-page', { timeout: 10000 }).should('be.visible')
    })

    it('lists the admins', () => {
      cy.getByData('admins-row').should('contain', 'Local Admin')
    })

    it('refuses to grant to someone who has never signed in, and says why', () => {
      cy.getByData('admins-grant-email').type(`nobody-${Date.now()}@example.org`)
      cy.getByData('admins-grant').click()
      cy.getByData('admins-error').should('contain', 'sign in once')
    })
  })
})
