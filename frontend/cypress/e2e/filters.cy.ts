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
  // The card attribute a range filter's bounds are verified against, when it
  // isn't data-{group}. Price is the only one: its slider is denominated in the
  // viewer's display currency, while data-price stays the as-sold amount in the
  // seller's own currency. Checking bounds against data-price would compare
  // "1.30 EUR" to "1.50 USD" and call it a bug. See currency.cy.ts.
  valueAttr?: string
}

const FILTER_GROUPS: Record<string, FilterGroup[]> = {
  // ── Webbing ───────────────────────────────────────────────────────────────
  // Fields: material(enum) width(int) weight(float) breaking_strength(float)
  //         stretch(str|None→pill) isa_certified(bool) classification(enum — excluded,
  //         it's a badge, not an axis) isa_warning(enum)
  //         colors(str, comma-sep — excluded, needs split logic)
  webbings: [
    // Price is the FIRST group in every sidebar (DESIGN.md § Left Filter Sidebar).
    // No `unit` here on purpose: its unit is the display currency's symbol, which
    // changes with the top-nav selector — currency.cy.ts owns that behaviour.
    { group: 'price',             label: 'Price per meter',   type: 'range', valueAttr: 'data-price-display' },
    { group: 'material',          label: 'Material Type',     type: 'pill'  },
    { group: 'width',             label: 'Width',             type: 'range', unit: 'mm' }, // dual-thumb slider
    // classification is deliberately NOT a filter group — it's a badge on the
    // items that earn one (ISA-certified, or under 22 kN), not an axis of the
    // catalogue (see the "is not a filter" describe below).
    { group: 'isa_certified',     label: 'ISA Certified',     type: 'pill'  },
    { group: 'isa_warning',       label: 'ISA Warning',       type: 'pill'  }, // Recall/Warning/Notice/No Warning
    // stretch has its own widget — see the dedicated describe block below FILTER_GROUPS
    { group: 'weight',            label: 'Weight',            type: 'range', unit: 'g/m' },
    { group: 'breaking_strength', label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Weblock ───────────────────────────────────────────────────────────────
  // Fields: style(enum|None) material(enum) width_min(int) width_max(int|None) weight(float)
  //         breaking_strength(float) front_pin(enum|None) attachment_point(enum|None)
  //         isa_certified(bool) isa_warning(enum) colors(excluded)
  weblocks: [
    { group: 'price',             label: 'Price',             type: 'range', valueAttr: 'data-price-display' },
    { group: 'style',             label: 'Style',             type: 'pill'  }, // Tensionable Weblock / Fixed Linelocker
    { group: 'material',          label: 'Material',          type: 'pill'  }, // MetalMaterial
    { group: 'width_min',         label: 'Min Width',         type: 'range', unit: 'mm' }, // dual-thumb slider
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
    { group: 'price',             label: 'Price',             type: 'range', valueAttr: 'data-price-display' },
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
    { group: 'price',                     label: 'Price',               type: 'range', valueAttr: 'data-price-display' },
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
    { group: 'price',            label: 'Price',             type: 'range', valueAttr: 'data-price-display' },
    { group: 'material',         label: 'Frame Material',    type: 'pill'  }, // MetalMaterial
    { group: 'roller_material',  label: 'Roller Material',   type: 'pill'  }, // RollerMaterial: Aluminum/Steel/Stainless Steel/Plastic/Other
    { group: 'slider_type',      label: 'Slider Type',       type: 'pill'  }, // Moving plates/Carabiner/Locking Carabiner/Other
    { group: 'lock_type',        label: 'Lock Type',         type: 'pill'  }, // Non-locking/Screw Lock/Auto Lock/Twist Lock/Magnetic Lock/Other
    { group: 'bearing_material', label: 'Bearing Material',  type: 'pill'  }, // Stainless Steel/Steel/Other
    // isa_certified is HIDDEN for rollers — no roller is ISA certified, so a lone
    // "No" toggle is useless (see FilterSidebar.pillGroupVisible).
    { group: 'isa_warning',      label: 'ISA Warning',       type: 'pill'  },
    { group: 'weight',           label: 'Weight',            type: 'range', unit: 'g'  },
    { group: 'breaking_strength',label: 'Breaking Strength', type: 'range', unit: 'kN' },
  ],

  // ── Tree Protector ────────────────────────────────────────────────────────
  // Fields: weight(float) width(float) length(int) thickness(int)
  //         has_sling_attachment(bool) price(float) price_unit(enum)
  // No isa_certified, no isa_warning on this model.
  treepros: [
    { group: 'price',                label: 'Price',            type: 'range', valueAttr: 'data-price-display' },
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
    { group: 'price',            label: 'Price',             type: 'range', valueAttr: 'data-price-display' },
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill'  }, // Single Ratchet/Double Ratchet/Primitive/Other
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', unit: 'mm' }, // discrete int
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', unit: 'm'  }, // discrete int
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill'  },
    // isa_certified HIDDEN — no starter kit is ISA certified.
    { group: 'weight',           label: 'Kit Weight',        type: 'range', unit: 'g' },
  ],

  // ── Trickline Kit ─────────────────────────────────────────────────────────
  // Same shape as StarterKit but TensioningType has no "Primitive" value.
  // Fields: webbing_length(int) webbing_width(int) weight(float)
  //         tensioning_type(enum: Single Ratchet/Double Ratchet/Other)
  //         includes_treepro(bool) isa_certified(bool)
  tricklinekits: [
    { group: 'price',            label: 'Price',             type: 'range', valueAttr: 'data-price-display' },
    { group: 'tensioning_type',  label: 'Tensioning',        type: 'pill'  }, // Single Ratchet/Double Ratchet/Other (no Primitive)
    { group: 'webbing_width',    label: 'Webbing Width',     type: 'pill', unit: 'mm' },
    { group: 'webbing_length',   label: 'Webbing Length',    type: 'pill', unit: 'm'  },
    { group: 'includes_treepro', label: 'Includes Tree Pro', type: 'pill'  },
    // isa_certified HIDDEN — no trickline kit is ISA certified.
    // Kit Weight is NOT filterable for trickline kits — only 2 of 9 have weight
    // data, so a slider would mislead (see filterGroups.ts).
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pillGroups(slug: string) {
  return (FILTER_GROUPS[slug] ?? []).filter(g => g.type === 'pill')
}

function rangeGroups(slug: string) {
  return (FILTER_GROUPS[slug] ?? []).filter(g => g.type === 'range')
}

// Range filters are dual-thumb sliders (two overlaid <input type="range">, the
// min thumb data-cy="range-min", the max thumb data-cy="range-max"). React
// ignores jQuery .val(), so set the value via the native setter + a real input
// event. The slider domain is data-driven, so wait for it to load (max > min).
function setSlider(group: string, which: 'min' | 'max', value: number) {
  const scope = `[data-cy="filter-group"][data-group="${group}"]`
  cy.get(scope).find('[data-cy="range-max"]').should(($el) => {
    expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
  })
  cy.get(scope).find(`[data-cy="range-${which}"]`).then(($el) => {
    const input = $el[0] as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// Reset a thumb to its domain bound — which removes that constraint.
function clearSlider(group: string, which: 'min' | 'max') {
  const scope = `[data-cy="filter-group"][data-group="${group}"]`
  cy.get(scope).find(`[data-cy="range-${which}"]`).invoke('attr', which).then((bound) => {
    setSlider(group, which, Number(bound))
  })
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

      it('multiple pills can be active simultaneously in a multi-select (3+) group', () => {
        // Two-option groups are single-select (covered below); this only applies
        // to groups with 3+ options. Some types (e.g. treepros) have none — skip.
        cy.get('body').then(($b) => {
          if ($b.find('[data-cy="pill-group"][data-select="multi"]').length === 0) return
          cy.get('[data-cy="pill-group"][data-select="multi"]').first().within(() => {
            cy.get('[data-cy="filter-pill"]').then(($pills) => {
              cy.wrap($pills[0]).click()
              cy.wrap($pills[1]).click()
              cy.wrap($pills[0]).should('have.attr', 'data-active', 'true')
              cy.wrap($pills[1]).should('have.attr', 'data-active', 'true')
            })
          })
        })
      })

      it('two-option groups are single-select: picking one replaces the other, re-picking clears', () => {
        cy.get('body').then(($b) => {
          if ($b.find('[data-cy="pill-group"][data-select="single"]').length === 0) return
          cy.get('[data-cy="pill-group"][data-select="single"]').first().within(() => {
            cy.get('[data-cy="filter-pill"]').then(($pills) => {
              cy.wrap($pills[0]).click().should('have.attr', 'data-active', 'true')
              cy.wrap($pills[1]).click()
              cy.wrap($pills[1]).should('have.attr', 'data-active', 'true')
              cy.wrap($pills[0]).should('have.attr', 'data-active', 'false') // replaced, not added
              cy.wrap($pills[1]).click().should('have.attr', 'data-active', 'false') // re-pick clears to all
            })
          })
        })
      })

      it('only multi-select (3+) groups expose All / None shortcuts', () => {
        cy.get('body').then(($b) => {
          if ($b.find('[data-cy="pill-group"][data-select="multi"]').length) {
            cy.get('[data-cy="pill-group"][data-select="multi"]').first().within(() => {
              cy.get('[data-cy="pill-select-all"]').click()
              cy.get('[data-cy="filter-pill"]').each(($p) =>
                cy.wrap($p).should('have.attr', 'data-active', 'true'),
              )
              cy.get('[data-cy="pill-select-none"]').click()
              cy.get('[data-cy="filter-pill"]').each(($p) =>
                cy.wrap($p).should('have.attr', 'data-active', 'false'),
              )
            })
          }
          if ($b.find('[data-cy="pill-group"][data-select="single"]').length) {
            cy.get('[data-cy="pill-group"][data-select="single"]').first()
              .find('[data-cy="pill-select-all"]').should('not.exist')
          }
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

    ranges.forEach(({ group, label: groupLabel, unit, valueAttr }) => {
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
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]
            setSlider(group, 'min', median)
            cy.get('[data-cy="gear-card"]').its('length').should('be.lte', allItems.length)
          })
        })

        it('setting a max value reduces the card count', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]
            setSlider(group, 'max', median)
            cy.get('[data-cy="gear-card"]').its('length').should('be.lte', allItems.length)
          })
        })

        it('resetting the thumbs restores the full card count', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]
            setSlider(group, 'min', median)
            // Slide the min thumb back to its domain floor → constraint removed.
            clearSlider(group, 'min')
            cy.get('[data-cy="gear-card"]').should('have.length', allItems.length)
          })
        })

        it('items outside the min–max range are excluded', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
            if (values.length < 3) return

            const lo = values[Math.floor(values.length * 0.25)]
            const hi = values[Math.floor(values.length * 0.75)]

            setSlider(group, 'min', lo)
            setSlider(group, 'max', hi)
            // Barrier: wait for the filter to shrink the list before inspecting.
            cy.get('[data-cy="gear-card"]').should('have.length.lessThan', allItems.length)

            // Read the actual thumb values (the slider snaps to its step), so the
            // bounds check matches exactly what was committed.
            const scope = `[data-cy="filter-group"][data-group="${group}"]`
            const attr = valueAttr ?? `data-${group.replace(/_/g, '-')}`
            cy.get(scope).find('[data-cy="range-min"]').invoke('val').then((aLo) => {
              cy.get(scope).find('[data-cy="range-max"]').invoke('val').then((aHi) => {
                const min = Number(aLo)
                const max = Number(aHi)
                cy.get('[data-cy="gear-card"]').each(($card) => {
                  const raw = $card.attr(attr)
                  if (raw && raw !== '') {
                    expect(Number(raw)).to.be.gte(min)
                    expect(Number(raw)).to.be.lte(max)
                  }
                })
              })
            })
          })
        })

        it('the item-count label matches the number of filtered cards', () => {
          cy.fetchAllItems(apiPath).then((allItems) => {
            const values = (allItems as Record<string, unknown>[])
              .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
            if (values.length < 2) return

            const median = values[Math.floor(values.length / 2)]
            setSlider(group, 'min', median)

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
      // Activate the last pill of every group that actually has options (some
      // enum fields are all-null in the data → zero pills). Stacking these
      // incompatible constraints drives the list toward empty.
      pills.forEach(({ group }) => {
        cy.get(`[data-cy="filter-group"][data-group="${group}"]`).then(($g) => {
          const $pills = $g.find('[data-cy="filter-pill"]')
          if ($pills.length > 0) cy.wrap($pills.last()).click()
        })
      })
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

    it('clear-filters resets the range sliders to their full span', () => {
      if (ranges.length === 0) return
      const group = ranges[0].group
      cy.fetchAllItems(apiPath).then((allItems) => {
        const values = (allItems as Record<string, unknown>[])
          .map(i => i[group]).filter(v => v != null).map(Number).sort((a, b) => a - b)
        if (values.length < 2) return
        setSlider(group, 'min', values[Math.floor(values.length / 2)])
        cy.get('[data-cy="clear-filters"]').first().click()
        // The min thumb returns to the domain floor (its `min` attribute).
        cy.get(`[data-cy="filter-group"][data-group="${group}"]`)
          .find('[data-cy="range-min"]')
          .should(($el) => expect($el.val()).to.eq($el.attr('min')))
      })
    })
  })
})

// ── No classification filter ──────────────────────────────────────────────────
// The ISA highline class is a property of ISA certification, not an independent
// axis of the catalogue: an uncertified webbing may compute a class from its
// fibers and strength, but ISA never granted it. Filtering the whole grid by it
// would imply otherwise, so the sidebar has no Classification group at all —
// ISA Certified is the filter for the letter classes, and Breaking Strength
// already covers the sub-22 kN "Not for Highline" case. The class shows as a
// badge on the items that earn one instead.

describe('Webbing classification is not a filter', () => {
  it('has no Classification group in the sidebar', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    cy.get('[data-cy="filter-group"][data-group="classification"]').should('not.exist')
    cy.get('[data-cy="filter-sidebar"]').should('not.contain.text', 'Classification')
  })
})

// ── Webbing stretch filter (custom widget) ────────────────────────────────────
//
// stretch is stored as a JSON string: '[{"kn": 0, "percent": 0.0}, {"kn": 10, "percent": 14.97}]'
// It is not a scalar — it's a curve. The filter widget is:
//
//   ┌─ Stretch at ──────────────────────────────┐
//   │  [5 kN] [10 kN] [12 kN] [15 kN] [20 kN]  │  ← single-select pills, populated from data
//   │  Min %  [___]   Max %  [___]               │  ← range inputs for % at the selected kN
//   └───────────────────────────────────────────┘
//
// Rules:
//   - kN pills are populated dynamically from the union of all kN values in the dataset.
//   - NOTHING is selected on load. The widget starts fully disengaged: no pill is
//     active, it does not filter, and cards carry no data-stretch-percent until a
//     kN is explicitly clicked.
//   - When a kN pill is selected, only webbings that have a data point at that kN are
//     eligible (others are excluded regardless of the % range).
//   - Min/Max % further narrows within the eligible set.
//   - Clicking the engaged pill deselects it, returning the widget to inactive.

describe('Webbing stretch filter', () => {
  const api = () => Cypress.env('apiUrl')

  // Helper: parse stretch JSON and return kN values present in a single item.
  // Skip malformed points with no numeric kn (some data has stray {percent}
  // entries) — the widget excludes them too, so they must not count as pills.
  function parseKnValues(stretchJson: string | null): number[] {
    if (!stretchJson) return []
    try {
      const points: { kn: number; percent: number }[] = JSON.parse(stretchJson)
      return points.map(p => p.kn).filter((k): k is number => typeof k === 'number')
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

  // Helper: the kN → webbing-count map across the whole dataset.
  function knFrequency(webbings: Record<string, unknown>[]): Map<number, number> {
    const freq = new Map<number, number>()
    webbings.forEach(w => {
      new Set(parseKnValues(w.stretch as string | null)).forEach(k => {
        freq.set(k, (freq.get(k) ?? 0) + 1)
      })
    })
    return freq
  }

  // Helper: the top-5 reference kN points the widget must offer — 0 kN dropped,
  // integers only, ranked by webbing count (ties toward the smaller kN). Mirrors
  // src/utils/stretch.ts topKnPoints. Returns [{kn, count}] in that ranked order.
  function topKnPoints(webbings: Record<string, unknown>[], n = 5): { kn: number; count: number }[] {
    return [...knFrequency(webbings).entries()]
      .filter(([kn]) => kn !== 0 && Number.isInteger(kn))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, n)
      .map(([kn, count]) => ({ kn, count }))
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

  it('shows only the top-5 kN points as pills (integers, no 0 kN)', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const top = topKnPoints(all as Record<string, unknown>[])
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .should('have.length', top.length)
    })
  })

  it('pill labels are exactly the top-5 kN values (no phantom / non-top values)', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const topKns = topKnPoints(all as Record<string, unknown>[]).map(p => p.kn)

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').then(($pills) => {
          const shown = [...$pills].map(p => Number(p.getAttribute('data-kn')))
          expect([...shown].sort((a, b) => a - b)).to.deep.equal([...topKns].sort((a, b) => a - b))
        })
    })
  })

  it('never offers 0 kN or non-integer kN as a pill', () => {
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').each(($pill) => {
        const kn = Number($pill.attr('data-kn'))
        expect(kn).to.not.equal(0)
        expect(Number.isInteger(kn)).to.equal(true)
      })
  })

  it('each pill shows the number of webbings with data at that kN', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const counts = new Map(topKnPoints(all as Record<string, unknown>[]).map(p => [p.kn, p.count]))
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').each(($pill) => {
          const kn = Number($pill.attr('data-kn'))
          expect(Number($pill.attr('data-count'))).to.equal(counts.get(kn))
          expect($pill.text()).to.contain(`(${counts.get(kn)})`)
        })
    })
  })

  // ── Counts are contextual ─────────────────────────────────────────────────
  //
  // The kN points and their counts describe the set the OTHER controls leave in
  // play (search + the regular filter groups), not the whole webbing table — so
  // they move as the user narrows. The stretch widget's own kN/% selection is
  // excluded from that context, otherwise engaging a pill would collapse every
  // count to its own number.

  // The most common brand in the dataset — a search term guaranteed to leave a
  // real, smaller subset behind. Mirrors src/utils/search.ts (name OR brand,
  // case-insensitive substring).
  function topBrand(webbings: Record<string, unknown>[]): string {
    const freq = new Map<string, number>()
    webbings.forEach(w => {
      const b = String(w.brand_name ?? '')
      if (b) freq.set(b, (freq.get(b) ?? 0) + 1)
    })
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
  }

  function matchingSearch(webbings: Record<string, unknown>[], q: string) {
    const n = q.trim().toLowerCase()
    return webbings.filter(
      w =>
        String(w.name ?? '').toLowerCase().includes(n) ||
        String(w.brand_name ?? '').toLowerCase().includes(n),
    )
  }

  it('pill counts recompute against the searched subset', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      const brand = topBrand(items)
      const expected = new Map(topKnPoints(matchingSearch(items, brand)).map(p => [p.kn, p.count]))

      cy.get('[data-cy="search-input"]').type(brand)
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').should('have.length', expected.size)
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').each(($pill) => {
          const kn = Number($pill.attr('data-kn'))
          expect(Number($pill.attr('data-count'))).to.equal(expected.get(kn))
        })
    })
  })

  it('pill counts ignore the stretch widget\'s own selection', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const counts = new Map(topKnPoints(all as Record<string, unknown>[]).map(p => [p.kn, p.count]))
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').first().click()
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').each(($pill) => {
          expect(Number($pill.attr('data-count'))).to.equal(counts.get(Number($pill.attr('data-kn'))))
        })
    })
  })

  it('keeps the engaged pill visible even if it drops out of the top-5', () => {
    // Engage a kN, then narrow with a search: whatever the top-5 becomes, the
    // active pill must survive — it is the only way to switch its filter off.
    cy.fetchAllItems('webbing').then((all) => {
      const brand = topBrand(all as Record<string, unknown>[])
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').last().click()
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"][data-active="true"]')
        .invoke('attr', 'data-kn').then((kn) => {
          cy.get('[data-cy="search-input"]').type(brand)
          cy.get('[data-cy="filter-group"][data-group="stretch"]')
            .find(`[data-cy="stretch-kn-pill"][data-kn="${kn}"][data-active="true"]`)
            .should('exist')
        })
    })
  })

  it('the stretch sort kN options follow the searched subset', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const items = all as Record<string, unknown>[]
      const brand = topBrand(items)
      const expected = topKnPoints(matchingSearch(items, brand)).map(p => p.kn).sort((a, b) => a - b)

      cy.get('[data-cy="search-input"]').type(brand)
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="stretch-sort-kn"]').click()
      cy.get('[data-cy="stretch-sort-kn-option"]').then(($opts) => {
        const shown = [...$opts].map(o => Number(o.getAttribute('data-kn'))).sort((a, b) => a - b)
        expect(shown).to.deep.equal(expected)
      })
    })
  })

  // ── Default selected kN ───────────────────────────────────────────────────

  it('defaults to NO kN pill selected', () => {
    // The widget starts fully disengaged: nothing is pre-selected, so a fresh
    // load neither filters nor implies a reference kN. A kN becomes active only
    // on an explicit click.
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]')
      .should('have.length.gte', 1)

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('not.exist')
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
    // Starts with none active; engaging one, then another, never yields two.
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .should('not.exist')

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()

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
    // Nothing is selected on load, so engage a pill first, then click that same
    // engaged pill to toggle the widget back off.
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()

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

      // Find a TOP-5 kN that some (but not all) webbings have data for — only
      // top points are offered as pills now.
      const partial = topKnPoints(webbings)
        .find(({ count }) => count > 0 && count < webbings.length)

      if (!partial) return // skip if every top kN is present on every webbing (unlikely)

      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find(`[data-cy="stretch-kn-pill"][data-kn="${partial.kn}"]`).click()

      cy.get('[data-cy="gear-card"]').should('have.length', partial.count)
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

      // Activate the most common kN (nothing is selected until clicked)
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]')
        .contains(`${mostCommonKn}`).click()

      setSlider('stretch', 'min', median)

      cy.get('[data-cy="gear-card"]')
        .its('length').should('be.lte', percents.length)
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

      setSlider('stretch', 'max', median)

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
    const stretch = '[data-cy="filter-group"][data-group="stretch"]'
    cy.get(stretch).find('[data-cy="stretch-kn-pill"]').first().click()
    // Move the % min thumb off its floor (up to the domain ceiling).
    cy.get(stretch).find('[data-cy="range-max"]').invoke('attr', 'max').then((hi) => {
      setSlider('stretch', 'min', Number(hi))
    })

    cy.get('[data-cy="clear-filters"]').first().click()

    cy.get(stretch).find('[data-cy="stretch-kn-pill"][data-active="true"]').should('not.exist')
    // The % min thumb returns to its domain floor.
    cy.get(stretch).find('[data-cy="range-min"]')
      .should(($el) => expect($el.val()).to.eq($el.attr('min')))
  })

  it('restores the full webbing list when the stretch filter is cleared', () => {
    cy.fetchAllItems('webbing').then((all) => {
      cy.get('[data-cy="filter-group"][data-group="stretch"]')
        .find('[data-cy="stretch-kn-pill"]').first().click()
      cy.get('[data-cy="clear-filters"]').first().click()
      cy.get('[data-cy="gear-card"]').should('have.length', all.length)
    })
  })

  // ── Sort by stretch at a top-5 kN (decoupled from the filter pill) ─────────

  it('the sort dropdown exposes a Stretch sort row without needing a filter pill', () => {
    cy.get('[data-cy="sort-dropdown"]').click()
    cy.get('[data-cy="sort-stretch-row"]').should('exist')
    cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
      .should('exist')
    cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="desc"]')
      .should('exist')
  })

  it('the stretch kN secondary dropdown lists exactly the top-5 kN points', () => {
    cy.fetchAllItems('webbing').then((all) => {
      const topKns = topKnPoints(all as Record<string, unknown>[]).map(p => p.kn)
      cy.get('[data-cy="sort-dropdown"]').click()
      cy.get('[data-cy="stretch-sort-kn"]').click()
      cy.get('[data-cy="stretch-sort-kn-option"]').then(($opts) => {
        const shown = [...$opts].map(o => Number(o.getAttribute('data-kn')))
        expect([...shown].sort((a, b) => a - b)).to.deep.equal([...topKns].sort((a, b) => a - b))
      })
    })
  })

  it('sorting by Stretch Low→High orders cards ascending by % at the chosen kN', () => {
    // Cards only carry data-stretch-percent while a kN pill is ENGAGED — nothing
    // is selected on load — so engage one first, then point the stretch sort at
    // that same kN. Reading each card's own attribute is reliable per-card,
    // unlike mapping by webbing name (names are not unique).
    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"]').first().click()

    cy.get('[data-cy="filter-group"][data-group="stretch"]')
      .find('[data-cy="stretch-kn-pill"][data-active="true"]')
      .invoke('attr', 'data-kn')
      .then((kn) => {
        cy.get('[data-cy="sort-dropdown"]').click()
        cy.get('[data-cy="stretch-sort-kn"]').click()
        cy.get(`[data-cy="stretch-sort-kn-option"][data-kn="${kn}"]`).click()
        cy.get('[data-cy="sort-stretch-row"] [data-cy="sort-option"][data-field="stretch"][data-direction="asc"]')
          .click()
      })

    cy.get('[data-cy="gear-card"][data-stretch-percent]').should(($cards) => {
      const percents = [...$cards]
        .map(c => c.getAttribute('data-stretch-percent'))
        .filter((v): v is string => v != null && v !== '')
        .map(Number)
      expect(percents).to.deep.equal([...percents].sort((a, b) => a - b))
    })
  })
})

// ── ISA Certified visibility (data-driven) ────────────────────────────────────
// The ISA Certified toggle is dropped for gear types where nothing is certified
// (a lone "No" is useless), and shown where at least one item is certified.

describe('ISA Certified filter visibility', () => {
  it('is HIDDEN for a type with no certified gear (rollers)', () => {
    cy.visit('/rollers')
    cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    cy.get('[data-cy="filter-group"][data-group="isa_certified"]').should('not.exist')
  })

  it('is HIDDEN for starter kits and trickline kits (none certified)', () => {
    cy.visit('/starterkits')
    cy.get('[data-cy="filter-group"][data-group="isa_certified"]').should('not.exist')
    cy.visit('/tricklinekits')
    cy.get('[data-cy="filter-group"][data-group="isa_certified"]').should('not.exist')
  })

  it('is SHOWN for types that have certified gear (webbings, leash rings)', () => {
    cy.visit('/webbings')
    cy.get('[data-cy="filter-group"][data-group="isa_certified"]').should('exist')
    cy.visit('/leashrings')
    cy.get('[data-cy="filter-group"][data-group="isa_certified"]').should('exist')
  })
})

// ── TreePro "Sold As" label capitalization ────────────────────────────────────

describe('TreePro Sold As labels', () => {
  it('capitalizes the pair / single pill labels', () => {
    cy.visit('/treepros')
    cy.get('[data-cy="filter-group"][data-group="price_unit"]')
      .find('[data-cy="filter-pill"]').then(($pills) => {
        const labels = [...$pills].map(p => (p.textContent ?? '').trim())
        expect(labels.length).to.be.gte(1)
        labels.forEach(l => expect(l).to.match(/^[A-Z]/)) // each starts uppercase
        expect(labels).to.include.members(['Pair', 'Single'])
      })
  })
})

// ── Trickline kit weight is not filterable ────────────────────────────────────

describe('Trickline kit weight filter', () => {
  it('trickline kits have NO Kit Weight range filter (only 2 of 9 have data)', () => {
    cy.visit('/tricklinekits')
    cy.get('[data-cy="filter-sidebar"]').should('be.visible')
    cy.get('[data-cy="filter-group"][data-group="weight"]').should('not.exist')
  })

  it('starter kits DO keep the Kit Weight filter', () => {
    cy.visit('/starterkits')
    cy.get('[data-cy="filter-group"][data-group="weight"]').should('exist')
  })
})

// ── Editable range-slider bound labels ────────────────────────────────────────
// The min/max value labels below each slider are click-to-edit: one click turns
// the value into a numeric input; typing a value and committing moves the thumb.

describe('Editable slider bounds — Webbing width', () => {
  beforeEach(() => {
    cy.visit('/webbings')
  })

  it('clicking the min value label reveals an editable number input', () => {
    const scope = '[data-cy="filter-group"][data-group="width"]'
    cy.get(scope).find('[data-cy="range-min-value"]').should('have.attr', 'data-editing', 'false').click()
    cy.get(scope).find('[data-cy="range-min-value"]').should('have.attr', 'data-editing', 'true')
    cy.get(scope).find('input[data-cy="range-min-value"]').should('be.visible')
  })

  it('typing a new min value moves the min thumb to that value', () => {
    const scope = '[data-cy="filter-group"][data-group="width"]'
    // Wait for the data-driven domain to load.
    cy.get(scope).find('[data-cy="range-max"]').should(($el) => {
      expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
    })
    cy.get(scope).find('[data-cy="range-min"]').invoke('attr', 'min').then((lo) => {
      const target = Number(lo) + 2
      cy.get(scope).find('[data-cy="range-min-value"]').click()
      cy.get(scope).find('input[data-cy="range-min-value"]').clear().type(`${target}{enter}`)
      cy.get(scope).find('[data-cy="range-min"]').should('have.value', `${target}`)
    })
  })

  it('committing an out-of-range min value is clamped, not rejected', () => {
    const scope = '[data-cy="filter-group"][data-group="width"]'
    cy.get(scope).find('[data-cy="range-max"]').should(($el) => {
      expect(Number($el.attr('max'))).to.be.greaterThan(Number($el.attr('min')))
    })
    cy.get(scope).find('[data-cy="range-min-value"]').click()
    cy.get(scope).find('input[data-cy="range-min-value"]').clear().type('99999{enter}')
    // Clamped to at most the current max thumb value.
    cy.get(scope).find('[data-cy="range-min"]').then(($min) => {
      cy.get(scope).find('[data-cy="range-max"]').then(($max) => {
        expect(Number($min.val())).to.be.lte(Number($max.val()))
      })
    })
  })
})
