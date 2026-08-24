// Admin triage — DESIGN.md § Admin Triage.
//
// The token is the local dev token (`ADMIN_DEV_TOKEN` in slack_data/api/auth.py),
// put into sessionStorage exactly the way AdminAuthProvider's dev mode reads it.
// **No real credentials here, and none needed:** hosted, that token is dead —
// auth.py stops accepting it the moment a Cognito pool is configured, and
// tests/test_auth.py asserts that. So this drives the page without giving the
// suite anything worth stealing.
//
// What these tests are for: that the page is a QUEUE (oldest first), that it is
// closed when logged out, and that approving says — visibly — that nothing has
// gone live. The server-side half of the auth story is pytest's job; a UI test
// cannot prove an endpoint is guarded.

const DEV_TOKEN = 'dev-admin-token'
const TOKEN_KEY = 'slackdata_admin_token'
const SLUG = 'webbings'
const API = 'webbing'

function signIn() {
  cy.window().then(win => win.sessionStorage.setItem(TOKEN_KEY, DEV_TOKEN))
}

function signOut() {
  cy.window().then(win => win.sessionStorage.removeItem(TOKEN_KEY))
}

/** Post a correction straight to the API, so a queue exists to triage. */
function submitCorrection(note: string) {
  return cy.fetchAllItems(API).then(items => {
    const id = (items[0] as { id: number }).id
    return cy
      .request('POST', `${Cypress.env('apiUrl')}/submissions/`, {
        kind: 'correction',
        gear_type: SLUG,
        gear_id: id,
        gear_name: 'Cypress Fixture',
        changes: { breaking_strength: '31' },
        note,
      })
      .then(({ body }) => body.submission_id as string)
  })
}

// The triage list is a QUEUE: oldest first, one page of 50. These specs create
// their own fixtures, which therefore land at the BOTTOM — so they are only
// visible while the pending queue is shorter than a page.
//
// That is not a flaw in the page, it is what a queue means. It does mean this
// spec needs a store it hasn't already filled: run the API with a scratch
// submissions database, e.g.
//
//   SUBMISSIONS_DB_PATH=/tmp/cypress-submissions.db fastapi dev main.py
//
// Without it, a few repeat runs push the queue past 50 and these tests start
// failing for a reason that has nothing to do with the code. The guard below
// makes that diagnosis immediate instead of mysterious.
const PAGE_SIZE = 50

describe('Admin triage', () => {
  before(() => {
    cy.request({
      url: `${Cypress.env('apiUrl')}/submissions/?status=pending&limit=100`,
      headers: { Authorization: `Bearer ${DEV_TOKEN}` },
    }).then(({ body }) => {
      expect(
        (body as unknown[]).length,
        `the pending queue already holds ${(body as unknown[]).length} submissions, so fixtures ` +
          'created by this spec fall off the end of the first page. Restart the API with ' +
          'SUBMISSIONS_DB_PATH pointing at a scratch file (see the note at the top of this spec).',
      ).to.be.lessThan(PAGE_SIZE)
    })
  })

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

    it('lists pending submissions oldest first', () => {
      const first = `Cypress queue A ${Date.now()}`
      const second = `Cypress queue B ${Date.now()}`

      submitCorrection(first)
      submitCorrection(second)

      cy.reload()
      cy.getByData('submission-row').should('have.length.at.least', 2)

      // Whatever else is in the queue, A must come before B.
      cy.get('[data-cy="submission-row"]').then(rows => {
        const text = [...rows].map(r => r.innerText)
        const a = text.findIndex(t => t.includes(first))
        const b = text.findIndex(t => t.includes(second))
        expect(a, 'the earlier submission is listed').to.be.gte(0)
        expect(b, 'the later submission is listed').to.be.gte(0)
        expect(a, 'oldest first').to.be.lessThan(b)
      })
    })

    it('shows the proposed change and the note', () => {
      const note = `Cypress detail ${Date.now()}`
      submitCorrection(note)
      cy.reload()

      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="change-entry"][data-field="breaking_strength"]').should('contain', '31')
        cy.get('[data-cy="submission-row-note"]').should('contain', note)
      })
    })

    it('approving hands over a JSON patch and says it is not live', () => {
      const note = `Cypress approve ${Date.now()}`
      submitCorrection(note)
      cy.reload()

      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="approve"]').click()
        // The screen's whole reason for existing: approve is not apply.
        cy.get('[data-cy="approved-patch"]').should('be.visible').and('contain', 'breaking_strength')
      })
      cy.contains('Approved — but not live').should('be.visible')
    })

    it('an approved submission leaves the pending queue and appears under Approved', () => {
      const note = `Cypress moves ${Date.now()}`
      submitCorrection(note)
      cy.reload()

      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="approve"]').click()
        cy.get('[data-cy="patch-done"]').click()
      })

      cy.getByData('submission-row').should('not.contain', note)
      cy.get('[data-cy="admin-status-filter"][data-status="approved"]').click()
      cy.contains('[data-cy="submission-row"]', note).should('exist')
    })

    it('surfaces the count of approved work still waiting to be applied', () => {
      // The number nothing else shows: agreed to, but not yet on the site.
      const note = `Cypress outstanding ${Date.now()}`
      submitCorrection(note)
      cy.reload()
      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="approve"]').click()
        cy.get('[data-cy="patch-done"]').click()
      })
      cy.getByData('admin-outstanding').should('be.visible').and('contain', 'waiting to be applied')
      // ...and it is a shortcut into that bucket.
      cy.getByData('admin-outstanding').click()
      cy.get('[data-cy="admin-status-filter"][data-status="approved"]')
        .should('have.attr', 'aria-pressed', 'true')
    })

    it('an approved row still offers the patch and a way to close it out', () => {
      const note = `Cypress reopen ${Date.now()}`
      submitCorrection(note)
      cy.reload()
      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="approve"]').click()
        cy.get('[data-cy="patch-done"]').click()
      })

      cy.get('[data-cy="admin-status-filter"][data-status="approved"]').click()
      cy.contains('[data-cy="submission-row"]', note).within(() => {
        // Coming back to it later must not lose the patch.
        cy.get('[data-cy="approved-patch"]').should('be.visible')
        cy.get('[data-cy="mark-handled"]').should('be.visible')
      })
    })

    it('marking handled moves it to Applied and records the commit', () => {
      const note = `Cypress handled ${Date.now()}`
      submitCorrection(note)
      cy.reload()
      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="approve"]').click()
        cy.get('[data-cy="applied-sha"]').type('a1b2c3d')
        cy.get('[data-cy="mark-handled"]').click()
      })

      cy.get('[data-cy="admin-status-filter"][data-status="approved"]').click()
      cy.getByData('submission-row').should('not.contain', note)

      cy.get('[data-cy="admin-status-filter"][data-status="applied"]').click()
      cy.contains('[data-cy="submission-row"]', note).should('exist')
    })

    it('an approved submission is never allowed to expire', () => {
      // The TTL rule, checked through the API: unfinished work must not be
      // swept away twelve months later with the wrong value still on the site.
      const note = `Cypress ttl ${Date.now()}`
      submitCorrection(note).then(id => {
        cy.request({
          method: 'PATCH',
          url: `${Cypress.env('apiUrl')}/submissions/${id}`,
          headers: { Authorization: `Bearer ${DEV_TOKEN}` },
          body: { status: 'approved' },
        }).then(({ body }) => {
          expect(body.expires_at, 'approved records must not expire').to.eq(null)
        })
        cy.request({
          method: 'PATCH',
          url: `${Cypress.env('apiUrl')}/submissions/${id}`,
          headers: { Authorization: `Bearer ${DEV_TOKEN}` },
          body: { status: 'applied' },
        }).then(({ body }) => {
          expect(body.expires_at, 'once applied, the clock restarts').to.be.greaterThan(0)
        })
      })
    })

    it('rejecting removes it from the queue with no patch', () => {
      const note = `Cypress reject ${Date.now()}`
      submitCorrection(note)
      cy.reload()

      cy.contains('[data-cy="submission-row"]', note).within(() => {
        cy.get('[data-cy="reject"]').click()
      })
      cy.getByData('submission-row').should('not.contain', note)
      cy.getByData('approved-patch').should('not.exist')

      cy.get('[data-cy="admin-status-filter"][data-status="rejected"]').click()
      cy.contains('[data-cy="submission-row"]', note).should('exist')
    })

    it('approving does not change the catalogue', () => {
      // Same premise as the public spec, from the other end.
      cy.fetchAllItems(API).then(items => {
        const item = items[0] as { id: number; breaking_strength: number | null }
        const note = `Cypress readonly ${Date.now()}`

        submitCorrection(note)
        cy.reload()
        cy.contains('[data-cy="submission-row"]', note).within(() => {
          cy.get('[data-cy="approve"]').click()
          cy.get('[data-cy="approved-patch"]').should('exist')
        })

        cy.request(`${Cypress.env('apiUrl')}/${API}/${item.id}`).then(({ body }) => {
          expect(body.breaking_strength).to.eq(item.breaking_strength)
        })
      })
    })

    it('signing out returns to the prompt', () => {
      cy.getByData('admin-signout').click()
      cy.getByData('admin-login').should('be.visible')
    })
  })

  describe('a bad token', () => {
    it('renders the page but the API refuses, and the error is shown', () => {
      // The distinction the page is built around: signing in here only makes the
      // page render. Authority is the server's.
      cy.visit('/admin')
      cy.window().then(win => win.sessionStorage.setItem(TOKEN_KEY, 'not-the-token'))
      cy.reload()
      cy.getByData('admin-error', { timeout: 10000 }).should('contain', '401')
      cy.getByData('submission-row').should('not.exist')
    })
  })
})
