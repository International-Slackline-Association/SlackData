import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    env: {
      apiUrl: 'http://localhost:8000',
    },
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1440,
    viewportHeight: 900,
    // 5 s is enough for localhost SQLite + FastAPI + React render.
    // The default 4 s is fine for most tests; 5 s gives a small buffer for
    // the fetchAllItems multi-page calls and large card lists (109 weblocks).
    defaultCommandTimeout: 5000,
    // The top nav is `sticky top-0` (TopNav.tsx), and Cypress's default
    // pre-click scroll parks the target at the very TOP of the viewport —
    // i.e. underneath it. Every click below the fold then fails "covered by
    // another element", which no real user ever hits: a real click does no
    // scrolling at all. Centring the target instead keeps it clear of the
    // header, and of any sticky footer chrome on the mobile viewports.
    scrollBehavior: 'center',
  },
})
