// Manuals & documents — the PDFs a manufacturer publishes about a product,
// shown on its detail page (DESIGN.md § Manuals & documents).
//
// Everything here runs against the real backend and the real manifest: the
// documents are curated files under public/gear-manuals/, exactly as the images
// are, so there is nothing to stub. The spec derives which product to visit
// from the manifest and the catalogue rather than hard-coding one, so adding
// the next PDF does not rewrite this file.
//
// Documents are filed by id: a product's in gear-manuals/<type>/<id>_<slug>/,
// a brand's range-wide ones in gear-manuals/<type>/brand/<catalog_id>_<slug>/.
// Items carry brand names, so brands are matched through brandIds.json.

import gearManuals from '../../src/data/gearManuals.json'
import brandManuals from '../../src/data/brandManuals.json'
import brandIds from '../../src/data/brandIds.json'

const manifest = gearManuals as Record<string, Record<string, string[]>>
const brandManifest = brandManuals as Record<string, Record<string, string[]>>
const brandIdOf = brandIds as Record<string, number>

type Item = { id: number; name: string; brand_name: string; gear_sellers?: string[] | null }

const apiPathOf = (type: string) => type.replace(/s$/, '')
const own = (type: string, item: Item) => manifest[type]?.[String(item.id)]
const rangeOf = (type: string, brand: string) => brandManifest[type]?.[String(brandIdOf[brand])]

// Every item of every gear type that holds a document, fetched once.
const catalogue: Record<string, Item[]> = {}
function loadCatalogue() {
  const types = [...new Set([...Object.keys(manifest), ...Object.keys(brandManifest)])]
  cy.wrap(types).each((type: string) => {
    cy.fetchAllItems(apiPathOf(type)).then(all => {
      catalogue[type] = all as Item[]
    })
  })
}

// The first item matching `pick`, over every type.
function first(pick: (type: string, item: Item) => boolean): [string, Item] | null {
  for (const [type, items] of Object.entries(catalogue)) {
    const item = items.find(i => pick(type, i))
    if (item) return [type, item]
  }
  return null
}

before(loadCatalogue)

describe('Manuals & documents', () => {
  // A product with documents of its own whose maker files no range-wide one
  // for its type, so the page lists the product's own documents alone.
  const pick = () => {
    const found = first((t, i) => Boolean(own(t, i)) && !rangeOf(t, i.brand_name))
    expect(found, 'a product with a manual of its own').to.not.equal(null)
    return found!
  }

  it('lists every document we hold for the product, titled from its filename', () => {
    const [type, item] = pick()
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="product-manuals"]').should('be.visible')
    cy.get('[data-cy="manual-listing"]').should('have.length', own(type, item)!.length)
    // "Product archive", not "255_aeon/product-archive.pdf".
    cy.get('[data-cy="manual-listing"]').first().should('not.contain.text', '.pdf')
  })

  it('links each document to the PDF itself, in a new tab, and serves it', () => {
    const [type, item] = pick()
    const url = `/gear-manuals/${type}/${own(type, item)![0]}`
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="manual-link"]')
      .first()
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'href', url)

    // The link is the whole feature on browsers that cannot inline a PDF, so
    // a 404 behind it is not cosmetic.
    cy.request(url).then(res => {
      expect(res.status).to.eq(200)
      expect(res.headers['content-type']).to.contain('pdf')
    })
  })

  it('embeds the first document inline, pointed at the same file', () => {
    const [type, item] = pick()
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="manual-embed"]')
      .should('exist')
      .and('have.attr', 'type', 'application/pdf')
      .and('have.attr', 'data', `/gear-manuals/${type}/${own(type, item)![0]}`)
  })

  it('keeps its documents when the product, or its maker, is renamed', () => {
    // Live editing renames products in the catalogue store; documents are found
    // by id, never by the current name.
    const [type, item] = pick()
    const rename = (row: Record<string, unknown>) =>
      row.id === item.id ? { ...row, name: `${row.name} (renamed)` } : row
    cy.intercept('GET', `${Cypress.env('apiUrl')}/${apiPathOf(type)}/**`, req => {
      req.continue(res => {
        res.body = Array.isArray(res.body) ? res.body.map(rename) : rename(res.body)
      })
    })
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="detail-name"]').should('contain', '(renamed)')
    cy.get('[data-cy="manual-listing"]').should('have.length', own(type, item)!.length)
  })

  it('shows no block at all on a product we hold no document for', () => {
    // Almost the whole catalogue. A bare "Manuals" heading with nothing under
    // it reads as a failed fetch.
    const [type] = pick()
    const item = catalogue[type].find(
      i =>
        !own(type, i) &&
        !rangeOf(type, i.brand_name) &&
        !(i.gear_sellers ?? []).some(s => rangeOf(type, s)),
    )!
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="gear-detail"]').should('exist')
    cy.get('[data-cy="product-manuals"]').should('not.exist')
  })

  it('never renders a viewer per row in the listing Detailed view', () => {
    // The block lives on GearDetailPage, not in the shared GearDetailBody —
    // one embedded PDF per visible item would be absurd.
    const [type] = pick()
    cy.visit(`/${type}`)
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-list"]').should('be.visible')
    cy.get('[data-cy="product-manuals"]').should('not.exist')
  })
})

describe('Range-wide manuals', () => {
  // One PDF for a maker's whole product line — filed once in the brand's
  // folder, not copied into every product's (DESIGN.md § Range-wide manuals).

  // A maker none of whose products of that type has a document of its own, so
  // every one of them shows the range-wide document alone. (Van Beest files a
  // PDF for every connector it makes, so its range never shows by itself.)
  const pickBare = () => {
    const found = first(
      (t, i) =>
        Boolean(rangeOf(t, i.brand_name)) &&
        !catalogue[t].some(o => o.brand_name === i.brand_name && own(t, o)),
    )
    expect(found, 'a maker with a range-wide document and none of its own').to.not.equal(null)
    return found!
  }

  it('shows the maker\'s document on a product that has none of its own', () => {
    const [type, bare] = pickBare()
    cy.visit(`/${type}/${bare.id}`)
    cy.get('[data-cy="product-manuals"]').should('be.visible')
    cy.get('[data-cy="manual-listing"]')
      .should('have.length', rangeOf(type, bare.brand_name)!.length)
      .and('have.attr', 'data-scope', 'brand')
    // The caption is what stops "User manual" reading as a claim about this
    // one product.
    cy.get('[data-cy="manual-scope"]')
      .first()
      .should('contain.text', 'Applies to all')
      .and('contain.text', bare.brand_name)
  })

  it('serves it from the brand folder, and embeds it when there is nothing else', () => {
    const [type, bare] = pickBare()
    const url = `/gear-manuals/${type}/brand/${rangeOf(type, bare.brand_name)![0]}`
    cy.visit(`/${type}/${bare.id}`)
    cy.get('[data-cy="manual-link"]').first().should('have.attr', 'href', url)
    cy.get('[data-cy="manual-embed"]').should('have.attr', 'data', url)

    cy.request(url).then(res => {
      expect(res.status).to.eq(200)
      expect(res.headers['content-type']).to.contain('pdf')
    })
  })

  it('lists the product\'s own document first, the range-wide one after', () => {
    // Order is what the inline embed reads: the specific document wins.
    const mixed = first((t, i) => Boolean(own(t, i)) && Boolean(rangeOf(t, i.brand_name)))
    if (!mixed) return // no maker with a range-wide document has one of its own yet
    const [type, item] = mixed
    cy.visit(`/${type}/${item.id}`)
    cy.get('[data-cy="manual-listing"]').should(
      'have.length',
      own(type, item)!.length + rangeOf(type, item.brand_name)!.length,
    )
    cy.get('[data-cy="manual-listing"]').first().should('have.attr', 'data-scope', 'product')
    cy.get('[data-cy="manual-listing"]').last().should('have.attr', 'data-scope', 'brand')
    cy.get('[data-cy="manual-embed"]').should(
      'have.attr',
      'data',
      `/gear-manuals/${type}/${own(type, item)![0]}`,
    )
  })

  it('leaves a product of another maker alone', () => {
    // The document is scoped to one brand and one gear type — it must not leak
    // onto the next company's page.
    const [type] = pickBare()
    const other = catalogue[type].find(
      i =>
        !rangeOf(type, i.brand_name) &&
        !own(type, i) &&
        !(i.gear_sellers ?? []).some(s => rangeOf(type, s)),
    )!
    cy.visit(`/${type}/${other.id}`)
    cy.get('[data-cy="gear-detail"]').should('exist')
    cy.get('[data-cy="product-manuals"]').should('not.exist')
  })
})

describe('A seller\'s range-wide manual', () => {
  // Aki Slacklines carried on part of the Landcruising range, and its webbing
  // manual lists those webbings beside its own — so it shows on every webbing
  // Aki sells, not only the ones it makes (config/sellerManuals.ts).
  const akiManuals = () => rangeOf('webbings', 'Aki Slacklines') ?? []

  it('shows Aki\'s webbing manual on a webbing Aki sells but did not make', () => {
    expect(akiManuals().length, 'Aki\'s webbing manual is filed').to.be.greaterThan(0)
    const sold = catalogue.webbings.find(
      i =>
        i.brand_name !== 'Aki Slacklines' &&
        (i.gear_sellers ?? []).includes('Aki Slacklines') &&
        !own('webbings', i) &&
        !rangeOf('webbings', i.brand_name),
    )!
    expect(sold, 'a webbing Aki resells with no manual of its own').to.not.equal(undefined)

    cy.visit(`/webbings/${sold.id}`)
    cy.get('[data-cy="manual-listing"]')
      .should('have.length', akiManuals().length)
      .and('have.attr', 'data-scope', 'brand')
    cy.get('[data-cy="manual-link"]')
      .first()
      .should('have.attr', 'href', `/gear-manuals/webbings/brand/${akiManuals()[0]}`)
    cy.get('[data-cy="manual-scope"]')
      .first()
      .should('contain.text', 'Applies to all webbings Aki Slacklines sells')
  })

  it('does not extend to sellers outside the opt-in list', () => {
    // Spider and Slack Inov co-list each other's range and file one PDF twice;
    // a Slack Inov webbing shows Slack Inov's manual, not Spider's as well.
    const item = catalogue.webbings.find(
      i =>
        i.brand_name === 'Slack Inov' &&
        (i.gear_sellers ?? []).includes('Spider Slacklines') &&
        !own('webbings', i),
    )
    if (!item) return // no such co-listing held
    cy.visit(`/webbings/${item.id}`)
    cy.get('[data-cy="manual-listing"]').should(
      'have.length',
      rangeOf('webbings', 'Slack Inov')!.length,
    )
  })
})
