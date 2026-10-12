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

type Item = { id: number; name: string; brand_name: string; gear_sellers?: string[] | null }

// Mirrors imageKey() in src/utils/images.ts — manuals share the product key.
const keyFor = (brand: string, name: string) =>
  `${abbrevMap[brand] ?? slugify(brand)}_${slugify(name)}`

// A range-wide manual is filed under the maker's abbreviation, and a product
// key starts with it: `vanbeest` covers `vanbeest_bow-shackle-0-5-t`.
const coveredByRange = (type: string, productKey: string) =>
  Object.keys(brandManifest[type] ?? {}).some(b => productKey.startsWith(`${b}_`))

// The first (gear type, key) the manifest holds whose maker files no range-wide
// document for that type, so the page lists the product's own documents alone.
const [gearType, key] = (() => {
  for (const type of Object.keys(manifest)) {
    const k = Object.keys(manifest[type]).find(k => !coveredByRange(type, k))
    if (k) return [type, k]
  }
  throw new Error('no product manual outside a range-wide one')
})()
const apiPath = gearType.replace(/s$/, '')

// Mirrors brandKey() in src/utils/images.ts — a range-wide manual is filed
// under the maker's abbreviation alone, with no product part.
const brandKeyFor = (brand: string) => abbrevMap[brand] ?? slugify(brand)

const ownManualsOf = (type: string, brand: string) =>
  Object.keys(manifest[type] ?? {}).filter(k => k.startsWith(`${brand}_`))

// The first (gear type, brand abbrev) in the range-wide manifest matching `pick`.
const firstRange = (pick: (type: string, brand: string) => boolean): [string, string] | null => {
  for (const type of Object.keys(brandManifest)) {
    const brand = Object.keys(brandManifest[type]).find(b => pick(type, b))
    if (brand) return [type, brand]
  }
  return null
}

// A maker none of whose products has a document of its own, so every one of
// them shows the range-wide document alone. (Van Beest files a PDF for every
// connector it makes, so its range never shows by itself.)
const [brandType, rangeKey] = firstRange((t, b) => ownManualsOf(t, b).length === 0)!
const brandApiPath = brandType.replace(/s$/, '')
// …and a maker with both, for the ordering of the two.
const mixed = firstRange((t, b) => ownManualsOf(t, b).length > 0)

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
    if (!mixed) return // no maker with a range-wide document has one of its own yet
    const [type, brand] = mixed
    const own = ownManualsOf(type, brand)[0]

    cy.fetchAllItems(type.replace(/s$/, '')).then(all => {
      const item = (all as Row[]).find(i => keyFor(i.brand_name, i.name) === own)!
      expect(item, `the catalogue still holds ${own}`).to.not.be.undefined
      cy.visit(`/${type}/${item.id}`)
      cy.get('[data-cy="manual-listing"]').should(
        'have.length',
        manifest[type][own].length + brandManifest[type][brand].length,
      )
      cy.get('[data-cy="manual-listing"]').first().should('have.attr', 'data-scope', 'product')
      cy.get('[data-cy="manual-listing"]').last().should('have.attr', 'data-scope', 'brand')
      cy.get('[data-cy="manual-embed"]').should(
        'have.attr',
        'data',
        `/gear-manuals/${type}/${manifest[type][own][0]}`,
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
          !manifest[brandType]?.[keyFor(i.brand_name, i.name)] &&
          !(i.gear_sellers ?? []).some(s => brandManifest[brandType][brandKeyFor(s)]),
      )!
      cy.visit(`/${brandType}/${other.id}`)
      cy.get('[data-cy="gear-detail"]').should('exist')
      cy.get('[data-cy="product-manuals"]').should('not.exist')
    })
  })
})

describe('A seller\'s range-wide manual', () => {
  // Aki Slacklines carried on part of the Landcruising range, and its webbing
  // manual lists those webbings beside its own — so it shows on every webbing
  // Aki sells, not only the ones it makes (config/sellerManuals.ts).
  type Row = Item & { id: number }
  const akiManuals = brandManifest.webbings?.aki ?? []

  it('shows Aki\'s webbing manual on a webbing Aki sells but did not make', () => {
    expect(akiManuals.length, 'Aki\'s webbing manual is filed').to.be.greaterThan(0)
    cy.fetchAllItems('webbing').then(all => {
      const sold = (all as Row[]).find(
        i =>
          brandKeyFor(i.brand_name) !== 'aki' &&
          (i.gear_sellers ?? []).includes('Aki Slacklines') &&
          !manifest.webbings?.[keyFor(i.brand_name, i.name)],
      )!
      expect(sold, 'a webbing Aki resells with no manual of its own').to.not.be.undefined

      cy.visit(`/webbings/${sold.id}`)
      cy.get('[data-cy="manual-listing"]')
        .should('have.length', akiManuals.length)
        .and('have.attr', 'data-scope', 'brand')
      cy.get('[data-cy="manual-link"]')
        .first()
        .should('have.attr', 'href', `/gear-manuals/webbings/brand/${akiManuals[0]}`)
      cy.get('[data-cy="manual-scope"]')
        .first()
        .should('contain.text', 'Applies to all webbings Aki Slacklines sells')
    })
  })

  it('does not extend to sellers outside the opt-in list', () => {
    // Spider and Slack Inov co-list each other's range and file one PDF twice;
    // a Slack Inov webbing shows Slack Inov's manual, not Spider's as well.
    cy.fetchAllItems('webbing').then(all => {
      const item = (all as Row[]).find(
        i =>
          brandKeyFor(i.brand_name) === 'slackinov' &&
          (i.gear_sellers ?? []).includes('Spider Slacklines') &&
          !manifest.webbings?.[keyFor(i.brand_name, i.name)],
      )
      if (!item) return // no such co-listing held
      cy.visit(`/webbings/${item.id}`)
      cy.get('[data-cy="manual-listing"]').should(
        'have.length',
        brandManifest.webbings.slackinov.length,
      )
    })
  })
})
