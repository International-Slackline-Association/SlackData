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
| Category badge | ISA coral `#D04A3E` | From the ISA logo mark — gear-type pill top-left of card image |
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
- Filter options rendered as **outlined pill/chip buttons** — not checkboxes. Multiple selectable.
- Pills are inactive by default (white bg, gray border, gray text). Active = teal border + teal text + very light teal bg (`#E0F2F1`).
- Groups are collapsible (arrow on the right).

Filter groups per gear type — verified against `slack_data/models/*.py` and `utilities/`.

Three filter control types:
- **Pill toggle** — enum and boolean fields; values become toggle buttons (multi-select within a group)
- **Range input** — numeric fields (float or int); rendered as a min + max text input pair with unit label
- **Stretch at X kN** — webbing-only custom widget (see below)

Excluded from filters: `name`/`description`/`notes` (search), `release_date`, `product_url`, `version`, `currency` (not a UX-meaningful filter), `colors` (comma-separated string needing split logic — future work), `stretch` on webbing (JSON blob of {kn,percent} pairs — exposed as a "has stretch data" pill instead), `width` on rollers (raw string like "25–35mm", not a numeric field).

**Webbings:** Material Type [pill] · Width mm [pill] · Classification [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g/m [range] · Breaking Strength kN [range] · **Stretch at X kN** [custom — see below]

**Weblocks:** Material [pill] · Min Width mm [pill] · Front Pin [pill] · Attachment Point [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]

**Leash Rings:** Material [pill] · ISA Certified [pill] · ISA Warning [pill] · Inner Diameter mm [range] · Outer Diameter mm [range] · Weight g [range] · Breaking Strength kN [range]

**Grips:** Material [pill] · Min Width mm [pill] · Connection Type [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · WLL kN [range] · MBS kN [range] · Slipping Threshold kN [range]

**Rollers:** Frame Material [pill] · Roller Material [pill] · Slider Type [pill] · Lock Type [pill] · Bearing Material [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]

**Tree Protectors:** Sling Attachment [pill] · Sold As [pill] · Weight g [range] · Width cm [range] · Length cm [range] · Thickness mm [range]

**Starter Kits:** Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill] · ISA Certified [pill] · Kit Weight g [range]

**Trickline Kits:** Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill] · ISA Certified [pill] · Kit Weight g [range]

**Manufacturers sidebar:** Continent [pill] · Slackline-Focused [pill]

### Stretch at X kN filter (webbings only)

The `stretch` field is a JSON array of `{kn, percent}` pairs — a curve, not a scalar. The filter widget has two parts:

```
┌─ Stretch at ──────────────────────────────────────┐
│  [0 kN]  [5 kN]  [►10 kN]  [15 kN]  [20 kN]  …  │  ← single-select kN pills, populated from data
│  Min %  [      ]   Max %  [      ]                 │  ← % range at the selected kN
└───────────────────────────────────────────────────┘
```

Rules:
- kN pills are populated dynamically from the union of all kN values present across all webbing stretch arrays — no hard-coded values
- Default selected kN = the kN value that appears in the most webbing stretch arrays (most common in the dataset)
- When a kN pill is active, only webbings that have a data point at exactly that kN are eligible; others are excluded
- The min/max % range further narrows within eligible webbings
- Deselecting the kN pill (clicking active pill) makes the widget fully inactive — all webbings show again
- Changing the selected kN resets the % range inputs
- When this filter is active, the sort dropdown gains two extra options: Stretch % Low→High and Stretch % High→Low (sorted by % at the currently selected kN)
- Cards in the sorted result carry `data-stretch-percent` attribute for test verification

---

### Sort options

Rule: **only numeric fields are sortable**. Enums (material, classification, etc.) and booleans (isa_certified, etc.) are filter-only — they appear as pills in the sidebar but never in the sort dropdown.

Sort options use `data-field` + `data-direction` attributes on the `[data-cy="sort-option"]` elements so tests can target them precisely. Cards carry `data-{field-name}="<value>"` attributes (empty string when null) for order verification.

Null-last in both directions: items where the field is null always appear below items with real values, regardless of whether the sort is ascending or descending.

**All types — always present:**
- Name A→Z / Z→A
- Price Low→High / High→Low _(null-last)_
- Weight Low→High / High→Low _(null-last)_

**Webbings:** + Width · Breaking Strength · **Stretch at X kN** _(context-driven — see below)_
**Weblocks:** + Min Width · Breaking Strength
**Leash Rings:** + Inner Diameter · Outer Diameter · Breaking Strength
**Grips:** + Min Width · WLL · MBS · Slipping Threshold
**Rollers:** + Breaking Strength
**Tree Protectors:** + Width · Length · Thickness
**Starter Kits:** + Webbing Length · Webbing Width
**Trickline Kits:** + Webbing Length · Webbing Width

**Stretch sort (webbings only):**
- Stretch sort options (`data-field="stretch"`) appear in the dropdown **only** when a kN pill is selected in the Stretch filter widget.
- The active kN determines which stretch % values drive the ordering.
- Webbings without data at the selected kN are sorted to the bottom (null-last) but are **not excluded** — they remain visible unless a % range filter is also active.
- Changing the selected kN updates the sort immediately; the sort label in the dropdown reflects the current kN (e.g. "Stretch at 10 kN ↑").

### Above the Card Grid

Full-width search bar (rounded, light border, teal focus ring) on the left.

Right side: `Cards | Chart` toggle (two pill buttons, Cards active by default) + item count (`145 items`) + `SORT BY` dropdown.

Below this row, a subtle `145 items` count left-aligned, above the grid itself.

### Card Grid

3 columns default. 2 on medium screens. 1 on mobile.
Cards: white, border-radius ~14px, very subtle shadow (`0 1px 3px rgba(0,0,0,0.08)`), thin `#E5E7EB` border.
Hover: shadow deepens slightly.

---

## Gear Card Anatomy (top → bottom)

**Image area** (top ~40% of card):
- White or very light gray bg
- Product image centered (placeholder: rope/webbing icon in low-opacity gray)
- Category badge pill — top-left corner, absolute positioned. Coral bg (`#D04A3E`), white text, small rounded pill. Text is gear type or a sub-category (e.g. "LONGLINE", "CLASSIC", "PRIMITIVE").

**Content area** (bottom ~60%):
- Brand name: small-caps gray, ~11px, ~4px below image area
- Product name: bold near-black, ~15px, clickable → detail page
- Key specs inline row: small gray text with `·` separators — e.g. `25mm · 280g/m · MBS 32kN`
- Feature tag pills: light gray bg, dark-gray text, small rounded pills — e.g. `Dyneema`, `Tubular`
- **ISA Approved badge** — if `isa_certified` is true, show a miniature version of the ISA Approved stamp in the bottom-left of the image area (absolute positioned, overlapping the content area slightly). The stamp replicates the official badge: dark charcoal frame, ISA geometric mark (teal + coral), bold white "APPROVED" text, teal checkmark in the V. If false, omit entirely — no "Not certified" label on cards.
- Price: bold amber-orange — e.g. `$84 → Buy` (the "→ Buy" in slightly smaller amber text)
- **Bottom action row**: three equal-width outlined buttons spanning full card width — `♡ Save`, `🔔 Alert`, `⧉ Compare`. Light gray border, gray text. Hover: teal border + teal text.

---

## Gear Detail Page

Max-width centered container (~720px), left-aligned back link.

**Back link**: `← Webbings` in small gray text, hover teal.

**Main card** (white, rounded, shadow):

**Header block** (same for all types):
- Image area: light gray bg band (~200px tall), placeholder icon centered
- Brand name in small-caps gray
- Product name in bold ~24px
- Price in bold amber-orange ~20px — omit row entirely if null. Tree protectors append the price unit in small gray: `$45 per pair`

**ISA Warning banner** — if `isa_warning` is set, show a full-width amber warning strip below the header block (before specs), with a ⚠ icon and the warning text. Tree protectors have no `isa_warning` field — omit entirely.

**"SPECIFICATIONS" label** — small-caps gray with teal dot, then a spec table. Rows: label left (gray), value right (dark), `border-bottom: 1px solid #E5E7EB`, `padding: 10px 0`. Omit any row where the value is null.

**ISA Certification block** (where applicable, before the spec table) — if `isa_certified` is true, show a larger version of the ISA Approved stamp badge (same visual: charcoal frame, teal + coral ISA mark, white "APPROVED" text with teal checkmark in the V), left-aligned, ~80px wide. If false, show a small gray text line "Not ISA Certified" — subdued, not alarming. Tree protectors have no `isa_certified` field — omit this block entirely.

---

### Spec rows per gear type

**Webbing**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | Enum value as-is: Nylon, Dyneema, etc. |
| Width | `width` | Append "mm" |
| Weight | `weight` | Append "g/m"; omit if null |
| Breaking Strength | `breaking_strength` | Append "kN"; omit if null |
| Stretch | `stretch` | JSON array of {kn, percent} points — render as a small inline stretch curve chart, or fallback to a text summary "X% at YkN" at the reference load. Omit if null. |
| Classification | `classification` | A+/A/B/C — show as a colored pill (A+ = teal, A = green, B = amber, C = gray) |
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

Manufacturer card anatomy:
- Brand name bold, ~16px
- Small slackline-icon badge if slackline-focused flag is true
- Country flag or continent label (small gray)
- Year founded (small gray)
- Gear inventory row: small pills showing counts — `Webbings: 12`, `Weblocks: 4`, etc.
- Star rating or review count if available
- "View Gear" button — teal outline pill

---

## Shared UI Conventions

- **All interactive elements**: cursor pointer, teal focus ring on keyboard nav
- **Border radius**: consistent ~8px for pills, ~14px for cards, ~6px for buttons
- **No sharp rectangles anywhere** — even the large CTA buttons are rounded
- **ISA Certified** always uses the official ISA Approved stamp badge (charcoal frame, teal + coral ISA mark, white "APPROVED", teal checkmark). On cards: miniature stamp ~28px tall, bottom-left of image area, only shown when true. On detail page: ~80px wide block above specs, "Not ISA Certified" in subdued gray when false. Never use a plain checkmark or generic pill — the stamp is the trust signal.
- **Empty states**: centered gray icon + short message — e.g. "No webbings match your filters" with a "Clear filters" teal link
- **Loading skeleton**: same card shape as real cards, `animate-pulse` in light gray

---

## What's NOT in scope yet

- User accounts / login
- Review / rating system
- Edit-suggestion workflow
- Compare side-by-side view (button exists, page TBD)
- Homepage stats dashboard
