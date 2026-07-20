# SlackData — Design Spec

A word picture for the frontend. Edit this before any Cypress tests are written.
References: climbing-gear.com (layout/UX) + slacklineinternational.org (color identity).

---

## Color Palette

| Role | Color | Notes |
|------|-------|-------|
| Page background | warm off-white `#F8F7F4` | Not pure white — slightly cream, like climbing-gear.com |
| Card surface | white `#FFFFFF` | Cards pop against the warm background |
| Primary / interactive | ISA teal `#00897B` | Active nav tabs, pill focus ring, filter dot accents, sidebar section dots |
| Price / buy CTA | amber-orange `#E8770A` | Borrowed from climbing-gear.com; universally reads as "cost" |
| Coral accent | ISA coral `#D04A3E` | From the ISA logo mark — used in the ISA Approved stamp. (Reserved for a future gear-type badge on mixed-type views, e.g. manufacturer pages.) |
| Feature tags | light gray `#F0F0F0` bg, `#555` text | ISA certified, Dry-rated, etc. |
| Body text | near-black `#1A1A1A` | Product names, headings |
| Secondary text | medium gray `#6B7280` | Brand names (all-caps), spec labels, metadata |
| Border / divider | very light gray `#E5E7EB` | Card border, row dividers in detail spec table |
| Page header bg | white `#FFFFFF` | Clean white bar like ISA site |

---

## Typography

Single sans-serif family throughout (Inter or system-ui).

- **Product names / headings**: bold, near-black, ~16px on cards / ~24px on detail page
- **Brand names**: small-caps, uppercase, medium-gray, ~11px — sits above the product name
- **Sidebar section labels**: all-caps, tight letter-spacing, small (~11px), medium-gray — "ROPE TYPE" style from climbing-gear.com
- **Spec values** (inline on card): small, ~12px, medium-gray, separated by a centered dot `·`
- **Prices**: bold, amber-orange, ~16px on cards / ~20px on detail page
- **Button text**: small, ~12px, same color as border when outlined

---

## Page Header / Top Nav

White bar, full-width, subtle bottom border.

Left: "SlackData" wordmark (or ISA-style logo lockup with slackline icon).

Center (or just right of logo): horizontal gear-type tabs —
`Webbings · Weblocks · Leash Rings · Grips · Rollers · Tree Protectors · Starter Kits · Trickline Kits`

Active tab: teal underline (2px) + teal text. Inactive: gray text, no underline. No background fill on tabs.

Right: currency selector (US USD style dropdown like climbing-gear.com), heart/saved icon, account icon.

---

## Gear Listing Page Layout

Two-column layout: left filter sidebar + right content area.

### Left Filter Sidebar (~280px wide)

Header: "FIND YOUR [GEAR TYPE]" in small gray all-caps at the top.

Each filter group:
- Small colored dot (teal) + section label in all-caps gray (e.g. "MATERIAL TYPE")
- Filter options rendered as **outlined pill/chip buttons** — not checkboxes.
- Pills are inactive by default (white bg, gray border, gray text). Active = teal border + teal text + very light teal bg (`#E0F2F1`).
- Groups are collapsible (arrow on the right).

**Pill selection mode depends on how many options a group has** (derived from the data at render time; the group carries `data-select="single|multi"`):
- **Exactly 2 options → single-select** (a radio with a clear): picking one replaces the other, and re-clicking the active pill clears the group back to "all". Applies to every boolean Yes/No group and any 2-value enum (e.g. Tree Protector "Sold As", Slider/Bearing Material on rollers).
- **3+ options → multi-select** (OR within the group) with subtle **All / None** shortcuts (`data-cy="pill-select-all"` / `pill-select-none`) above the pills — All selects every option, None clears the group.

**Hidden pill groups.** A boolean group is dropped entirely when nothing in the data is `true` — e.g. no roller / starter-kit / trickline-kit is ISA certified, so their "ISA Certified" toggle is omitted rather than showing a lone, useless "No". Empty enum groups (e.g. `isa_warning`, which currently has no data anywhere) still render — they're valid, forthcoming fields.

Filter groups per gear type — verified against `slack_data/models/*.py` and `utilities/`.

Three filter control types:
- **Pill toggle** — enum and boolean fields; single- or multi-select per the rule above
- **Range slider** — numeric fields (float or int); rendered as a **dual-thumb slider** (two overlaid `<input type="range">`, min thumb `data-cy="range-min"`, max thumb `data-cy="range-max"`), domain = the data's [min, max], `step="any"`. A thumb parked at its domain bound means "no constraint". The two value labels below the track (`data-cy="range-min-value"` / `range-max-value`) are **click-to-edit**: one click turns the number into an inline numeric input (commit on Enter/blur, cancel on Escape) so an exact bound can be typed without dragging; out-of-range values are clamped, not rejected. This is the standard control for every min/max filter (weight, breaking strength, diameters, widths, dimensions, kit weight, and the stretch %).
- **Stretch at X kN** — webbing-only custom widget (see below)

**Pill order within a group** — values are alphabetical by default, with catch-all buckets ("Other",
"Unknown") always sinking to the bottom. Groups whose domain is *ranked* rather than alphabetical
declare an explicit order instead: **Classification is `A+ · A · B · C · Not for Highline`**,
mirroring `_CLASSIFICATION_RANK` in `slack_data/models/webbing.py`. This is not cosmetic — sorting
those values alphabetically puts `A` before `A+`, because a string is a prefix of itself plus a
suffix. Values absent from an explicit order sort after it, alphabetically.

Excluded from filters: `name`/`description`/`notes` (search), `release_date`, `product_url`, `version`, `currency` (not a UX-meaningful filter), `colors` (comma-separated string needing split logic — future work), `stretch` on webbing (JSON blob of {kn,percent} pairs — exposed as a "has stretch data" pill instead), `width` on rollers (raw string like "25–35mm", not a numeric field).

**Webbings:** Material Type [pill] · Width mm [range] · Classification [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g/m [range] · Breaking Strength kN [range] · **Stretch at X kN** [custom — see below]

**Weblocks:** Material [pill] · Min Width mm [range] · Front Pin [pill] · Attachment Point [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]

**Leash Rings:** Material [pill] · ISA Certified [pill] · ISA Warning [pill] · Inner Diameter mm [range] · Outer Diameter mm [range] · Weight g [range] · Breaking Strength kN [range]

**Grips:** Material [pill] · Min Width mm [pill] · Connection Type [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · WLL kN [range] · MBS kN [range] · Slipping Threshold kN [range]

**Rollers:** Frame Material [pill] · Roller Material [pill] · Slider Type [pill] · Lock Type [pill] · Bearing Material [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]  _(ISA Certified hidden — no roller is certified)_

**Tree Protectors:** Sling Attachment [pill] · Sold As [pill — labels title-cased: Pair / Single] · Weight g [range] · Width cm [range] · Length cm [range] · Thickness mm [range]

**Starter Kits:** Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill] · Kit Weight g [range]  _(ISA Certified hidden — none certified)_

**Trickline Kits:** Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill]  _(ISA Certified hidden — none certified; Kit Weight NOT filterable — only 2 of 9 have weight data)_

**Manufacturers sidebar:** Continent [pill] · Slackline-Focused [pill]

### Stretch at X kN filter (webbings only)

The `stretch` field is a JSON array of `{kn, percent}` pairs — a curve, not a scalar. The filter widget has two parts:

```
┌─ Stretch at ──────────────────────────────────────┐
│  [►10 kN (167)] [5 kN (61)] [6 kN (54)] …         │  ← single-select kN pills (top 5), with webbing counts
│  Min %  [      ]   Max %  [      ]                 │  ← % range at the selected kN
└───────────────────────────────────────────────────┘
```

Rules:
- kN pills show only the **top 5 reference points**, chosen from the data: **0 kN is excluded** (every curve reads 0% there — a useless data point), **only integer kN qualify**, and the five are ranked by how many webbings carry a data point at that kN (ties broken toward the smaller kN). Each pill shows that **webbing count** in parentheses, e.g. `10 kN (167)`.
- **Nothing is selected by default.** The widget loads fully disengaged: no pill is active, the % slider is inert, and it does not filter. A kN becomes active only on an explicit click. (There is no "default reference kN" — a pre-selected hint rendered a pill as active on load, implying a filter that wasn't applied.)
- When a kN pill is active, only webbings that have a data point at exactly that kN are eligible; others are excluded
- The min/max % range further narrows within eligible webbings
- Deselecting the kN pill (clicking active pill) makes the widget fully inactive — all webbings show again
- Changing the selected kN resets the % range inputs
- Cards carry a `data-stretch-percent` attribute (% at the engaged kN) **only while a kN pill is engaged** — on a fresh load no card carries it
- Sorting by stretch is handled by the sort dropdown's own secondary kN picker, **decoupled** from this filter widget — see Sort options below

---

### Sort options

Rule: **only numeric fields are sortable**. Enums (material, classification, etc.) and booleans (isa_certified, etc.) are filter-only — they appear as pills in the sidebar but never in the sort dropdown.

Sort options use `data-field` + `data-direction` attributes on the `[data-cy="sort-option"]` elements so tests can target them precisely. Cards carry `data-{field-name}="<value>"` attributes (empty string when null) for order verification.

Null-last in both directions: items where the field is null always appear below items with real values, regardless of whether the sort is ascending or descending.

**Name is the default sort AND the universal tie-breaker.** A fresh load (no sort chosen) is alphabetical by name ascending. On every numeric sort, items with **equal values** — and the order among null/blank values — fall back to **name ascending** (regardless of the numeric direction). So e.g. MBS High→Low lists equal-MBS grips A→Z.

**All types — always present:**
- Name A→Z / Z→A
- Price Low→High / High→Low _(null-last)_
- Weight Low→High / High→Low _(null-last)_

**Webbings:** + Width · Breaking Strength · **Stretch at X kN** _(secondary kN picker — see below)_
**Weblocks:** + Min Width · Breaking Strength
**Leash Rings:** + Inner Diameter · Outer Diameter · Breaking Strength
**Grips:** + Min Width · WLL · MBS · Slipping Threshold
**Rollers:** + Breaking Strength
**Tree Protectors:** + Width · Length · Thickness
**Starter Kits:** + Webbing Length · Webbing Width
**Trickline Kits:** + Webbing Length · Webbing Width

**Stretch sort (webbings only):**
- The dropdown always carries a single **Stretch** row (`data-cy="sort-stretch-row"`) for webbings — it does **not** depend on the filter widget's kN selection.
- The kN is a **nested secondary dropdown** (`data-cy="stretch-sort-kn"`, options `data-cy="stretch-sort-kn-option"`): the clickable number offers the **top-5 kN points** (same set as the filter pills). Default = the most common point.
- Below it, Low→High / High→Low (`data-field="stretch"`, `data-kn="<kn>"`) order by the % at the chosen kN. The underlying sort field is encoded as `stretch@<kn>`.
- Webbings without data at the chosen kN sort to the bottom (null-last, name tie-break) but are **not excluded** — they remain visible unless a % range filter is also active.

### Above the Card Grid

Full-width search bar (rounded, light border, teal focus ring) on the left.

Right side: `Cards | Detailed` toggle (two pill buttons, Cards active by default) + item count (`145 items`) + `SORT BY` dropdown.

Below this row, a subtle `145 items` count left-aligned, above the grid itself.

### Card Grid

3 columns default. 2 on medium screens. 1 on mobile.
Cards: white, border-radius ~14px, very subtle shadow (`0 1px 3px rgba(0,0,0,0.08)`), thin `#E5E7EB` border.
Hover: shadow deepens slightly.

### Detailed View

The second listing mode. Where Cards give a scannable summary, Detailed gives the **whole spec
sheet for every match at once** — you scroll the list instead of clicking into items one at a time.
This replaces the old `Chart` table view: a table forced every gear type into the same handful of
columns, which meant the specs that actually distinguish products were the ones it dropped.

- **One full-width panel per item**, stacked vertically with the same 20px gutter as the grid.
  Panel chrome matches a card exactly: white, ~14px radius, thin `#E5E7EB` border, subtle shadow
  that deepens on hover.
- Panels stack down the page and the **page's own scrollbar** moves through them — no inner scroll
  region, no fixed-height viewport. The filter sidebar and toolbar scroll away normally.
- **Every panel is fully expanded.** Nothing is collapsed or behind a disclosure — the point of the
  mode is that you never have to click to see a spec.
- Panel content is **identical to the Gear Detail Page body** (see below): image carousel left;
  brand, product name, classification bubble, price, ISA warning banner, ISA certification block
  and the full specification grid right; description and `View product →` full width beneath. The
  two are literally the same component, so a spec row added to one appears in the other.
- Two wiring differences from the standalone detail page: the **product name is a link** to that
  item's detail page, and the panel carries the card's **`♡ Save` / `🔔 Alert` / `⧉ Compare`** row
  (next to `View product →`), so those actions work from either view.
- Filters, search and sort apply identically in both modes — same items, same order, different
  density. The view choice is **local state**: it resets to Cards on navigation and is not encoded
  in the URL.

---

## Gear Card Anatomy (top → bottom)

**Image area** (top ~40% of card):
- White or very light gray bg
- Product image centered (placeholder: rope/webbing icon in low-opacity gray)
- **No gear-type badge.** Each listing shows a single gear type, so labelling every card "ROLLER" on the rollers page is redundant. Reintroduce a coral gear-type pill (top-left, absolute) only on views that mix types — e.g. manufacturer pages.
- **Top-right overlay stack** (absolute, ~8px from the top-right corner, stacked vertically with ~6px gaps, right-aligned):
  1. **Classification bubble** — webbing only, when `classification` is set. Identical component, colors and shape to the detail page's bubble (see § Classification bubble) — the ISA highline class is the fastest read on a webbing card, so it belongs in the grid, not just one click deep. Omit entirely when the field is null; other gear types have no `classification` field and never show it.
  2. **ISA Approved badge** — the miniature stamp, when `isa_certified` is true (see below).

**Content area** (bottom ~60%):
- Brand name: small-caps gray, ~11px, ~4px below image area
- Product name: bold near-black, ~15px, clickable → detail page
- Key specs inline row: small gray text with `·` separators — e.g. `25mm · 280g/m · MBS 32kN`
- Feature tag pills: light gray bg, dark-gray text, small rounded pills — e.g. `Dyneema`, `Tubular`
- **ISA Approved badge** — if `isa_certified` is true, show a miniature version of the ISA Approved stamp in the top-right overlay stack of the image area (under the classification bubble when both are present). The stamp replicates the official badge: dark charcoal frame, ISA geometric mark (teal + coral), bold white "APPROVED" text, teal checkmark in the V. If false, omit entirely — no "Not certified" label on cards.
- Price: bold amber-orange — e.g. `$84 → Buy` (the "→ Buy" in slightly smaller amber text)
- **Bottom action row**: three equal-width outlined buttons spanning full card width — `♡ Save`, `🔔 Alert`, `⧉ Compare`. Light gray border, gray text. Hover: teal border + teal text.

---

## Gear Detail Page

Max-width centered container (~1024px), left-aligned back link. The body is a **two-column split**:
image carousel on the left (~320px), and on the right the brand / product name (+ classification
bubble) / price header, the ISA warning banner, the ISA certification block and the specification
grid — so the specs wrap around the title rather than sitting in a slab beneath it. Description and
`View product →` run full width below the split. Collapses to a single column below `sm`.

**Order within the right column matters** and is asserted geometrically by `isa_certification.cy.ts`:
name → ISA warning banner → ISA certification block → spec grid. Keeping the banner and cert block
inside the right column (rather than below the whole split) is deliberate: it holds a safety warning
next to the product name instead of burying it under the spec grid.

**Back link**: `← Webbings` in small gray text, hover teal.

**Main card** (white, rounded, shadow):

The body of this card (everything below the back link) is the **same component the Detailed view
renders per item** — see § Detailed View. Keep the two in sync by changing the shared component,
never by editing one side.

**Header block** (same for all types):
- Image area: light gray bg band (~200px tall, ~290px at `sm`+). Images **fill the frame vertically**
  (`object-cover`, no padding) rather than being letterboxed — product shots carry a lot of dead
  white space, and `object-contain` left grey bands above and below. The long axis is cropped; these
  are centered product shots, so the subject survives. Same treatment on the listing cards. Uses the
  **same multi-image
  carousel the cards use** — prev/next arrows and one dot per image, browsing every image we hold
  for the product. Single-image products render the bare image with no chrome; products with no
  image show a low-opacity "No image" placeholder.
- Brand name in small-caps gray
- Product name in bold ~24px
- Price in bold amber-orange ~20px — omit row entirely if null. Tree protectors append the price unit in small gray: `$45 per pair`

**ISA Warning banner** — if `isa_warning` is set, show a full-width amber warning strip below the header block (before specs), with a ⚠ icon and the warning text. Tree protectors have no `isa_warning` field — omit entirely.

**"SPECIFICATIONS" label** — small-caps gray with teal dot, then the spec grid: **two balanced columns** of label/value pairs (`gap-x-10`), collapsing to one column on narrow screens. Within each cell: label left (gray), value right (dark), `border-bottom: 1px solid #E5E7EB`, `padding: 10px 0`. Omit any row where the value is null. The webbing stretch curve is the one full-width entry — it spans both columns.

**Classification bubble** — the ISA highline class sits as a colored bubble immediately right of the product name, not in the spec grid. The same bubble is overlaid top-right on the card's image area in the listing grid (see § Gear Card Anatomy) — one component, so the two can never drift apart. Colors are taken from the ISA's own [webbing type graphic](https://www.slacklineinternational.org/wp-content/uploads/2020/02/webbing_type_graphic.png) so they match the chart people already know:

| Class | Fill | | Class | Fill |
|---|---|---|---|---|
| A+ | `#6AA84F` (dark green) | | C | `#F6B26B` (orange) |
| A | `#93C47D` (light green) | | Not for Highline | `#E5E7EB` (neutral gray — not on the ISA chart) |
| B | `#FFD966` (yellow) | | | |

The letter is **dark ink `#1F2937` on every fill**: white text fails WCAG AA on all four ISA colors (contrast 1.37–2.87), while `#1F2937` clears AA on each (5.12–11.86). A+/A/B/C render as round bubbles; the long "Not for Highline" stays a full pill so it isn't truncated. The letter itself carries the meaning, so identity is never colour-alone, and a `title` spells it out for screen readers. For hybrids the class is derived from the strongest component fiber (see Material Composition).

**ISA Certification block** (where applicable, before the spec table) — if `isa_certified` is true, show a larger version of the ISA Approved stamp badge (same visual: charcoal frame, teal + coral ISA mark, white "APPROVED" text with teal checkmark in the V), left-aligned, ~80px wide. If false, show a small gray text line "Not ISA Certified" — subdued, not alarming. Tree protectors have no `isa_certified` field — omit this block entirely.

---

### Spec rows per gear type

**Webbing**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | Enum value as-is: Nylon, Dyneema, etc. |
| Material Composition | `material_composition` | Hybrid webbings only. JSON array of component fiber names — render as a plain slash-joined string, e.g. `Polyester / Dyneema`. Omit the row entirely when null (single-fiber webbings). **Detail spec sheet only — never shown on the card.** |
| Width | `width` | Append "mm" |
| Weight | `weight` | Append "g/m"; omit if null |
| Breaking Strength | `breaking_strength` | Append "kN"; omit if null |
| Stretch | `stretch` | JSON array of {kn, percent} points. **≥ 3 measured points** → a two-row table spanning the full grid width: `Load` across the top, `Stretch` beneath, **one column per measured point** — nothing interpolated, no fixed column set. Ascending by kN; **0 kN is dropped** (every curve reads 0% there); long curves scroll horizontally with the row-label stub pinned left. **1–2 points** → inline text instead, e.g. `3.4% @ 10 kN · 4.7% @ 15 kN` (a one- or two-column table is all chrome, no signal). Row is omitted when there are no *measured* points — note this is stricter than `stretch != null`: a curve like `[{"percent": 8}]` (no `kn`) has nothing to show. |
| Classification | `classification` | **Not a spec row.** Renders as a colored bubble beside the product name — see § Classification bubble below. |
| Colors | `colors` | Comma-separated string — render as small color-name chips |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Weblock**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | MetalMaterial enum value |
| Width Range | `width_min` + `width_max` | "25–35mm" or "25mm" if max is null |
| Weight | `weight` | Append "g" |
| Breaking Strength | `breaking_strength` | Append "kN" |
| Front Pin | `front_pin` | Enum value as-is |
| Attachment Point | `attachment_point` | Enum value as-is |
| Colors | `colors` | Color-name chips |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Grip**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | MetalMaterial enum |
| Width Range | `width_min` + `width_max` | "25–35mm" |
| Weight | `weight` | Append "g" |
| WLL | `wll` | Working Load Limit — append "kN" |
| MBS | `mbs` | Min Breaking Strength — append "kN" |
| Slipping Threshold | `common_slipping_threshold` | Append "kN"; omit if null |
| Connection Type | `connection_type` | Enum value as-is |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Leash Ring**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | MetalMaterial enum |
| Inner Diameter | `inner_diameter` | Append "mm" |
| Outer Diameter | `outer_diameter` | Append "mm" |
| Weight | `weight` | Append "g" |
| Breaking Strength | `breaking_strength` | Append "kN" |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Roller**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Frame Material | `material` | MetalMaterial enum |
| Roller Material | `roller_material` | RollerMaterial enum |
| Slider Type | `slider_type` | Enum value: Moving Plates, Carabiner, etc. |
| Lock Type | `lock_type` | Enum value: Screw Lock, Auto Lock, etc. |
| Bearing Material | `bearing_material` | Enum value |
| Width Range | `width` | String field — show as-is (already a formatted range) |
| Weight | `weight` | Append "g" |
| Breaking Strength | `breaking_strength` | Append "kN" |
| Colors | `colors` | Color-name chips |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Tree Protector**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Weight | `weight` | Append "g" |
| Width | `width` | Append "cm" |
| Length | `length` | Append "cm" |
| Thickness | `thickness` | Append "mm" |
| Sling Attachment | `has_sling_attachment` | "Yes" or omit row if false |
| Price Per | `price_unit` | "single" or "pair" — shown inline with price in header, not as its own spec row |

*No ISA Certified field, no ISA Warning field.*

**Starter Kit**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Webbing Length | `webbing_length` | Append "m" |
| Webbing Width | `webbing_width` | Append "mm" |
| Weight | `weight` | Append "g" |
| Tensioning | `tensioning_type` | Enum: Single Ratchet, Double Ratchet, Primitive, Other |
| Includes Tree Pro | `includes_treepro` | "Yes" or omit if false |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

**Trickline Kit**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Webbing Length | `webbing_length` | Append "m" |
| Webbing Width | `webbing_width` | Append "mm" |
| Weight | `weight` | Append "g" |
| Tensioning | `tensioning_type` | Enum: Single Ratchet, Double Ratchet, Other |
| Includes Tree Pro | `includes_treepro` | "Yes" or omit if false |
| ISA Certified | `isa_certified` | Handled by the ISA Certification block above the spec table — no row needed here |

---

**Footer block** (same for all types):
- Description paragraph in gray, with relaxed line-height — omit if null
- "View product →" button: solid teal pill, white text — links to `product_url`. Omit if null.

---

## Manufacturers Page

Card grid (3 columns, same layout as gear listing).

**The manufacturer card is the gear card's twin.** It reuses the gear card's shell verbatim —
same radius, border, shadow, hover lift, and the same `h-40` centered image area on a
`bg-gray-50` field with an absolutely-positioned overlay stack in the **top-right** corner. What
changes is only what fills those slots: the product shot becomes the **manufacturer logo**, and
the classification/ISA overlay becomes a single **country flag**.

Manufacturer card anatomy (top → bottom):
- **Logo image area** — the brand's logo, centered and letterboxed (`object-contain`) in the same
  `h-40` gray field the gear cards use. Brands with no logo fall back to the shared image
  placeholder rather than collapsing the area, so every card in a row is the same height.
- **Country flag, top-right overlay** — a small (~24×16) rounded flag chip with a hairline border,
  in the exact slot the gear card's classification bubble occupies. Flag only, no country label:
  the name is redundant next to the flag and the row has no space for it. The country name goes on
  the flag's `title`/`alt` so it stays available to hover and to screen readers.
- **Brand name** — bold, ~16px, the card's primary line.
- **Slackline badge** — small teal pill when `slackline_focused` is true.
- **Year founded** — small gray, beneath the name; omitted when null.
- **Gear inventory row** — small gray pills, one per type the brand actually stocks:
  `Webbings: 12`, `Weblocks: 4`, … Types with zero are omitted from the pills (a wall of zeroes is
  noise) but still emitted as `data-count-{slug}="0"` on the card root.
- **"View Gear"** — teal outline pill, links to the brand's detail page.

**Default ordering.** Manufacturers list by **total gear count, largest first** — with 56 brands,
the deepest catalogues are the most useful entry point. Name is the tie-break, so the order is
deterministic rather than dependent on API insertion order.

**Country data + flags.** `Brand.country` is the existing `Country` enum (full names —
`"Germany"`, not `"DE"`); the frontend maps that name to an ISO alpha-2 code to resolve
`/flags/{cc}.png`. Flag artwork is vendored from **flagcdn.com** (Flagpedia's public-domain set)
into `frontend/public/flags/`, not hotlinked — the page must not depend on a third-party CDN at
runtime. Logos are vendored likewise into `frontend/public/manufacturer-images/`, keyed by our
**canonical** brand slug so lookup is a pure function of the brand name.

Cards with no country render **no flag at all** — never a placeholder or "unknown" flag. The
country filter group is likewise data-driven: it renders only the country values actually present,
and disappears entirely when none are (see the note in `manufacturers.cy.ts`; there is no
`continent` field anywhere in the schema).

---

## Shared UI Conventions

- **All interactive elements**: cursor pointer, teal focus ring on keyboard nav
- **Border radius**: consistent ~8px for pills, ~14px for cards, ~6px for buttons
- **No sharp rectangles anywhere** — even the large CTA buttons are rounded
- **ISA Certified** always uses the official ISA Approved stamp badge (charcoal frame, teal + coral ISA mark, white "APPROVED", teal checkmark). On cards: miniature stamp ~28px tall, top-right of image area (below the classification bubble when the item has one), only shown when true. On detail page: ~80px wide block above specs, "Not ISA Certified" in subdued gray when false. Never use a plain checkmark or generic pill — the stamp is the trust signal.
- **Empty states**: centered gray icon + short message — e.g. "No webbings match your filters" with a "Clear filters" teal link
- **Loading skeleton**: same card shape as real cards, `animate-pulse` in light gray

---

## What's NOT in scope yet

- User accounts / login
- Review / rating system
- Edit-suggestion workflow
- Compare side-by-side view (button exists, page TBD)
- Homepage stats dashboard
