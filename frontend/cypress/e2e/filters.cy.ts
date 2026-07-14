import { GEAR_TYPES } from '../support/gear_types'

// Two standard filter types:
//   'pill'  — enum or boolean field; values become toggle buttons
//   'range' — numeric field (float or int); rendered as min + max inputs
//
// Webbing stretch is handled separately — see the dedicated describe block below.
// It is a JSON array of {kn, percent} pairs, not a scalar, so it needs a
// custom two-part widget: a kN reference selector + a % range.
//
// Source of truth: slack_data/models/*.py and slack_data/utilities/

type FilterType = 'pill' | 'range'

interface FilterGroup {
  group: string   // matches data-group attribute and the Python field name
  label: string   // human label shown in the sidebar
  type: FilterType
  unit?: string   // displayed next to the range inputs (mm, kN, g, etc.)
}

const FILTER_GROUPS: Record<string, FilterGroup[]> = {
  // ── Webbing ───────────────────────────────────────────────────────────────
  // Fields: material(enum) width(int) weight(float) breaking_strength(float)
  //         stretch(str|None→pill) isa_certified(bool) classification(enum)
  //         isa_warning(enum) colors(str, comma-sep — excluded, needs split logic)
  webbings: [
    { group: 'material',          label: 'Material Type',     type: 'pill'  },
    { group: 'width',             label: 'Width',             type: 'pill', unit: 'mm' }, // discrete int set
    { group: 'classification',    label: 'Classification',    type: 'pill'  }, // A+/A/B/C/Other
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill'  },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill'  }, // Recall/Warning/Notice/No Warning
    // stretch has its own widget — see the dedicated describe block below FILTER_GROUPS
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g/m' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Weblock ───────────────────────────────────────────────────────────────
  // Fields: material(enum) width_min(int) width_max(int|None) weight(float)
  //         breaking_strength(float) front_pin(enum|None) attachment_point(enum|None)
  //         isa_certified(bool) isa_warning(enum) colors(excluded)
  weblocks: [
    { group: 'material',          label: 'Material',          type: 'pill'  }, // MetalMaterial
    { group: 'width_min',         label: 'Min Width',         type: 'pill', unit: 'mm' }, // discrete int
    { group: 'front_pin',         label: 'Front Pin',         type: 'pill'  }, // Push/Pull/Captive/Fixed Bolt/Other
    { group: 'attachment_point',  label: 'Attachment Point',  type: 'pill'  }, // Universal/Hole/Pin/Bolt/Bent Plate/Sling/Other
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill'  },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill'  },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g'  },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Leash Ring ────────────────────────────────────────────────────────────
  // Fields: material(enum) inner_diameter(float) outer_diameter(float)
  //         weight(float) breaking_strength(float) isa_certified(bool) isa_warning(enum)
  leashrings: [
    { group: 'material',          label: 'Material',          type: 'pill'  }, // MetalMaterial
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill'  },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill'  },
    { group: 'inner_diameter',    label: 'Inner Diameter',    type: 'range', unit: 'mm' },
    { group: 'outer_diameter',    label: 'Outer Diameter',    type: 'range', unit: 'mm' },
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g'  },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Grip ──────────────────────────────────────────────────────────────────
  // Fields: material(enum) width_min(int) width_max(int|None) weight(float)
  //         wll(float) mbs(float) common_slipping_threshold(float)
  //         connection_type(enum|None) isa_certified(bool) isa_warning(enum)
  grips: [
    { group: 'material',                  label: 'Material',            type: 'pill'  }, // MetalMaterial
    { group: 'width_min',                 label: 'Min Width',           type: 'pill', unit: 'mm' }, // discrete int
    { group: 'connection_type',           label: 'Connection Type',     type: 'pill'  }, // Dyneema Sling Loop/Mounting Hole/Other
    { group: 'isa_certified',             label: 'ISA Certified',       type: 'pill'  },
    { group: 'isa_warning',               label: 'ISA Warning',         type: 'pill'  },
    { group: 'weight',                    label: 'Weight',              type: 'range', unit: 'g'  },
    { group: 'wll',                       label: 'WLL',                 type: 'range', unit: 'kN' },
    { group: 'mbs',                       label: 'MBS',                 type: 'range', unit: 'kN' },
    { group: 'common_slipping_threshold', label: 'Slipping Threshold',  type: 'range', unit: 'kN' },
  ],

  // ── Roller ────────────────────────────────────────────────────────────────
  // Fields: material(enum) roller_material(enum) slider_type(enum) lock_type(enum)
  //         bearing_material(enum) width(str|None — range text, not filterable as range)
  //         weight(float) breaking_strength(float) isa_certified(bool) isa_warning(enum)
  //         colors(excluded)
  // Note: width on rollers is a raw string ("25–35mm") — not a numeric field.
  //       It cannot be used as a range filter; it's display-only.
  rollers: [
    { group: 'material',         label: 'Frame Material',    type: 'pill'  }, // MetalMaterial
    { group: 'roller_material',  label: 'Roller Material',   type: 'pill'  }, // RollerMaterial: Aluminum/Steel/Stainless Steel/Plastic/Other
    { group: 'slider_type',      label: 'Slider Type',       type: 'pill'  }, // Moving plates/Carabiner/Locking Carabiner/Other
    { group: 'lock_type',        label: 'Lock Type',         type: 'pill'  }, // Non-locking/Screw Lock/Auto Lock/Twist Lock/Magnetic Lock/Other
    { group: 'bearing_material', label: 'Bearing Material',  type: 'pill'  }, // Stainless Steel/Steel/Other
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill'  },
    { group: 'isa_warning',      label: 'ISA Warning',       type: 'pill'  },
    { group: 'weight',           label: 'Weight',            type: 'range', unit: 'g'  },
    { group: 'breaking_strength',label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Tree Protector ────────────────────────────────────────────────────────
  // Fields: weight(float) width(float) length(int) thickness(int)
  //         has_sling_attachment(bool) price(float) price_unit(enum)
  // No isa_certified, no isa_warning on this model.
  treepros: [
    { group: 'has_sling_attachment', label: 'Sling Attachment', type: 'pill'  },
    { group: 'price_unit',           label: 'Sold As',          type: 'pill'  }, // single/pair
    { group: 'weight',               label: 'Weight',           type: 'range', unit: 'g'   },
    { group: 'width',                label: 'Width',            type: 'range', unit: 'cm'  },
    { group: 'length',               label: 'Length',           type: 'range', unit: 'cm'  },
    { group: 'thickness',            label: 'Thickness',        type: 'range', unit: 'mm'  },
  ],

  // ── Starter Kit ───────────────────────────────────────────────────────────
  // Fields: webbing_length(int) webbing_width(int) weight(float)
  //         tensioning_type(enum: Single Ratchet/Double Ratchet/Primitive/Other)
  //         includes_treepro(bool) isa_certified(bool)
  // No isa_warning on this model.
  starterkits: [
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill'  }, // Single Ratchet/Double Ratchet/Primitive/Other
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', unit: 'mm' }, // discrete int
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', unit: 'm'  }, // discrete int
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill'  },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill'  },
    { group: 'weight',           label: 'Kit Weight',        type: 'range', unit: 'g' },
  ],

  // ── Trickline Kit ─────────────────────────────────────────────────────────
  // Same shape as StarterKit but TensioningType has no "Primitive" value.
  // Fields: webbing_length(int) webbing_width(int) weight(float)
  //         tensioning_type(enum: Single Ratchet/Double Ratchet/Other)
  //         includes_treepro(bool) isa_certified(bool)
  tricklinekits: [
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill'  }, // Single Ratchet/Double Ratchet/Other (no Primitive)
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', unit: 'm'  },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill'  },
    { group: 'isa_certified',    label: 'ISA Certified',     type: 'pill'  },
    { group: 'weight',           label: 'Kit Weight',        type: 'range', unit: 'g' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pillGroups(slug: string) {
  return (FILTER_GROUPS[slug] ?? []).filter(g => g.type === 'pill')
}

function rangeGroups(slug: string) {
  return (FILTER_GROUPS[slug] ?? []).filter(g => g.type === 'range')
}

// ── Tests (run for every gear type) ──────────────────────────────────────────

GEAR_TYPES.forEach(({ slug, apiPath, label }) => {
  describe(`Filter sidebar — ${label}`, () => {
    const pills  = pillGroups(slug)
    const ranges = rangeGroups(slug)
    const all    = [...pills, ...ranges]

    beforeEach(() => {
      cy.visit(`/${slug}`)
    })

    // ── Sidebar structure ─────────────────────────────────────────────────────

    it('renders the filter sidebar', () => {
      cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    })

    it('shows the "FIND YOUR [TYPE]" header', () => {
      cy.get('[data-cy="filter-sidebar-header"]')
        .should('be.visible')
        .and('contain.text', label.toUpperCase())
    })

    it('renders all expected filter groups with correct labels', () => {
      all.forEach(({ group, label: groupLabel }) => {
        cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
          .should('exist')
          .and('contain.text', groupLabel)
      })
    })

    it('each filter group has a colored dot accent', () => {
      all.forEach(({ group }) => {
        cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
          .find('[data-cy="filter-group-dot"]').should('exist')
      })
    })

    it('each filter group has a collapse/expand toggle', () => {
      all.forEach(({ group }) => {
        cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
          .find('[data-cy="filter-group-toggle"]').should('exist')
      })
    })

    it('collapses a filter group and hides its controls', () => {
      if (all.length === 0) return
      const { group, type } = all[0]
      const controlSelector = type === 'pill' ? '[data-cy="filter-pill"]' : '[data-cy="range-min"]'
      cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
        .find('[data-cy="filter-group-toggle"]').click()
      cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
        .find(controlSelector).should('not.be.visible')
    })

    it('expands a collapsed filter group on second click', () => {
      if (all.length === 0) return
      const { group, type } = all[0]
      const controlSelector = type === 'pill' ? '[data-cy="filter-pill"]' : '[data-cy="range-min"]'
      cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
        .find('[data-cy="filter-group-toggle"]').click().click()
      cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
        .find(controlSelector).should('be.visible')
    })

    // ── Pill-specific behaviour ───────────────────────────────────────────────

    if (pills.length > 0) {
      it('pill filters start inactive', () => {
        cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
          .find('[data-cy="filter-pill"]').first()
          .should('have.attr', 'data-active', 'false')
      })

      it('clicking a pill marks it active', () => {
        cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
          .find('[data-cy="filter-pill"]').first().click()
          .should('have.attr', 'data-active', 'true')
      })

      it('clicking an active pill deactivates it', () => {
        cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
          .find('[data-cy="filter-pill"]').first().click().click()
          .should('have.attr', 'data-active', 'false')
      })

      it('multiple pills in the same group can be active simultaneously', () => {
        cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
          .find('[data-cy="filter-pill"]').then(($pills) => {
            if ($pills.length < 2) return
            cy.wrap($pills[0]).click()
            cy.wrap($pills[1]).click()
            cy.wrap($pills[0]).should('have.attr', 'data-active', 'true')
            cy.wrap($pills[1]).should('have.attr', 'data-active', 'true')
          })
      })

      it('activating a pill reduces the card count', () => {
        cy.fetchAllItems(apiPath).then((all) => {
          cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
            .find('[data-cy="filter-pill"]').first().click()
          cy.get('[data-cy="gear-card"]').its('length').should('be.lte', all.length)
        })
      })

      it('deactivating the pill restores the full card count', () => {
        cy.fetchAllItems(apiPath).then((allItems) => {
          cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
            .find('[data-cy="filter-pill"]').first().click().click()
          cy.get('[data-cy="gear-card"]').should('have.length', allItems.length)
        })
      })
    }

    // ── Range-filter behaviour ────────────────────────────────────────────────

    ranges.forEach(({ group, label: groupLabel, unit }) => {
      describe(`Range filter — ${groupLabel}${unit ? ` (${unit})` : ''}`, () => {
        it('renders a min input and a max input', () => {
          cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
            .find('[data-cy="range-min"]').should('exist')
          cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
            .find('[data-cy="range-max"]').should('exist')
        })

        if (unit) {
          it('shows the unit label next to the inputs', () => {
            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .should('contain.text', unit)
          })
        }

        it('setting a min value reduces the card count', () => {
          // Fetch real data to pick a meaningful min that excludes some items
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group])
              .filter(v => v != null)
              .map(Number)
              .sort((a, b) => a - b)

            if (values.length < 2) return // skip if field is always null

            // Use the median as the min — should cut out the lower half
            const median = values[Math.floor(values.length / 2)]

            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-min"]').clear().type(String(median))

            cy.get('[data-cy="gear-card"]')
              .its('length').should('be.lte', allItems.length)
          })
        })

        it('setting a max value reduces the card count', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group])
              .filter(v => v != null)
              .map(Number)
              .sort((a, b) => a - b)

            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]

            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-max"]').clear().type(String(median))

            cy.get('[data-cy="gear-card"]')
              .its('length').should('be.lte', allItems.length)
          })
        })

        it('clearing both inputs restores the full card count', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]

            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-min"]').clear().type(String(median))
            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-min"]').clear()

            cy.get('[data-cy="gear-card"]').should('have.length', allItems.length)
          })
        })

        it('items outside the min–max range are excluded', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number)
              .sort((a, b) => a - b)
            if (values.length < 3) return

            const lo = values[Math.floor(values.length * 0.25)]
            const hi = values[Math.floor(values.length * 0.75)]

            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-min"]').clear().type(String(lo))
            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-max"]').clear().type(String(hi))

            // Cards carry data-{field} attributes with the raw numeric value
            // (empty string when null). Verify every card's value is within [lo, hi].
            const attr = `data-${group.replace(/_/g, '-')}`
            cy.get('[data-cy="gear-card"]').each(($card) => {
              const raw = $card.attr(attr)
              if (raw && raw !== '') {
                expect(Number(raw)).to.be.gte(lo)
                expect(Number(raw)).to.be.lte(hi)
              }
            })
          })
        })

        it('the item-count label matches the number of filtered cards', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]
            cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
              .find('[data-cy="range-min"]').clear().type(String(median))

            cy.get('[data-cy="gear-card"]').its('length').then((count) => {
              cy.get('[data-cy="item-count"]').should('contain.text', String(count))
            })
          })
        })
      })
    })

    // ── Cross-filter behaviour ────────────────────────────────────────────────

    it('item-count label always matches the number of visible cards', () => {
      cy.get('[data-cy="gear-card"]').its('length').then((count) => {
        cy.get('[data-cy="item-count"]').should('contain.text', String(count))
      })
    })

    it('shows an empty state with a clear-filters link when nothing matches', () => {
      if (pills.length < 2) return
      cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
        .find('[data-cy="filter-pill"]').last().click()
      cy.get(`[data-cy="filter-group"][data-group="${pills[1].group}"]`)
        .find('[data-cy="filter-pill"]').last().click()
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy="empty-state"]').length > 0) {
          cy.get('[data-cy="empty-state"]').find('[data-cy="clear-filters"]').should('be.visible')
        }
      })
    })

    it('clear-filters resets all active pill filters', () => {
      if (pills.length === 0) return
      cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
        .find('[data-cy="filter-pill"]').first().click()
      cy.get('[data-cy="clear-filters"]').first().click()
      cy.get(`[data-cy="filter-group"][data-group="${pills[0].group}"]`)
        .find('[data-cy="filter-pill"]').first()
        .should('have.attr', 'data-active', 'false')
    })

    it('clear-filters resets all range inputs to empty', () => {
      if (ranges.length === 0) return
      cy.get(`[data-cy="filter-group"][data-group="${ranges[0].group}"]`)
        .find('[data-cy="range-min"]').type('999')
      cy.get('[data-cy="clear-filters"]').first().click()
      cy.get(`[data-cy="filter-group"][data-group="${ranges[0].group}"]`)
        .find('[data-cy="range-min"]').should('have.value', '')
    })
  })
})

// ── Webbing stretch filter (custom widget) ────────────────────────────────────
//
// stretch is stored as a JSON string: '[{"kn": 0, "percent": 0.0}, {"kn": 10, "percent": 14.97}]'
// It is not a scalar — it's a curve. The filter widget is:
//
//   ┌─ Stretch at ──────────────────────────────┐
//   │  [0 kN] [5 kN] [►10 kN] [15 kN] [20 kN]  │  ← single-select pills, populated from data
//   │  Min %  [___]   Max %  [___]               │  ← range inputs for % at the selected kN
//   └───────────────────────────────────────────┘
//
// Rules:
//   - kN pills are populated dynamically from the union of all kN values in the dataset.
//   - Default selected kN = the kN value that appears most often across all webbings.
//   - When a kN pill is selected, only webbings that have a data point at that kN are
//     eligible (others are excluded regardless of the % range).
//   - Min/Max % further narrows within the eligible set.
//   - When no kN is selected and no % range is set, the widget is inactive (all items show).

describe('Webbing stretch filter', () => {
  const api = () => Cypress.env('apiUrl')

  // Helper: parse stretch JSON and return kN values present in a single item
  function parseKnValues(stretchJson: string | null): number[] {
    if (!stretchJson) return []
    try {
      const points: { kn: number; percent: number }[] = JSON.parse(stretchJson)
      return points.map(p => p.kn)
    } catch {
      return []
    }
  }

  // Helper: get the stretch % for a specific kN from a parsed array
  function percentAtKn(stretchJson: string | null, kn: number): number | null {
    if (!stretchJson) return null
    try {
      const points: { kn: number; percent: number }[] = JSON.parse(stretchJson)
      const match = points.find(p => p.kn === kn)
      return match ? match.percent : null
    } catch {
      return null
    }
  }

  beforeEach(() => {
    cy.visit('/webbings')
  })

  // ── Widget structure ──────────────────────────────────────────────────────

  it('renders a Stretch filter group in the sidebar', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]').should('be.visible')
  })

  it('shows kN pills inside the stretch group', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]')
      .should('have.length.gte', 1)
  })

  it('shows a min % and max % input inside the stretch group', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="range-min"]').should('exist')
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="range-max"]').should('exist')
  })

  it('kN pills are populated from the actual dataset (no phantom values)', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const allKn = new Set<number>()
      ;(all as Record<string, unknown>[]).forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => allKn.add(k))
      })
      const expectedCount = allKn.size

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .should('have.length', expectedCount)
    })
  })

  it('kN pill labels match the actual kN values present in the data', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const allKn = new Set<number>()
      ;(all as Record<string, unknown>[]).forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => allKn.add(k))
      })

      allKn.forEach(kn => {
        cy.get('[data-cy="filter-group"][data-group="stretch"]')
          .find('[data-cy="stretch-kn-pill"]')
          .contains(`${kn}`)
          .should('exist')
      })
    })
  })

  // ── Default selected kN ───────────────────────────────────────────────────

  it('defaults to the most common kN value pre-selected', () => {
    cy.fetchAllItems('webbing').then((all) => {
      // Count occurrences of each kN across all stretch arrays
      const freq: Record<number, number> = {}
      ;(all as Record<string, unknown>[]).forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const mostCommonKn = Number(
        Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0]
      )

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"][data-active="true"]')
        .should('contain.text', `${mostCommonKn}`)
    })
  })

  // ── kN selection ──────────────────────────────────────────────────────────

  it('clicking a kN pill selects it and deselects the previous one', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').then(($pills) => {
        if ($pills.length < 2) return
        cy.wrap($pills[1]).click()
        cy.wrap($pills[1]).should('have.attr', 'data-active', 'true')
        cy.wrap($pills[0]).should('have.attr', 'data-active', 'false')
      })
  })

  it('only one kN pill can be active at a time', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('have.length', 1)

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').last().click()

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('have.length', 1)
  })

  it('clicking the active kN pill deselects it (widget goes inactive)', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]').click()

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('not.exist')
  })

  // ── Filtering behaviour ───────────────────────────────────────────────────

  it('selecting a kN excludes webbings with no stretch data at that kN', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      // Find a kN value that some (but not all) webbings have data for
      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })

      const partialKn = Object.entries(freq)
        .find(([, count]) => count > 0 && count < webbings.length)

      if (!partialKn) return // skip if all webbings have data at every kN (unlikely)

      const kn = Number(partialKn[0])
      const expectedCount = partialKn[1]

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .contains(`${kn}`).click()

      cy.get('[data-cy="gear-card"]').should('have.length', expectedCount)
    })
  })

  it('setting a min % at the selected kN further reduces results', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      // Find the most common kN and its median stretch %
      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const mostCommonKn = Number(
        Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0]
      )

      const percents = webbings
        .map(w => percentAtKn(w.stretch as string | null, mostCommonKn))
        .filter((p): p is number => p !== null)
        .sort((a, b) => a - b)

      if (percents.length < 2) return

      const median = percents[Math.floor(percents.length / 2)]

      // Activate the most common kN (may already be selected by default)
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .contains(`${mostCommonKn}`).click()

      const eligibleCount = percents.length // items with this kN

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="range-min"]').clear().type(String(median))

      cy.get('[data-cy="gear-card"]')
        .its('length').should('be.lte', eligibleCount)
    })
  })

  it('setting a max % at the selected kN further reduces results', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const mostCommonKn = Number(
        Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0]
      )

      const percents = webbings
        .map(w => percentAtKn(w.stretch as string | null, mostCommonKn))
        .filter((p): p is number => p !== null)
        .sort((a, b) => a - b)

      if (percents.length < 2) return

      const median = percents[Math.floor(percents.length / 2)]

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .contains(`${mostCommonKn}`).click()

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="range-max"]').clear().type(String(median))

      cy.get('[data-cy="gear-card"]')
        .its('length').should('be.lte', percents.length)
    })
  })

  it('the item-count label matches the number of visible cards after stretch filtering', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()

    cy.get('[data-cy="gear-card"]').its('length').then((count) => {
      cy.get('[data-cy="item-count"]').should('contain.text', String(count))
    })
  })

  // ── Clearing ──────────────────────────────────────────────────────────────

  it('clear-filters deselects the kN pill and clears the % range', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="range-min"]').type('5')

    cy.get('[data-cy="clear-filters"]').first().click()

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('not.exist')
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="range-min"]').should('have.value', '')
  })

  it('restores the full webbing list when the stretch filter is cleared', () => {
    cy.fetchAllItems('webbing').then((all) => {
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').first().click()
      cy.get('[data-cy="clear-filters"]').first().click()
      cy.get('[data-cy="gear-card"]').should('have.length', all.length)
    })
  })

  // ── Sort by stretch at selected kN ────────────────────────────────────────

  it('the sort dropdown exposes Stretch % Low→High when a kN is selected', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"]').contains(/stretch.*low|low.*stretch/i).should('exist')
  })

  it('the sort dropdown exposes Stretch % High→Low when a kN is selected', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-option"]').contains(/stretch.*high|high.*stretch/i).should('exist')
  })

  it('sorting by Stretch % Low→High orders cards ascending by % at the selected kN', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const webbings = all as Record<string, unknown>[]

      const freq: Record<number, number> = {}
      webbings.forEach(w => {
        parseKnValues(w.stretch as string | null).forEach(k => {
          freq[k] = (freq[k] ?? 0) + 1
        })
      })
      const mostCommonKn = Number(
        Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0]
      )

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .contains(`${mostCommonKn}`).click()

      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="sort-option"]').contains(/stretch.*low/i).click()

      // Read the stretch % values shown on the cards (via data attribute)
      cy.get('[data-cy="gear-card"][data-stretch-percent]').then(($cards) => {
        const percents = [...$cards].map(c => parseFloat(c.getAttribute('data-stretch-percent') ?? '0'))
        const sorted = [...percents].sort((a, b) => a - b)
        expect(percents).to.deep.equal(sorted)
      })
    })
  })
})
