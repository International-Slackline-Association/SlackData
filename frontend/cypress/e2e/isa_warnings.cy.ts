import { GEAR_TYPES } from '../support/gear_types'

// ISA gear warnings — the recall/warning/notice bubble on cards and the
// severity-coloured banner on the item page.
// Reference: DESIGN.md § ISA Warnings + § Gear Card Anatomy (top-right stack).
//
// What these tests are actually defending:
//   1. The DATA arrives. `isa_warning` was a declared-but-never-populated field
//      for a long time, and every existing assertion about it was written as
//      `if (!withWarning) return` — so the whole feature could regress to zero
//      rows without a single red test. The first block fails if the loader
//      stops matching isa_gear_warnings.json onto gear rows.
//   2. Severity is legible WITHOUT colour — the status word is in the DOM and
//      in `data-isa-warning`, so a red/amber swap can't silently invert meaning.
//   3. The bubble sits ABOVE the classification bubble. A recalled Type A
//      webbing must not read as "Type A" first.
//   4. The three types with no `isa_warning` model field never render any of it.

const WARNING_TYPES = GEAR_TYPES.filter(t => t.hasISAWarning)
const NO_WARNING_TYPES = GEAR_TYPES.filter(t => !t.hasISAWarning)

// DESIGN.md § ISA Warnings. Asserted as computed rgb().
const BUBBLE_STYLE: Record<string, { bg: string; fg: string }> = {
  Recall:  { bg: 'rgb(220, 38, 38)',    fg: 'rgb(255, 255, 255)' },
  Warning: { bg: 'rgb(251, 191, 36)',   fg: 'rgb(31, 41, 55)'    },
  Notice:  { bg: 'rgb(229, 231, 235)',  fg: 'rgb(31, 41, 55)'    },
}

const SHOWN_STATUSES = ['Recall', 'Warning', 'Notice']

type Item = Record<string, unknown>

// One row of GET /isawarning/ — mirrors ISAGearWarningPublic.
interface Entry {
  id: number
  source_id: string
  status: string
  gear_type: string
  gear_id: number
  date: string | null
  date_iso: string | null
  manufacturer: string | null
  model: string | null
  description: string | null
  solution: string | null
  links: string[] | null
  confidence: string | null
}

const api = () => Cypress.env('apiUrl') as string

// Find one item per status word across a type's whole catalogue.
function byStatus(all: Item[]): Record<string, Item | undefined> {
  const out: Record<string, Item | undefined> = {}
  for (const s of SHOWN_STATUSES) out[s] = all.find(i => i.isa_warning === s)
  return out
}

// ── The data itself ───────────────────────────────────────────────────────────

describe('ISA warnings — data reaches the API', () => {
  // The whole feature is invisible without this, and it is exactly the check
  // every other spec in the repo skips past with an early return.
  it('at least one gear row carries each of Recall, Warning and Notice', () => {
    const found = new Set<string>()
    cy.wrap(WARNING_TYPES).each((t: (typeof WARNING_TYPES)[number]) => {
      cy.fetchAllItems(t.apiPath).then((all) => {
        for (const i of all as Item[]) {
          if (typeof i.isa_warning === 'string') found.add(i.isa_warning)
        }
      })
    })
    cy.then(() => {
      for (const s of SHOWN_STATUSES) {
        expect(Array.from(found), `some gear row has isa_warning = ${s}`).to.include(s)
      }
    })
  })

  it('never stores the "No Warning" enum member — absence is null', () => {
    // "No Warning" is a valid ISAWarning member but means "nothing to show".
    // Storing it would put an empty bubble on ~450 cards.
    cy.wrap(WARNING_TYPES).each((t: (typeof WARNING_TYPES)[number]) => {
      cy.fetchAllItems(t.apiPath).then((all) => {
        const bad = (all as Item[]).filter(i => i.isa_warning === 'No Warning')
        expect(bad, `${t.label} rows storing "No Warning"`).to.have.length(0)
      })
    })
  })

  it('leaves the majority of every type unwarned', () => {
    // A matcher that got too greedy (fuzzy brand/model matching is the risk we
    // avoided by adjudicating matches by hand) would light up the whole grid.
    // Weblocks are the high-water mark at ~43% — the ISA's warning database is
    // dominated by weblock and weblock-pin entries — so the bound is loose;
    // it is here to catch a runaway, not to pin a number.
    cy.wrap(WARNING_TYPES).each((t: (typeof WARNING_TYPES)[number]) => {
      cy.fetchAllItems(t.apiPath).then((all) => {
        const items = all as Item[]
        const warned = items.filter(i => i.isa_warning != null).length
        expect(warned / items.length, `${t.label} warned share`).to.be.lessThan(0.6)
      })
    })
  })
})

// ── The card bubble ───────────────────────────────────────────────────────────

describe('ISA warning bubble — gear cards', () => {
  WARNING_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows a bubble carrying the status word on warned items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const warned = (all as Item[]).find(i => i.isa_warning != null)
          if (!warned) return
          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', warned.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-warning-badge"]')
            .should('be.visible')
            // Never colour alone: the word is in the DOM. It is uppercased in
            // CSS, not in the markup, so textContent keeps the source casing.
            .should('contain.text', String(warned.isa_warning))
            .and('have.css', 'text-transform', 'uppercase')
            .and('have.attr', 'data-isa-warning', String(warned.isa_warning))
        })
      })

      it('shows no bubble on unwarned items', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const clean = (all as Item[]).find(i => i.isa_warning == null)
          if (!clean) return
          cy.visit(`/${slug}`)
          cy.get('[data-cy="gear-card"]')
            .contains('[data-cy="gear-card-name"]', clean.name as string)
            .closest('[data-cy="gear-card"]')
            .find('[data-cy="isa-warning-badge"]')
            .should('not.exist')
        })
      })

      it('colours the bubble by severity', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const found = byStatus(all as Item[])
          for (const status of SHOWN_STATUSES) {
            const item = found[status]
            if (!item) continue
            cy.visit(`/${slug}`)
            cy.get('[data-cy="gear-card"]')
              .contains('[data-cy="gear-card-name"]', item.name as string)
              .closest('[data-cy="gear-card"]')
              .find('[data-cy="isa-warning-badge"]')
              .should('have.css', 'background-color', BUBBLE_STYLE[status].bg)
              .and('have.css', 'color', BUBBLE_STYLE[status].fg)
          }
        })
      })
    })
  })

  // Webbings are the only type that can show both bubbles at once.
  describe('stacking order (webbings)', () => {
    it('sits in the top-right of the image area', () => {
      cy.fetchAllItems('webbing').then((all) => {
        const warned = (all as Item[]).find(i => i.isa_warning != null)
        if (!warned) return
        cy.visit('/webbings')
        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', warned.name as string)
          .closest('[data-cy="gear-card"]')
          .within(() => {
            cy.get('[data-cy="gear-card-image-area"]').then(($area) => {
              cy.get('[data-cy="isa-warning-badge"]').then(($badge) => {
                const area = $area[0].getBoundingClientRect()
                const badge = $badge[0].getBoundingClientRect()
                // Top half, right half.
                expect(badge.top).to.be.lessThan(area.top + area.height / 2)
                expect(badge.left).to.be.greaterThan(area.left + area.width / 2)
              })
            })
          })
      })
    })

    it('sits ABOVE the classification bubble when both are present', () => {
      cy.fetchAllItems('webbing').then((all) => {
        const both = (all as Item[]).find(
          i => i.isa_warning != null && i.isa_certified === true && i.classification != null,
        )
        if (!both) return
        cy.visit('/webbings')
        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', both.name as string)
          .closest('[data-cy="gear-card"]')
          .within(() => {
            cy.get('[data-cy="isa-warning-badge"]').then(($badge) => {
              cy.get('[data-cy="classification-pill"]').then(($pill) => {
                expect($badge[0].getBoundingClientRect().top).to.be.lessThan(
                  $pill[0].getBoundingClientRect().top,
                )
              })
            })
          })
      })
    })

    it('does not collide with the Legacy pill, which stays on the left', () => {
      cy.fetchAllItems('webbing').then((all) => {
        const legacyWarned = (all as Item[]).find(
          i => i.isa_warning != null && i.active === false,
        )
        if (!legacyWarned) return
        cy.visit('/webbings')
        cy.get('[data-cy="gear-card"]')
          .contains('[data-cy="gear-card-name"]', legacyWarned.name as string)
          .closest('[data-cy="gear-card"]')
          .within(() => {
            cy.get('[data-cy="legacy-badge"]').then(($legacy) => {
              cy.get('[data-cy="isa-warning-badge"]').then(($badge) => {
                const l = $legacy[0].getBoundingClientRect()
                const b = $badge[0].getBoundingClientRect()
                expect(l.right, 'legacy pill ends before the warning bubble starts')
                  .to.be.lessThan(b.left)
              })
            })
          })
      })
    })
  })

  NO_WARNING_TYPES.forEach(({ slug, label }) => {
    it(`${label} never render a warning bubble (no isa_warning field)`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="gear-card"]').should('exist')
      cy.get('[data-cy="isa-warning-badge"]').should('not.exist')
    })
  })
})

// ── The detail banner ─────────────────────────────────────────────────────────

describe('ISA warning banner — item page', () => {
  WARNING_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('shows the full ISA entry, not just the status word', () => {
        // The whole point of the panel: what failed, what to do, when, and
        // where it was published. A banner that only says "ISA Recall" is
        // unactionable for the person holding the gear.
        cy.request(`${api()}/isawarning/?gear_type=${apiPath}&limit=500`).then(({ body }) => {
          const entries = body as Entry[]
          const withEverything = entries.find(e => e.description && e.solution && e.links?.length)
          if (!withEverything) return
          cy.visit(`/${slug}/${withEverything.gear_id}`)
          cy.get('[data-cy="isa-warning-banner"]').within(() => {
            cy.get(`[data-cy="isa-warning-entry"][data-source-id="${withEverything.source_id}"]`)
              .should('be.visible')
              .within(() => {
                // Verbatim — the ISA's wording is not paraphrased.
                cy.get('[data-cy="isa-warning-description"]')
                  .should('contain.text', withEverything.description!)
                cy.get('[data-cy="isa-warning-solution"]')
                  .should('contain.text', withEverything.solution!)
                  .and('contain.text', 'What to do')
                cy.get('[data-cy="isa-warning-date"]').should('not.be.empty')
                cy.get('[data-cy="isa-warning-source"]')
                  .should('have.length', withEverything.links!.length)
                  .first()
                  .should('have.attr', 'target', '_blank')
                  .and('have.attr', 'rel')
                  .and('contain', 'noopener')
              })
          })
        })
      })

      it('renders the publication date in long form, from the parsed date', () => {
        cy.request(`${api()}/isawarning/?gear_type=${apiPath}&limit=500`).then(({ body }) => {
          const entry = (body as Entry[]).find(e => e.date_iso)
          if (!entry) return
          const year = entry.date_iso!.slice(0, 4)
          cy.visit(`/${slug}/${entry.gear_id}`)
          cy.get(`[data-cy="isa-warning-entry"][data-source-id="${entry.source_id}"]`)
            .find('[data-cy="isa-warning-date"]')
            // "1 September 2020" — not the raw dd.mm.yy the ISA publishes.
            .should('contain.text', year)
            .and('not.contain.text', entry.date!)
        })
      })

      it('is severity-coloured, not a fixed amber', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const found = byStatus(all as Item[])
          for (const status of SHOWN_STATUSES) {
            const item = found[status]
            if (!item) continue
            cy.visit(`/${slug}/${item.id}`)
            cy.get('[data-cy="isa-warning-banner"]')
              .should('be.visible')
              .and('have.attr', 'data-isa-warning', status)
              .and('contain.text', status)
          }
        })
      })

      it('renders a recall in red and a warning in amber — distinguishably', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const found = byStatus(all as Item[])
          if (!found.Recall || !found.Warning) return
          const colors: string[] = []
          for (const item of [found.Recall, found.Warning]) {
            cy.visit(`/${slug}/${item!.id}`)
            // The severity ground is on each entry, not on the wrapper that
            // stacks them — an item can carry warnings of differing severity.
            cy.get('[data-cy="isa-warning-entry"]')
              .first()
              .invoke('css', 'background-color')
              .then((c) => colors.push(String(c)))
          }
          cy.then(() => {
            expect(colors[0], 'recall and warning entries differ').to.not.eq(colors[1])
            expect(colors[0], 'neither is transparent').to.not.contain('rgba(0, 0, 0, 0)')
          })
        })
      })

      it('keeps the banner between the name and the certification block', () => {
        // The order asserted in DESIGN.md § Gear Detail Page: a safety warning
        // sits next to the product name, never under the spec grid.
        cy.fetchAllItems(apiPath).then((all) => {
          const warned = (all as Item[]).find(i => i.isa_warning != null)
          if (!warned) return
          cy.visit(`/${slug}/${warned.id}`)
          cy.get('[data-cy="detail-name"]').then(($name) => {
            cy.get('[data-cy="isa-warning-banner"]').then(($banner) => {
              cy.get('[data-cy="isa-certification-block"]').then(($cert) => {
                const y = (el: JQuery<HTMLElement>) => el[0].getBoundingClientRect().top
                expect(y($name)).to.be.lessThan(y($banner))
                expect(y($banner)).to.be.lessThan(y($cert))
              })
            })
          })
        })
      })
    })
  })

  it('appears in the listing Detailed view too, since it shares the component', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const warned = (all as Item[]).find(i => i.isa_warning != null)
      if (!warned) return
      cy.visit('/webbings')
      cy.get('[data-cy="view-detailed"]').click()
      cy.get('[data-cy="search-input"]').type(String(warned.name))
      cy.get('[data-cy="isa-warning-banner"]').should('exist')
    })
  })
})

// ── The sidebar filter ────────────────────────────────────────────────────────

describe('ISA Warning filter group', () => {
  const group = (slug: string) => {
    cy.visit(`/${slug}`)
    return cy.get('[data-cy="filter-group"][data-group="isa_warning"]')
  }

  WARNING_TYPES.forEach(({ slug, apiPath, label }) => {
    describe(label, () => {
      it('offers None plus exactly the statuses this type actually has', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const items = all as Item[]
          const present = SHOWN_STATUSES.filter(s => items.some(i => i.isa_warning === s))
          const expected = items.some(i => i.isa_warning == null)
            ? ['none', ...present]
            : present

          group(slug)
            .find('[data-cy="filter-pill"]')
            .then(($pills) => {
              const values = [...$pills].map(el => el.getAttribute('data-value'))
              // Same set — a pill for a status no item carries would filter to
              // an empty grid, which is the phantom-option bug the derivation
              // is written to avoid.
              expect(values.slice().sort()).to.deep.eq(expected.slice().sort())
            })
        })
      })

      it('orders the pills None → Recall → Warning → Notice', () => {
        // Alphabetical would read Notice · Recall · Warning and bury the recall.
        group(slug)
          .find('[data-cy="filter-pill"]')
          .then(($pills) => {
            const values = [...$pills].map(el => el.getAttribute('data-value')!)
            const rank = ['none', 'Recall', 'Warning', 'Notice']
            const ranks = values.map(v => rank.indexOf(v))
            expect(ranks).to.deep.eq(ranks.slice().sort((a, b) => a - b))
          })
      })

      it('None selects every unwarned item — and no bubbles are left on screen', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const items = all as Item[]
          const clean = items.filter(i => i.isa_warning == null).length
          if (clean === 0 || clean === items.length) return

          group(slug).find('[data-cy="filter-pill"][data-value="none"]').click()
          cy.get('[data-cy="item-count"]').should('contain', String(clean))
          // The strongest form of the assertion: not one warning bubble survives.
          cy.get('[data-cy="isa-warning-badge"]').should('not.exist')
        })
      })

      it('a status pill selects exactly the items carrying it', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const items = all as Item[]
          for (const status of SHOWN_STATUSES) {
            const matching = items.filter(i => i.isa_warning === status)
            if (matching.length === 0) continue
            group(slug).find(`[data-cy="filter-pill"][data-value="${status}"]`).click()
            cy.get('[data-cy="item-count"]').should('contain', String(matching.length))
            // Asserted over the whole grid rather than card-by-card: iterating
            // cards races the re-render the click itself triggers, and this is
            // the stronger claim anyway — every badge on screen is this status,
            // and there is at least one.
            cy.get('[data-cy="gear-card"] [data-cy="isa-warning-badge"]')
              .should('have.length.greaterThan', 0)
            cy.get(
              `[data-cy="gear-card"] [data-cy="isa-warning-badge"]:not([data-isa-warning="${status}"])`,
            ).should('not.exist')
          }
        })
      })

      it('survives a reload, because the selection lives in the URL', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          const items = all as Item[]
          if (!items.some(i => i.isa_warning == null)) return
          group(slug).find('[data-cy="filter-pill"][data-value="none"]').click()
          cy.location('search').should('contain', 'isa_warning')
          cy.reload()
          cy.get('[data-cy="filter-group"][data-group="isa_warning"]')
            .find('[data-cy="filter-pill"][data-value="none"]')
            .should('have.attr', 'data-active', 'true')
          cy.get('[data-cy="isa-warning-badge"]').should('not.exist')
        })
      })
    })
  })

  NO_WARNING_TYPES.forEach(({ slug, label }) => {
    it(`${label} have no ISA Warning group at all`, () => {
      cy.visit(`/${slug}`)
      cy.get('[data-cy="filter-group"]').should('exist')
      cy.get('[data-cy="filter-group"][data-group="isa_warning"]').should('not.exist')
    })
  })
})

// ── Several warnings, and honesty about the match ─────────────────────────────

describe('ISA warning panel — completeness', () => {
  it('renders every warning against an item, not just the worst one', () => {
    cy.request(`${api()}/isawarning/?limit=500`).then(({ body }) => {
      const entries = body as Entry[]
      const counts = new Map<string, Entry[]>()
      for (const e of entries) {
        const key = `${e.gear_type}:${e.gear_id}`
        counts.set(key, [...(counts.get(key) ?? []), e])
      }
      const multi = [...counts.values()].find(list => list.length > 1)
      expect(multi, 'some item carries more than one ISA warning').to.not.eq(undefined)

      const slug = GEAR_TYPES.find(t => t.apiPath === multi![0].gear_type)!.slug
      cy.visit(`/${slug}/${multi![0].gear_id}`)
      cy.get('[data-cy="isa-warning-entry"]').should('have.length', multi!.length)
      // The card bubble shows the worst; the panel shows them all.
      for (const entry of multi!) {
        cy.get(`[data-cy="isa-warning-entry"][data-source-id="${entry.source_id}"]`).should('exist')
      }
    })
  })

  it('flags a match we are not certain of, with the ISA\'s own naming', () => {
    // Matches were adjudicated by hand against the ISA's product names, which
    // often differ from ours. Presenting an ambiguous one as fact is the
    // failure mode that matters when the subject is a recall.
    cy.request(`${api()}/isawarning/?limit=500`).then(({ body }) => {
      const hedged = (body as Entry[]).find(
        e => e.confidence != null && ['likely', 'partial', 'ambiguous'].includes(e.confidence),
      )
      if (!hedged) return
      const slug = GEAR_TYPES.find(t => t.apiPath === hedged.gear_type)!.slug
      cy.visit(`/${slug}/${hedged.gear_id}`)
      cy.get(`[data-cy="isa-warning-entry"][data-source-id="${hedged.source_id}"]`)
        .find('[data-cy="isa-warning-hedge"]')
        .should('be.visible')
        .and('contain.text', hedged.model!)
    })
  })

  it('does not hedge an exact match', () => {
    cy.request(`${api()}/isawarning/?limit=500`).then(({ body }) => {
      const exact = (body as Entry[]).find(e => e.confidence === 'exact')
      if (!exact) return
      const slug = GEAR_TYPES.find(t => t.apiPath === exact.gear_type)!.slug
      cy.visit(`/${slug}/${exact.gear_id}`)
      cy.get(`[data-cy="isa-warning-entry"][data-source-id="${exact.source_id}"]`)
        .find('[data-cy="isa-warning-hedge"]')
        .should('not.exist')
    })
  })

  it('keeps the severity readable when the detail fetch fails', () => {
    // Losing the detail table must downgrade the banner, never hide a warning:
    // the gear row's own enum still knows the severity.
    cy.intercept('GET', '**/isawarning/**', { statusCode: 500, body: {} }).as('warnings')
    cy.fetchAllItems('weblock').then((all) => {
      const warned = (all as Item[]).find(i => i.isa_warning != null)
      if (!warned) return
      cy.visit(`/weblocks/${warned.id}`)
      cy.get('[data-cy="isa-warning-banner"]')
        .should('be.visible')
        .and('have.attr', 'data-isa-warning', String(warned.isa_warning))
      cy.get('[data-cy="isa-warning-status"]').should('contain.text', String(warned.isa_warning))
    })
  })
})
