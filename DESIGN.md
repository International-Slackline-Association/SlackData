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

## Currency & Prices

Every price in the catalogue is stored **as sold, in the seller's own currency** — 471 priced items
across 14 currencies (EUR is ~60%). That storage never changes: rates move daily, so a converted
number written into the database is wrong tomorrow and throws away the fact worth keeping ("this
manufacturer charges €89"). **Conversion is a display layer**, applied on read.

**The viewer picks one display currency and the whole site speaks it** — cards, detail pages, the
compare table, the price filter and the price sort.

### Where the display currency comes from

Precedence, highest first:

1. **Explicit choice** — the top-nav selector, persisted in `localStorage`.
2. **`?cur=` URL param** — so a link carrying a price filter means the same thing to whoever opens it.
3. **Detected** — from the browser's own locale: `Intl.DateTimeFormat().resolvedOptions()` (timeZone
   region, falling back to the locale's region subtag) mapped through a country→currency table.
4. **`USD`** — the default when the region is unknown or has no mapping.

Detection is browser-side on purpose: it needs no infrastructure, and it behaves identically in
local dev, in Cypress and in production. A hosted deployment can do better — CloudFront can pass
`CloudFront-Viewer-Country`, which `/fx/rates` echoes back as `detected_currency` and the frontend
prefers when present — but that requires a custom OriginRequestPolicy and is **not** required for
detection to work.

### Rates

Rates come from **our own backend** (`GET /fx/rates`), never from a third-party call in the browser:
one shared cache instead of one per tab, same-origin behind CloudFront, and a single endpoint the
Cypress suite can stub deterministically.

- Base is **EUR**. `rates["EUR"] == 1.0`.
- Normalize, then convert: `base = price / rates[item.currency]`, `display = base * rates[target]`.
- The frontend caches the response in `localStorage` with a TTL so a repeat visit doesn't block
  first paint on a network round-trip.
- **Rates never block the catalogue.** If `/fx/rates` fails, prices render **as sold** in their own
  currency, the `≈` is dropped, and a single quiet notice (`data-cy="fx-stale-notice"`) appears.
  Gear is still browsable, filterable and sortable — only cross-currency price comparison degrades.

### Displaying a converted price

- Converted values are **marked approximate**: `≈ $96`. Never present a converted figure as if it
  were the sticker price.
- The **as-sold original stays reachable**: small gray secondary text under the price on the detail
  page and in the compare cell (`€89`).
- When the display currency **equals the item's own currency**, there is no `≈` and no secondary
  line — it *is* the price.
- Formatting is `Intl.NumberFormat(locale, { style: 'currency', currency })`: 2 decimals below 10,
  0 decimals at 100 and above, 2 in between.

### Units survive conversion

Two gear types price something other than "one item", and converting must not flatten that:

- **Webbings are priced per meter** (`price` maps from the seed's `priceMeter`). They render with a
  `/m` suffix — `≈ $2.60 /m` — and their filter and sort labels read **"Price per meter"**. Without
  it a €2.40 webbing sits beside an €89 weblock with nothing to tell them apart, which is misleading
  now and worse once price is a headline filter.
- **Tree protectors** may be sold singly or in pairs (`price_unit`). The qualifier is appended —
  `≈ $45 per pair` — and pair prices are **never silently halved**: the pair is the product. The
  existing "Sold As" pill is how a viewer scopes that comparison.

Because per-meter and absolute prices are different quantities, they must never be pooled in one
range — which is fine today, since every listing shows exactly one gear type.

---

## Page Header / Top Nav

White bar, full-width, subtle bottom border.

Left: "SlackData" wordmark (or ISA-style logo lockup with slackline icon).

Center (or just right of logo): horizontal gear-type tabs —
`Webbings · Weblocks · Leash Rings · Grips · Rollers · Tree Protectors · Starter Kits · Trickline Kits`

Active tab: teal underline (2px) + teal text. Inactive: gray text, no underline. No background fill on tabs.

Right: **currency selector**, heart/saved icon, account icon.

**Currency selector** (`data-cy="currency-selector"`) — a compact dropdown in the climbing-gear.com
style showing the active currency's code and symbol (`$ USD`). Opening it lists options
(`data-cy="currency-option"`, each carrying `data-currency="USD"`):

- **"Auto (detected)"** is the first entry and the initial state — it follows the detection chain in
  § Currency & Prices and shows which currency it resolved to.
- Then the **14 currencies the catalogue actually prices in** — EUR, USD, CZK, PLN, CAD, ILS, BRL,
  CHF, ZAR, NZD, MXN, RUB, GBP, INR — followed by the remaining majors. Deliberately **not** all 30
  members of the `Currency` enum: most have no gear behind them, so offering them is a list of dead
  ends.
- The active option carries `data-active="true"`. Picking one persists it (see the precedence chain)
  and re-renders every price on the page without a refetch — rates are already loaded.
- The selector is present on every page, not just listings: prices appear on detail and compare too.

---

## Gear Listing Page Layout

Two-column layout: left filter sidebar + right content area.

### Left Filter Sidebar (~280px wide)

The sidebar is sticky — it pins below the top nav as results scroll, and is capped to viewport height
minus the header. Internally it splits in two: the **status control is pinned to its top**, and
everything below it — the "FIND YOUR …" header, "Clear all", and every filter group — sits in a
single scroll region (`data-cy="filter-scroll"`, `overflow-y-auto`) that scrolls under it. So no
filter ever scrolls out of reach, and the scope control never scrolls away at all.

**Status segmented control — the first thing in the sidebar**, above the "FIND YOUR …" header and
outside the scroll region. A single full-width pill ("bubble") split into equal thirds:
`ALL · CURRENT · HISTORIC` (`data-cy="status-toggle"`, options `status-all` / `status-current` /
`status-historic`, each carrying `data-active="true|false"`).

- **Defaults to ALL** — the listing opens on the whole catalogue, current and historic together.
  Scope is the *first* narrowing applied: search, the filter groups, their facet counts, the item
  count and the grid all work off it.
- `ALL` = every item · `CURRENT` = still sold, i.e. `active !== false` (true or unknown) ·
  `HISTORIC` = retired only, `active === false`.
- **One color per third**: ALL amber-orange `#E8770A`, CURRENT green `#15803D`, HISTORIC red
  `#DC2626`. The **selected** third is filled with its own color, white bold uppercase text, and is
  the only one with rounded ends (it inherits the bubble's full radius on its outer side). The
  other two sit on white with their color as the text color, muted, separated by a hairline
  `#E5E7EB` divider. The whole bubble is `rounded-full` with a light gray border.
- **Always visible.** Because scope bounds every other control, it is pinned: scrolling the filter
  groups moves them beneath a stationary bubble, and switching scope never costs a scroll back up.
- This replaces the old two-way Current/Historic toggle that lived in the toolbar above the grid —
  the toolbar's right side is now just `Cards | Detailed` + `SORT BY`.

Header: "FIND YOUR [GEAR TYPE]" in small gray all-caps, directly under the status control — it is the
first thing *inside* the scroll region, so it scrolls away with the groups.

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
- **Range slider** — numeric fields (float or int); rendered as a **dual-thumb slider** (two overlaid `<input type="range">`, min thumb `data-cy="range-min"`, max thumb `data-cy="range-max"`). Step is 1 for integer-only fields and 0.5 otherwise, unless the field knows its own granularity (money steps by the cent); the domain is the data's [min, max] **snapped onto that step grid** (a native range input only lands on `min + n·step`, so an off-grid max would be unreachable — the thumb would stop short of the track end and never read as "no constraint"). A thumb parked at its domain bound means "no constraint". The two value labels below the track (`data-cy="range-min-value"` / `range-max-value`) are **click-to-edit**: one click turns the number into an inline numeric input (commit on Enter/blur, cancel on Escape) so an exact bound can be typed without dragging; out-of-range values are clamped, not rejected. This is the standard control for every min/max filter (weight, breaking strength, diameters, widths, dimensions, kit weight, and the stretch %).
- **Stretch at X kN** — webbing-only custom widget (see below)

**Pill order within a group** — values are alphabetical by default, with catch-all buckets ("Other",
"Unknown") always sinking to the bottom. Groups whose domain is *ranked* rather than alphabetical
may declare an explicit order instead, and values absent from that order sort after it,
alphabetically. No group uses this today (classification, the one ranked domain, is not a filter —
see below); the mechanism stays in `filterGroups.ts` for the next ranked enum.

**Price is the first group in every gear type's sidebar** — above Material, above everything. It is
the filter people reach for first in any gear catalogue, and it is the only one that is meaningful
for all 8 types.

It is a range slider like any other numeric filter, with four behaviours unique to it:

- **Its unit is the display currency's symbol**, and its **domain is expressed in the display
  currency** — so unlike every other range filter, the domain moves when the selector changes.
- **It works in money, at a precision that follows the currency.** The domain is the cheapest and
  priciest items themselves — in USD the webbing slider spans `0.58 $` to `10.56 $`, not a
  rounded-off `0.00`–`10.50`, because a price filter whose floor sits below anything for sale wastes
  half its track. The **dollar is the baseline: cent steps, two decimals.** A currency an order of
  magnitude larger drops a decimal (`¥1,683` is as precise as `$10.56`), stopping at whole units at
  100× and beyond — `0.1` for CZK/INR/MXN/RUB/ZAR, `1` for JPY/KRW — and nothing goes finer than the
  dollar's cents. Both labels carry that many decimals at every magnitude, including above 100 where
  a price *tag* drops them: they sit on one control and must match each other.
- **Switching currency converts an active bound rather than clearing it.** Filter to `$50–$100`,
  switch to EUR, and the bounds become `€46–€92`: the same items stay selected. Anything else would
  silently change a result set behind the viewer's back.
- **The bounds are written to the URL in the display currency**, alongside `?cur=` so the link
  stays meaningful when shared (`?price_min=50&price_max=100&cur=USD`). `?cur=` is written **only**
  when a price bound is set — currency is otherwise a viewer preference, not view state, and does
  not belong in every URL. Storing bounds in the canonical base instead was rejected: the numbers
  in the URL would not match the numbers on screen, breaking the rule that `?{field}_min` mirrors
  the visible value.

Items with **no price are excluded** whenever a bound is set — the same null-last philosophy as
every other range filter.

On webbings the group is labelled **"Price per meter"** (see § Currency & Prices).

Excluded from filters: `name`/`description`/`notes` (search), `release_date`, `product_url`, `version`, `currency` (the top-nav **selector** governs currency site-wide — filtering by the seller's currency would be filtering by an accident of where the shop is), `colors` (comma-separated string needing split logic — future work), `stretch` on webbing (JSON blob of {kn,percent} pairs — exposed as a "has stretch data" pill instead), `width` on rollers (raw string like "25–35mm", not a numeric field), **`classification` on webbing** (an ISA grant, not an independent axis of the catalogue — see § Classification bubble; filter by **ISA Certified** instead).

**Webbings:** **Price per meter** [range] · Material Type [pill] · Width mm [range] · ISA Certified [pill] · ISA Warning [pill] · Weight g/m [range] · Breaking Strength kN [range] · **Stretch at X kN** [custom — see below]

**Weblocks:** **Price** [range] · Material [pill] · Min Width mm [range] · Front Pin [pill] · Attachment Point [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]

**Leash Rings:** **Price** [range] · Material [pill] · ISA Certified [pill] · ISA Warning [pill] · Inner Diameter mm [range] · Outer Diameter mm [range] · Weight g [range] · Breaking Strength kN [range]

**Grips:** **Price** [range] · Material [pill] · Min Width mm [pill] · Connection Type [pill] · ISA Certified [pill] · ISA Warning [pill] · Weight g [range] · WLL kN [range] · MBS kN [range] · Slipping Threshold kN [range]

**Rollers:** **Price** [range] · Frame Material [pill] · Roller Material [pill] · Slider Type [pill] · Lock Type [pill] · Bearing Material [pill] · ISA Warning [pill] · Weight g [range] · Breaking Strength kN [range]  _(ISA Certified hidden — no roller is certified)_

**Tree Protectors:** **Price** [range] · Sling Attachment [pill] · Sold As [pill — labels title-cased: Pair / Single] · Weight g [range] · Width cm [range] · Length cm [range] · Thickness mm [range]

**Starter Kits:** **Price** [range] · Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill] · Kit Weight g [range]  _(ISA Certified hidden — none certified)_

**Trickline Kits:** **Price** [range] · Tensioning [pill] · Webbing Width mm [pill] · Webbing Length m [pill] · Includes Tree Pro [pill]  _(ISA Certified hidden — none certified; Kit Weight NOT filterable — only 2 of 9 have weight data)_

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

Rule: **only numeric fields are sortable**. Enums (material, front pin, etc.) and booleans (isa_certified, etc.) are filter-only — they appear as pills in the sidebar but never in the sort dropdown. (Classification is neither: not sortable, and not a filter either — see § Classification bubble.)

Sort options use `data-field` + `data-direction` attributes on the `[data-cy="sort-option"]` elements so tests can target them precisely. Cards carry `data-{field-name}="<value>"` attributes (empty string when null) for order verification.

Null-last in both directions: items where the field is null always appear below items with real values, regardless of whether the sort is ascending or descending.

**Name is the default sort AND the universal tie-breaker.** A fresh load (no sort chosen) is alphabetical by name ascending. On every numeric sort, items with **equal values** — and the order among null/blank values — fall back to **name ascending** (regardless of the numeric direction). So e.g. MBS High→Low lists equal-MBS grips A→Z.

**All types — always present:**
- Name A→Z / Z→A
- Price Low→High / High→Low _(null-last)_ — **sorts on the normalized value, not the raw number.**
  Before this, "Price Low→High" ranked a `5377 RUB` grip against an `89 USD` one numerically, which
  was simply wrong. Converting every price to a common base is a single global scalar multiply, so
  **the resulting order is identical in every display currency** — the sort needs normalization but
  never needs to know which currency you're viewing in. Webbings sort per meter. Items with no price
  stay null-last, as before.
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
- White or very light gray bg (the fallback only — see the backdrop rule below)
- **Images fit the frame vertically, never horizontally.** The image is fitted *inside* the band and
  centred (`object-contain` — *not* `object-cover`, which fit by width and sliced the top and bottom
  off every portrait shot). Nothing is ever cropped: the whole product reads end to end. The band is
  far wider than it is tall (~300×160) while our shots run 0.67–1.54 w/h, so the fit always lands on
  the height and **every image is pillarboxed** — bars of frame to its left and right.
  Sizing note: the `<img>` box fills the band and `object-fit` does the letterboxing inside it, not
  `h-full w-auto` sizing the box to the photo. Chromium will not transfer a percentage height
  through a replaced element's intrinsic ratio to an `auto` width — as a flex child or absolutely
  positioned it lays the image out 0px wide, leaving nothing on the card but the blurred backdrop.
  So the geometry tests measure the **painted** rectangle (the `object-fit` math applied to the real
  band and the real file), not the element box.
- **The pillar bars match the image's own background.** Behind the image sits a blurred,
  `cover`-scaled copy of the same file — a second lazily-loaded `<img>`
  (`data-cy="card-image-backdrop"`, `aria-hidden`; a CSS background would ignore `loading="lazy"`
  and fetch a backdrop for every off-screen card in the grid) — so the bars pick up the
  colour the photo's own edges have — a shot on white gets white bars, a shot on grass gets a soft
  green wash — and the letterboxing reads as part of the picture instead of a grey gutter. Blur it
  hard enough (~24px, slightly over-scaled so the blur's own soft edge is pushed out of frame) that
  it registers as a colour field, not a second picture. It always shows the image the carousel is
  currently on, so it changes with the arrows and dots. Products with **no** image fall back to the
  flat light-gray band with the low-opacity `No image` placeholder.
- **No gear-type badge.** Each listing shows a single gear type, so labelling every card "ROLLER" on the rollers page is redundant. Reintroduce a coral gear-type pill (top-left, absolute) only on views that mix types — e.g. manufacturer pages.
- **Legacy badge, top-left overlay** (absolute, ~8px from the top-**left** corner) — a small red uppercase `Legacy` pill, shown only when `active` is false (discontinued / no longer sold). Nothing renders for active or unknown (`active` true/null) gear — an active card carries no status pill. Because the listing defaults to ALL, a grid routinely mixes badged and unbadged cards — the badge is what tells them apart, so it is never suppressed by the sidebar's status scope. This occupies the **top-left** slot (the one reserved above for a future gear-type pill), mirroring the manufacturer card's top-left **Inactive** pill (see § Manufacturer card anatomy), so both card types read the same way: lifecycle status on the left, classification/ISA on the right.
- **Top-right overlay stack** (absolute, ~8px from the top-right corner, stacked vertically with ~6px gaps, right-aligned):
  1. **Classification bubble** — webbing only, and only in the two cases § Classification bubble defines: an **ISA-certified** webbing shows its granted class, and a webbing under **22 kN** shows the gray **Not for Highline** pill. Identical component, colors and shape to the detail page's bubble — the highline class is the fastest read on a webbing card, so it belongs in the grid, not just one click deep. Omit entirely otherwise (including an uncertified `Not for Highline` webbing at 22 kN or more, and any null `classification`). Other gear types have no `classification` field and never show it. So a letter bubble always has the ISA stamp beneath it, while a `Not for Highline` pill usually stands alone.
  2. **ISA Approved badge** — the miniature stamp, when `isa_certified` is true (see below).

**Content area** (bottom ~60%):
- Brand name: small-caps gray, ~11px, ~4px below image area
- Product name: bold near-black, ~15px, clickable → detail page
- Key specs inline row: small gray text with `·` separators — e.g. `25mm · 280g/m · MBS 32kN`
- Feature tag pills: light gray bg, dark-gray text, small rounded pills — e.g. `Dyneema`, `Tubular`
- **ISA Approved badge** — if `isa_certified` is true, show a miniature version of the ISA Approved stamp in the top-right overlay stack of the image area (under the classification bubble when both are present). The stamp replicates the official badge: dark charcoal frame, ISA geometric mark (teal + coral), bold white "APPROVED" text, teal checkmark in the V. If false, omit entirely — no "Not certified" label on cards.
- Price: bold amber-orange in the **display currency** — e.g. `≈ $84 → Buy` (the "→ Buy" in slightly
  smaller amber text). The `≈` is dropped when the item is already priced in the display currency.
  Webbings append `/m`. The card shows only the converted figure — the as-sold original lives on the
  detail page and in the compare cell, where there's room for it.
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
- Image area: light gray bg band (~200px tall, ~290px at `sm`+). Images **fit the band vertically**
  and are pillarboxed against a blurred copy of themselves — exactly the treatment the listing cards
  use, because it is literally the same component (see § Gear Card Anatomy → Image area for the
  rule and the reasoning). Uses the **same multi-image
  carousel the cards use** — prev/next arrows and one dot per image, browsing every image we hold
  for the product. Single-image products render the bare image with no chrome; products with no
  image show a low-opacity "No image" placeholder.
- Brand name in small-caps gray
- Product name in bold ~24px
- Price in bold amber-orange ~20px, in the **display currency** — omit row entirely if null.
  Prefixed `≈` when converted (`≈ $96`), with the **as-sold original** directly beneath in small
  gray (`€89`, `data-cy="detail-price-original"`). Neither the `≈` nor the original appears when the
  item is already priced in the display currency. Webbings append `/m`; tree protectors append the
  price unit in small gray: `≈ $45 per pair`.

**ISA Warning banner** — if `isa_warning` is set, show a full-width amber warning strip below the header block (before specs), with a ⚠ icon and the warning text. Tree protectors have no `isa_warning` field — omit entirely.

**"SPECIFICATIONS" label** — small-caps gray with teal dot, then the spec grid: **two balanced columns** of label/value pairs (`gap-x-10`), collapsing to one column on narrow screens. Within each cell: label left (gray), value right (dark), `border-bottom: 1px solid #E5E7EB`, `padding: 10px 0`. Omit any row where the value is null. The webbing stretch curve is the one full-width entry — it spans both columns.

**Classification bubble** — the ISA highline class sits as a colored bubble immediately right of the product name, not in the spec grid. The same bubble is overlaid top-right on the card's image area in the listing grid (see § Gear Card Anatomy) — one component, so the two can never drift apart. Colors are taken from the ISA's own [webbing type graphic](https://www.slacklineinternational.org/wp-content/uploads/2020/02/webbing_type_graphic.png) so they match the chart people already know:

| Class | Fill | | Class | Fill |
|---|---|---|---|---|
| A+ | `#6AA84F` (dark green) | | C | `#F6B26B` (orange) |
| A | `#93C47D` (light green) | | Not for Highline | `#E5E7EB` (neutral gray — not on the ISA chart) |
| B | `#FFD966` (yellow) | | | |

**When the bubble is shown.** Two cases, and only two — both gated inside the bubble component itself, so the card and the detail page cannot diverge:

1. **ISA certified** (`isa_certified === true`) → the bubble is its granted class. A+/A/B/C is an ISA grant, so an **uncertified** webbing never shows a letter class, even though the backend computes a `classification` for every webbing from its fibers and strength: a class ISA never granted, rendered in ISA's own colors, reads as certification.
2. **Breaking strength under 22 kN** → the gray **Not for Highline** pill, certified or not. 22 kN is the Type C floor in `_classify_fiber()` (`slack_data/models/webbing.py`); below it no fiber earns any class, so this is a fact about the webbing rather than a withheld grant, and the warning is worth carrying on every such item.

Anything else shows nothing — including an uncertified `Not for Highline` webbing at **22 kN or more** (a 25 kN polyester, say, which misses Type C only because ISA doesn't certify PES that low: that is a certification gap, not a strength warning). Unknown `breaking_strength` counts as *not* below the floor — no data, no claim. On a sub-22 kN item the `title` reads "Not for highline — breaking strength under 22 kN" rather than "ISA Type …", since nothing about it is an ISA type.

Classification is still **not a sidebar filter**: as a letter class it is an attribute of certification rather than an independent axis of the catalogue (filter by **ISA Certified**), and as a warning it is already implied by the Breaking Strength range.

The letter is **dark ink `#1F2937` on every fill**: white text fails WCAG AA on all four ISA colors (contrast 1.37–2.87), while `#1F2937` clears AA on each (5.12–11.86). A+/A/B/C render as round bubbles; the long "Not for Highline" stays a full pill so it isn't truncated. The letter itself carries the meaning, so identity is never colour-alone, and a `title` spells it out for screen readers. For hybrids the class is derived from the strongest component fiber (see Material Composition).

**ISA Certification block** (where applicable, before the spec table) — if `isa_certified` is true, show a larger version of the ISA Approved stamp badge (same visual: charcoal frame, teal + coral ISA mark, white "APPROVED" text with teal checkmark in the V), left-aligned, ~80px wide. If false, show a small gray text line "Not ISA Certified" — subdued, not alarming. Tree protectors have no `isa_certified` field — omit this block entirely.

---

### Spec rows per gear type

**Every table below is preceded by a shared Price row** — it is not repeated in each table:

| Row label | Field | Display notes |
|-----------|-------|---------------|
| Price | `price` | In the display currency, `≈`-prefixed when converted, with the as-sold original beneath in small gray. Omit the row when `price` is null. Webbings label it **"Price per meter"** and append `/m`; tree protectors append `per single` / `per pair`. |

This is what puts price on the **compare page**: compare renders `SPEC_ROWS`, so a type that has no
price row has no price column — which is why, until now, you could compare two weblocks on weight
and breaking strength but not on what they cost. Price is the **first row** of every compare table.

On the **detail page** the price already appears in the header block, so it is *not* repeated in the
spec grid — the row is declared for compare and suppressed in `SpecTable`.

**Webbing**
| Row label | Field | Display notes |
|-----------|-------|---------------|
| Material | `material` | Enum value as-is: Nylon, Dyneema, etc. |
| Material Composition | `material_composition` | Hybrid webbings only. JSON array of component fiber names — render as a plain slash-joined string, e.g. `Polyester / Dyneema`. Omit the row entirely when null (single-fiber webbings). **Detail spec sheet only — never shown on the card.** |
| Width | `width` | Append "mm" |
| Weight | `weight` | Append "g/m"; omit if null |
| Breaking Strength | `breaking_strength` | Append "kN"; omit if null |
| Stretch | `stretch` | JSON array of {kn, percent} points. **≥ 3 measured points** → a two-row table spanning the full grid width: `Load` across the top, `Stretch` beneath, **one column per measured point** — nothing interpolated, no fixed column set. Ascending by kN; **0 kN is dropped** (every curve reads 0% there); long curves scroll horizontally with the row-label stub pinned left. **1–2 points** → inline text instead, e.g. `3.4% @ 10 kN · 4.7% @ 15 kN` (a one- or two-column table is all chrome, no signal). Row is omitted when there are no *measured* points — note this is stricter than `stretch != null`: a curve like `[{"percent": 8}]` (no `kn`) has nothing to show. |
| Classification | `classification` | **Not a spec row.** Renders as a colored bubble beside the product name, and only when the webbing is ISA certified or under 22 kN — see § Classification bubble below. |
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
| Price Per | `price_unit` | "single" or "pair" — appended to the price in the header and to the shared Price row, not a spec row of its own. It stays a **filter** pill ("Sold As") because pair pricing is the one place where two tree protectors' prices are not directly comparable. |

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
`bg-gray-50` field with absolutely-positioned overlays in **both top corners**. What changes is
only what fills those slots: the product shot becomes the **manufacturer logo**, the gear card's
top-left category badge becomes the **Inactive pill**, and its top-right classification/ISA
overlay becomes a single **country flag**.

Manufacturer card anatomy (top → bottom):
- **Logo image area** — the brand's logo, centered and letterboxed (`object-contain`) in the same
  `h-40` gray field the gear cards use. Brands with no logo show a muted `No logo` placeholder
  (mirroring the gear card's `No image`) rather than collapsing the area, so every card in a row
  is the same height.
- **Inactive pill, top-left overlay** — red, uppercase, shown only when `active` is false. See
  "Active / inactive" below.
- **Country flag, top-right overlay** — a small (~24×16) rounded flag chip with a hairline border,
  in the exact slot the gear card's classification bubble occupies. Flag only, no country label:
  the name is redundant next to the flag and the row has no space for it. The country name goes on
  the flag's `title`/`alt` so it stays available to hover and to screen readers.
- **Brand name** — bold, ~16px, the card's primary line, and a link to the brand's detail page.
  The whole card is a **stretched click target** for that same destination (the name link carries an
  `after:inset-0` overlay), so a click anywhere on the card — except the website button — opens the
  detail page, and hovering anywhere on the card highlights the name (`group-hover`) in teal.
- **Slackline badge** — small teal pill when `slackline_focused` is true. The flag is corrected
  from the source (SlackDB marks nearly everyone slackline-oriented): dedicated slackline companies
  are true, general climbing / rope-access / rigging brands that merely make a part slackliners use
  (Petzl, CAMP, Mammut, Edelrid, Kong, …) are false. So the badge discriminates — 48 of 56 brands
  in the DB carry it, the other 8 don't. See `scripts/apply_slackline_focus.py` for the exception
  list and the reason attached to each.
- **Year founded** — small gray (`Est. 2009`), beneath the name; omitted when null (37 of 56).
- **Gear inventory row** — small gray pills, one per type the brand actually stocks:
  `Webbings: 12`, `Weblocks: 4`, … Types with zero are omitted from the pills (a wall of zeroes is
  noise) but still emitted as `data-count-{slug}="0"` on the card root.
- **"Visit Website"** — teal outline pill, opens the brand's `website` in a new tab
  (`target="_blank"`, `rel="noopener noreferrer"`). It sits at `z-10` above the card's stretched
  link so it stays independently clickable. Brands with no `website` show a disabled, greyed-out
  **"No Website"** chip in the same slot rather than the pill, keeping the card footer aligned. (The
  detail page is reached by clicking the card/name, not this button.)

**Detail page heading.** On the brand's detail page (`/manufacturers/:id`) the `brand-detail-name`
heading sits on its own line **below** the "← Manufacturers" back link, and is itself a link to the
brand's `website` (new tab, teal hover + underline) when one exists — the same destination as the
card's Visit Website button. Brands with no `website` render the name as a plain, non-link heading.

**Detail page gear sections.** Below the heading the brand's inventory is grouped into one section
per gear type, in the nav's gear-type order; types the brand has none of are omitted entirely.

- **Ordering within a section is alphabetical by `name` (A→Z)**, never API/insertion order. The
  sections are the one place in the app that renders gear outside the listing page, so they'd
  otherwise inherit raw id order — which reads as random to anyone scanning a brand's catalogue for
  a specific product. This is the same rule the gear listing applies with no explicit sort, so a
  brand's webbings read in the same order in both places.
- **Each section header is a collapse toggle.** The whole header — the type label, the item count,
  and a small chevron to their right — is one `<button>`; clicking anywhere on it (label, count or
  chevron) collapses the section, hiding its card grid and leaving the header in place. Clicking
  again expands it. The chevron points **down** when expanded and rotates to point **right** when
  collapsed (a CSS rotation on one glyph, so the two states are the same mark and read as one
  control moving).
- **Sections start expanded**, so the default view of a brand page is its whole catalogue. Collapse
  state is per-section and lives in component state only — it is not persisted to the URL or across
  navigations, because it's a transient reading aid, not a view worth sharing.
- The header keeps the small-caps teal-dotted styling used elsewhere for section labels, and carries
  the shared interactive affordances (cursor pointer, teal focus ring) since it is now a control.
  The section root carries `data-collapsed`, and the button `aria-expanded`, so the state is
  readable to both tests and assistive tech.

**Grid only, with a sort control.** There is no Cards/List view toggle — the directory is a card
grid, and that toolbar slot holds a **Sort by** dropdown instead. Options:

| Sort | Order | Why |
|------|-------|-----|
| **Gear count** (default) | most first | With 56 brands, the deepest catalogues are the most useful entry point. |
| Name | A→Z | Straight lookup when you know who you're after. |
| Country | A→Z | Groups the directory geographically. |
| Year established | oldest first | A founding year is a heritage signal, so ascending reads more naturally. |

**Name is the tie-break in every mode**, so ordering is deterministic rather than dependent on API
insertion order. Missing values (no country, no founding year) always sort **last**, matching the
gear listing's null-last rule.

**Active / inactive.** `Brand.active` is backfilled from a reviewed `manufacturers.json`. A brand
that is no longer trading gets a **red `Inactive` pill in the card's top-LEFT corner** — the same
slot the gear card uses for its category badge, so the two card types read the same way (top-right
stays the flag, mirroring the gear card's classification bubble). The whole card is also dimmed, but
it is *not* hidden: its gear is still real and still worth browsing, it just can't be bought new.
The card root carries `data-active`.

The word is deliberately **"Inactive"**, not "Defunct" or "Closed": `active` is a plain bool, so it
marks only the negative case — "still trading" and "never checked" are the same value. A hedged word
is honest about that, where a final-sounding one would assert a certainty the schema can't hold.

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
- **ISA Certified** always uses the official ISA Approved stamp badge (charcoal frame, teal + coral ISA mark, white "APPROVED", teal checkmark). On cards: miniature stamp ~28px tall, top-right of image area (below the classification bubble when the webbing has one — a letter bubble only ever appears on a certified item, so the stamp is always its neighbour), only shown when true. On detail page: ~80px wide block above specs, "Not ISA Certified" in subdued gray when false. Never use a plain checkmark or generic pill — the stamp is the trust signal.
- **Empty states**: centered gray icon + short message — e.g. "No webbings match your filters" with a "Clear filters" teal link

### The two clear actions

They are deliberately different, and both are `data-cy="clear-filters"`:

| | Sidebar **Clear all** | Empty-state **Clear filters** |
|---|---|---|
| Filter pills / ranges / stretch widget | cleared | cleared |
| Search term (`?q=`) | cleared | **kept** |
| Status bubble | reset to **ALL** | reset to **ALL** |

The empty-state button's job is "show me what this *search* can find" — a dead end is nearly always
the filters or a narrow status scope, not the words typed, so wiping the search too threw away the
one thing worth keeping. It navigates to the same route carrying **only** `?q=<term>` (sort is kept
too — it can't empty a result set), and the search box keeps showing the term. Resetting the status
to ALL is part of the same promise: a HISTORIC-only scope is itself a filter, so a "clear filters"
that left it engaged could still land on an empty grid.
- **Loading skeleton**: same card shape as real cards, `animate-pulse` in light gray

---

## What's NOT in scope yet

- User accounts / login
- Review / rating system
- Edit-suggestion workflow
- Compare side-by-side view (button exists, page TBD)
- Homepage stats dashboard
