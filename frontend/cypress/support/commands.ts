// Custom Cypress commands
export {}

Cypress.Commands.add('getByData', (selector: string) => {
  return cy.get(`[data-cy="${selector}"]`)
})

// Fetch all pages from a paginated API endpoint and return the full item list.
// The backend caps limit at 100, so we page until we have everything.
Cypress.Commands.add('fetchAllItems', (apiPath: string) => {
  const apiUrl = Cypress.env('apiUrl')
  const results: unknown[] = []

  function fetchPage(offset: number): Cypress.Chainable<unknown[]> {
    return cy
      .request(`${apiUrl}/${apiPath}/?limit=100&offset=${offset}`)
      .then(({ body }: { body: unknown[] }) => {
        results.push(...body)
        if (body.length === 100) {
          return fetchPage(offset + 100) as unknown as unknown[]
        }
        return results
      })
  }

  return fetchPage(0)
})

declare global {
  namespace Cypress {
    interface Chainable {
      getByData(selector: string): Chainable<JQuery<HTMLElement>>
      fetchAllItems(apiPath: string): Chainable<unknown[]>
    }
  }
}
