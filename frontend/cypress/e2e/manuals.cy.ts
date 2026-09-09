// Manuals & documents — the PDFs a manufacturer publishes about a product,
// shown on its detail page (DESIGN.md § Manuals & documents).
//
// Everything here runs against the real backend and the real manifest: the
// documents are curated files under public/gear-manuals/, exactly as the images
// are, so there is nothing to stub. The spec derives which product to visit
// from the manifest rather than hard-coding one, so adding the second PDF the
// catalogue ever gets does not rewrite this file.

import gearManuals from '../../src/data/gearManuals.json'
import brandManuals from '../../src/data/brandManuals.json'
import brandAbbrev from '../../src/data/brandAbbrev.json'
import { slugify } from '../../src/utils/slugify'

const manifest = gearManuals as Record<string, Record<string, string[]>>
const brandManifest = brandManuals as Record<string, Record<string, string[]>>
const abbrevMap = brandAbbrev as Record<string, string>

type Item = { id: number; name: string; brand_name: string }

// Mirrors imageKey() in src/utils/images.ts — manuals share the product key.
const keyFor = (brand: string, name: string) =>
  `${abbrevMap[brand] ?? slugify(brand)}_${slugify(name)}`

// The first (gear type, key) the manifest holds, as an API path + key pair.
const [gearType, key] = (() => {
  const type = Object.keys(manifest).find(t => Object.keys(manifest[t]).length > 0)!
  return [type, Object.keys(manifest[type])[0]]
})()
const apiPath = gearType.replace(/s$/, '')

// Mirrors brandKey() in src/utils/images.ts — a range-wide manual is filed
// under the maker's abbreviation alone, with no product part.
const brandKeyFor = (brand: string) => abbrevMap[brand] ?? slugify(brand)

// The first (gear type, brand abbrev) the range-wide manifest holds.
const [brandType, rangeKey] = (() => {
  const type = Object.keys(brandManifest).find(t => Object.keys(brandManifest[t]).length > 0)!
  return [type, Object.keys(brandManifest[type])[0]]
})()
const brandApiPath = brandType.replace(/s$/, '')

describe('Manuals & documents', () => {
  it('lists every document we hold for the product, titled from its filename', () => {
    cy.fetchAllItems(apiPath).then(all => {
      const item = (all as Item[]).find(i => keyFor(i.brand_name, i.name) === key)
      expect(item, `the catalogue still holds ${key}`).to.not.be.undefined

      cy.visit(`/${gearType}/${item!.id}`)
      cy.get('[data-cy="product-manuals"]').should('be.visible')
      cy.get('[data-cy="manual-listing"]').should('have.length', manifest[gearType][key].length)
      // "Product archive", not "landcruise_aeon-product-archive.pdf".
      cy.get('[data-cy="manual-listing"]').first().should('not.contain.text', '.pdf')
    })
  })

  it('links each document to the PDF itself, in a new tab, and serves it', () => {
    cy.fetchAllItems(apiPath).then(all => {
      const item = (all as Item[]).find(i => keyFor(i.brand_name, i.name) === key)!
      const file = manifest[gearType][key][0]

      cy.visit(`/${gearType}/${item.id}`)
      cy.get('[data-cy="manual-link"]')
        .first()
        .should('have.attr', 'target', '_blank')
        .and('have.attr', 'href', `/gear-manuals/${gearType}/${file}`)

      // The link is the whole feature on browsers that cannot inline a PDF, so
      // a 404 behind it is not cosmetic.
      cy.request(`/gear-manuals/${gearType}/${file}`).then(res => {
        expect(res.status).to.eq(200)
        expect(res.headers['content-type']).to.contain('pdf')
      })
    })
  })

  it('embeds the first document inline, pointed at the same file', () => {
    cy.fetchAllItems(apiPath).then(all => {
      const item = (all as Item[]).find(i => keyFor(i.brand_name, i.name) === key)!
      cy.visit(`/${gearType}/${item.id}`)
      cy.get('[data-cy="manual-embed"]')
        .should('exist')
        .and('have.attr', 'type', 'application/pdf')
        .and('have.attr', 'data', `/gear-manuals/${gearType}/${manifest[gearType][key][0]}`)
    })
  })

  it('shows no block at all on a product we hold no document for', () => {
    // Almost the whole catalogue. A bare "Manuals" heading with nothing under
    // it reads as a failed fetch.
    cy.fetchAllItems(apiPath).then(all => {
      const item = (all as Item[]).find(i => !manifest[gearType][keyFor(i.brand_name, i.name)])!
      cy.visit(`/${gearType}/${item.id}`)
      cy.get('[data-cy="gear-detail"]').should('exist')
      cy.get('[data-cy="product-manuals"]').should('not.exist')
    })
  })

  it('never renders a viewer per row in the listing Detailed view', () => {
    // The block lives on GearDetailPage, not in the shared GearDetailBody —
    // one embedded PDF per visible item would be absurd.
    cy.visit(`/${gearType}`)
    cy.get('[data-cy="view-detailed"]').click()
    cy.get('[data-cy="gear-detailed-list"]').should('be.visible')
    cy.get('[data-cy="product-manuals"]').should('not.exist')
  })
})

describe('Range-wide manuals', () => {
  // One PDF for a maker's whole product line — filed once under the brand, not
  // copied onto every product key (DESIGN.md § Range-wide manuals).
  type Row = Item & { id: number }

  const withBrandManual = (all: Row[]) =>
    all.filter(i => brandKeyFor(i.brand_name) === rangeKey)

  it('shows the maker\'s document on a product that has none of its own', () => {
    cy.fetchAllItems(brandApiPath).then(all => {
      const rows = withBrandManual(all as Row[])
      expect(rows.length, `the catalogue still holds ${rangeKey} ${brandType}`).to.be.greaterThan(0)
      const bare = rows.find(i => !manifest[brandType]?.[keyFor(i.brand_name, i.name)])!
      expect(bare, 'a product of theirs with no manual of its own').to.not.be.undefined

      cy.visit(`/${brandType}/${bare.id}`)
      cy.get('[data-cy="product-manuals"]').should('be.visible')
      cy.get('[data-cy="manual-listing"]')
        .should('have.length', brandManifest[brandType][rangeKey].length)
        .and('have.attr', 'data-scope', 'brand')
      // The caption is what stops "User manual" reading as a claim about this
      // one product.
      cy.get('[data-cy="manual-scope"]')
        .first()
        .should('contain.text', 'Applies to all')
        .and('contain.text', bare.brand_name)
    })
  })

  it('serves it from the brand folder, and embeds it when there is nothing else', () => {
    cy.fetchAllItems(brandApiPath).then(all => {
      const rows = withBrandManual(all as Row[])
      const bare = rows.find(i => !manifest[brandType]?.[keyFor(i.brand_name, i.name)])!
      const file = brandManifest[brandType][rangeKey][0]
      const url = `/gear-manuals/${brandType}/brand/${file}`

      cy.visit(`/${brandType}/${bare.id}`)
      cy.get('[data-cy="manual-link"]').first().should('have.attr', 'href', url)
      cy.get('[data-cy="manual-embed"]').should('have.attr', 'data', url)

      cy.request(url).then(res => {
        expect(res.status).to.eq(200)
        expect(res.headers['content-type']).to.contain('pdf')
      })
    })
  })

  it('lists the product\'s own document first, the range-wide one after', () => {
    // Order is what the inline embed reads: the specific document wins.
    const own = Object.keys(manifest[brandType] ?? {}).find(k => k.startsWith(`${rangeKey}_`))
    if (!own) return // no product of this maker has its own PDF yet

    cy.fetchAllItems(brandApiPath).then(all => {
      const item = (all as Row[]).find(i => keyFor(i.brand_name, i.name) === own)!
      cy.visit(`/${brandType}/${item.id}`)
      cy.get('[data-cy="manual-listing"]').should(
        'have.length',
        manifest[brandType][own].length + brandManifest[brandType][rangeKey].length,
      )
      cy.get('[data-cy="manual-listing"]').first().should('have.attr', 'data-scope', 'product')
      cy.get('[data-cy="manual-listing"]').last().should('have.attr', 'data-scope', 'brand')
      cy.get('[data-cy="manual-embed"]').should(
        'have.attr',
        'data',
        `/gear-manuals/${brandType}/${manifest[brandType][own][0]}`,
      )
    })
  })

  it('leaves a product of another maker alone', () => {
    // The document is scoped to one brand and one gear type — it must not leak
    // onto the next company's page.
    cy.fetchAllItems(brandApiPath).then(all => {
      const other = (all as Row[]).find(
        i =>
          !brandManifest[brandType][brandKeyFor(i.brand_name)] &&
          !manifest[brandType]?.[keyFor(i.brand_name, i.name)],
      )!
      cy.visit(`/${brandType}/${other.id}`)
      cy.get('[data-cy="gear-detail"]').should('exist')
      cy.get('[data-cy="product-manuals"]').should('not.exist')
    })
  })
})
