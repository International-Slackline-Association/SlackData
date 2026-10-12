# Connectors — candidate review (research pass, 2026-10-11)

Candidates for the new `Connector` gear type. The decisions they are measured against are in
BACKLOG.md § "Connectors as a gear type". **Nothing here is in a seed yet.** Tick a row to accept
it, strike it to reject it, and answer the open questions first, because several of them remove
whole blocks of rows at once.

Columns: **Style** is Shackle / Carabiner / Quicklink / Soft shackle. **Closure** uses the planned
enum. **MBS** is straight pull / crossload / gate open, in kN. **Jaw** is the gate or jaw opening
and **Pin** the pin diameter, both in mm. A dash means the maker does not state it. Prices are in
the shop's own currency, as listed on 2026-10-11 unless marked historic.

## How the sweep was done

- **Shopify feeds** (`/products.json`): Balance Community, Slackline Industries, raed (now
  `raed-sports.com`), Gibbon, Slackliner.de, Viper.
- **WooCommerce Store API**: Slacktivity, SlackGear, Slack house, Bera, Geko, Middle Way.
- **Wayback Machine** (CDX listing plus snapshots): Spider Slacklines and Slack Inov, which both
  answer this network with 403. Also every defunct brand in `manufacturers.json` that has a known
  domain, and BC's discontinued products.
- **Nothing found**: Slack Mountain (its "Connecteurs" menu links to `#`), lineGrip, SlackX,
  Slackline Industries' current shop, Middle Way, Geko, Landcruising, Elephant, RadRigs.
- **Not swept**: EQB / slackshop.cz, because of a card skimmer (see the security note at the end);
  Cong Gear (Facebook only); A-Zero (did not answer); Acrobat, Slackstar and BLOACS (no store API,
  and nothing connector-related found on their home pages).
- **The historic aluminium shackle is the Landcruising AirBow** (identified by the operator from
  two Landcruising promo photos, 2026-10-11). See § A. Included as a prototype (answer 8); the
  catalogue keeps it with `active: false`.

## Answers (operator, 2026-10-11)

1. **Generic stock hardware**: own-design rows, plus generic parts **only where the shop
   publishes an MBS**. A § B row with no MBS stays out.
2. **Sizes**: one row per size.
3. **Maillon Rapide**: **Peguet becomes a brand** (a new `manufacturers.json` entry), and each
   reselling shop is one of its `gear_sellers`.
4. **Tonnes**: converted to kN (× 9.81) as `mbs_straight_pull`, with the wording kept in `notes`.
5. **Proof load**: `notes` only, with MBS left null.
6. **Neighbours**: none of them. Plates, rings, swivels, textile links and the PulleyBiner stay out.
7. **Size field**: replaced by **one `opening` field** for every style. Shackle: jaw width.
   Carabiner and quicklink: gate opening. Soft shackle: inner loop size as stated, with `notes`
   saying how it was measured. The "Jaw" column below is that field.
8. **AirBow**: included, `active: false` (Landcruising closed in 2018). First recorded as a
   prototype from 2015 promo photos; the operator's later photos show the production shackle
   (serial-numbered, on Landcruising's archived shop), so its engraved figures are used: 70 kN
   along, 38 kN across, WLL 8 kN.
9. **Van Beest / Green Pin**: filed under **Van Beest** (already in `manufacturers.json`), with the
   shops as `gear_sellers`. This covers BC's pair and Spider's and Landcruising's Green Pins.
10. **EQB skimmer**: left as is for now (see the end of this doc).

---

## A. Designed or made by the brand — the core candidates

| ✓ | Brand | Name | Style | Closure | Material | MBS | Jaw | Pin | Weight | Price | Active | Source / flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [ ] | Slacktivity | KingPin | Shackle | push pin | Aluminum (7075, hot forged) + 17-4PH pin | 48 / 28 / – | 26 | 11.2 | 107 g | €40.00 | yes | [page](https://slacktivity.com/shop/kingpin-aluminium-shackle/). EN362:2005 M-type and ISA:52. Matches `approved_gear_27`. ISA warning #65 (first-batch pins) |
| [ ] | Balance Community | Slackle | Shackle | push pin | Aluminum (7075-T6, CNC) + 17-4PH pin | 60 / 30 / – | 26.2 | 12 | 128 g | US$45 | yes (pre-order) | [page](https://www.balancecommunity.com/products/slackle). WLL 12 kN. Pin parking spot. No standard named |
| [ ] | Cong Gear | Falcon (隼) | Shackle | push pin | Aluminum (alloy not stated) | 60 / – / – | 26 | – | 144 g | – | yes | Facebook post only (BACKLOG.md). WLL 8 kN. Six photos held |
| [ ] | Landcruising | AirBow | Shackle | push pin | Aluminum ("aircraft aluminium", machined) + 17-4PH pin | 70 / 38 / – | 25.5 | 11.2 | 120 g | – | no (historic, answer 8) | [Landcruising's archived shop page](https://web.archive.org/web/20161009010520/http://www.landcruising-slacklines.de:80/en/shop/6-/38-/491-landcruising-airbow) and the operator's photos of the production shackle: engraved MBS 70 kN along, 38 kN across, WLL 8 kN, serial-numbered, "not certified as P.P.E.", made in Germany. The 2015 prototype promo ([Chocoslack, 2015-04-20](https://web.archive.org/web/20190107043141/http://www.chocoslack.com/en/2015/04/20/new-generation-schakle-by-landcruising/)) stated 68.9 / 34.4 kN, WLL 10 kN. Also shown as a combo with the Lynx 4 (320 g together) and with a Lockman XL prototype |
| [ ] | Balance Community | BC Shackle SS | Shackle | screw pin (captive) | Stainless Steel (316, drop forged) | 60 / – / – | 27 | 11.2 | 178 g | US$15 | yes | [page](https://www.balancecommunity.com/products/bc-shackle-ss). WLL 12 kN. The "BC Shackle" in BC's starter kit |
| [x] | Van Beest (seller: Balance Community) | Van Beest 7/16-inch Screw-Pin Shackle | Shackle | screw pin | Steel (Grade 6, hot-dip galvanized, drop forged) | 80 / – / – | 19 | 13 | 190 g | US$15 | yes | [page](https://www.balancecommunity.com/products/van-beest-7-16-inch-screw-pin-shackle). WLL 13 kN. EN 13889 + US Fed. Spec. RR-C-271. Filed under Van Beest with BC as seller (answer 9) |
| [x] | Van Beest (seller: Balance Community) | Van Beest 1/2-inch Screw-Pin Shackle | Shackle | screw pin | Steel (Grade 6, hot-dip galvanized, drop forged) | 107 / – / – | 22 | 16 | 330 g | US$21 | yes | [page](https://www.balancecommunity.com/products/van-beest-1-2-inch-screw-pin-shackle). WLL 18 kN. EN 13889 + RR-C-271. Filed under Van Beest with BC as seller (answer 9) |
| [ ] | Balance Community | BC Aluminum Carabiner | Carabiner | – (not stated) | Aluminum (7075) | 21 / 8 / 7 | 19 | – | 70 g | US$12 | yes | [page](https://www.balancecommunity.com/products/bc-aluminum-carabiner). Two openings are listed: "gate opening 12" and "opening size 19". Which one is `jaw_width`? |
| [ ] | Balance Community | Rigging Carabiner | Carabiner | twist-lock | Aluminum (7075) | 25 / 7 / – | 16.9 | – | 222 g | US$35 | yes | [page](https://www.balancecommunity.com/products/rigging-carabiner). Made in Taiwan |
| [ ] | Balance Community | Soft Shackle - 4mm x 15cm | Soft shackle | knot (button) | Dyneema (SK-78, Amsteel Blue) | 32 / – / – | – | – | 12.8 g | US$16 | yes | [page](https://www.balancecommunity.com/products/soft-shackle-4mm). Rope 4 mm, inner 130 mm, WLL 5 kN |
| [ ] | Balance Community | Soft Shackle - 5mm | Soft shackle | knot (button) | Dyneema (SK-78) | 44 / – / – | – | – | – | US$16–24 | yes | [page](https://www.balancecommunity.com/products/soft-shackle-5mm). Rope 5 mm, 10/20 cm, ±sleeve, WLL 9 kN |
| [ ] | Balance Community | Soft Shackle - 6mm | Soft shackle | knot (button) | Dyneema (SK-78) | 72 / – / – | – | – | – | US$19–28 | yes | [page](https://www.balancecommunity.com/products/soft-shackle-6mm). Rope 6 mm, 10/20 cm, ±sleeve, WLL 12 kN |
| [ ] | Slacktivity | Slackline Carabiner | Carabiner | – (not stated) | Steel (carbon, 40 ACR) | 25 / 7 / – | 21 | – | 170 g | €14.00 | yes | [page](https://slacktivity.com/shop/slackline-carabiner/). WLL 7 kN. Claims the best triload result of any brand's carabiner |
| [ ] | Slacktivity | Aluminium Carabiner | Carabiner | – (not stated) | Aluminum (7075-T6) | 27 / – / – | 17.5 | – | 78 g | €12.50 | out of stock | [page](https://slacktivity.com/shop/aluminium-carabiner/). WLL 4 kN |
| [ ] | raed | Dyneema Soft Shackle 14 kN | Soft shackle | – | Dyneema (coated) | 14 / – / – | – | – | – | €19.99 | yes | [page](https://raed-sports.com/products/dyneema-soft-shackle-14-kn). Rope 3 mm. **Maker says not for highlines** |
| [ ] | raed | Dyneema Soft Shackle 42 kN | Soft shackle | – | Dyneema (coated) | 42 / – / – | – | – | – | €32.99 | yes | [page](https://raed-sports.com/products/dyneema-soft-shackle-42-kn). Rope 6 mm. **Maker says not for highlines** |
| [ ] | raed | Oval Steel Carabiner | Carabiner | – | Steel | 25 / – / – | – | – | – | €11.50 | yes | [page](https://raed-sports.com/products/oval-steel-carabiner). "for slacklines up to 30 m" |
| [ ] | Viper Slacklines | HMPE Soft Shackle 5mm | Soft shackle | knot (button) | Dyneema (UHMWPE) | – | – | – | 22 g | R380 | yes | [page](https://www.viperslacklines.co.za/products/5mm-soft-shackle). Proof-tested to 15 kN, which is not an MBS, so notes only (answer 5). 29 cm open |
| [ ] | Viper Slacklines | Oval Auto-Locking Carabiner | Carabiner | twist-lock | Steel | 25 / – / – | – | – | 193 g | R580 | yes | [page](https://www.viperslacklines.co.za/products/oval-carabiner) |
| [ ] | Viper Slacklines | Slackline Shackle | Shackle | – | Stainless Steel | – | – | – | – | R210 | yes | [page](https://www.viperslacklines.co.za/products/slackline-shackle). No specs at all |
| [ ] | Bera Adventure | Soft Shackle 5mm | Soft shackle | – | Dyneema (HMPE) | 27 / – / – | – | – | 10 g | R$50 | yes | [page](https://www.beraadventure.com.br/product/soft-shackle-5mm/). WLL 5 kN, inner 130 mm, knot 21 mm. Portuguese only → no description |
| [ ] | Bera Adventure | Soft Shackle 8mm | Soft shackle | – | Dyneema (HMPE) | 36 / – / – | – | – | 22 g | R$65 | yes | [page](https://www.beraadventure.com.br/product/soft-shackle/). WLL 6 kN, inner 112 mm, knot 33 mm |
| [ ] | Gibbon | Heavy Duty Shackle | Shackle | screw pin | Stainless Steel | 58.8 (answer 4) / – / – | – | – | – | €11.95 | yes | [page](https://www.gibbon-slacklines.com/products/shackle). "WLL 1 t, 6-ton breaking strength" |
| [ ] | Aki Slacklines | ST Slack-Biner | Carabiner | – | Steel | 25 / – / – | – | 12? | – | €10.00 (2021) | no | [archive](https://web.archive.org/web/20210927042849/https://aki-slacklines.de/de/hardware/karabiner/stahlkarabiner/144/st-slack-biner). "for 50 mm webbing". "ST" may be another maker. German only |
| [ ] | Slackline Industries | Oval Carabiner | Carabiner | – | – | – | – | – | – | US$14.99 (2022) | no | [archive](https://web.archive.org/web/20220125162626/https://slacklineindustries.com/products/oval-carabiner). EN362. Specs need a second look |
| [ ] | Slackline Industries | Shackle | Shackle | – | – | – | – | – | – | – | no | Archived URL listed, but no snapshot loaded |

## B. Generic stock hardware sold under a slackline shop's name

Per answer 1, a row here enters the seed only if the shop publishes an MBS for it. One row per size (answer 2).

**Slacktivity** (current, all 316 / 316L stainless unless noted):

| ✓ | Name | Style | Closure | MBS | Jaw | Pin | Weight | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|
| [ ] | 12mm Shackle \| Captive Pin | Shackle | screw pin (captive) | 60 | 23.5 | 12 | 204 g | €13.90 | WLL 12 |
| [ ] | Shackle \| 14mm | Shackle | screw pin | 80 | 28 | 14 | 326 g | €20.00 | WLL 16 |
| [ ] | Twisted Shackle \| 12mm | Shackle | screw pin | 60 | 22–24 | 12 | 234 g | €20.00 | WLL 12 |
| [ ] | 12mm D Shackle | Shackle | screw pin | 48 / 30 | (50?) | 11.6 | 254 g | €20.00 | "opening approx. 50 mm" looks like an inner length, not a jaw |
| [ ] | 8mm D Shackle | Shackle | screw pin | 20 | (32?) | 7.8 | 79 g | €10.00 | same ambiguity |
| [ ] | 6mm D Shackle | Shackle | screw pin | – | 12.4 | 5.6 | 26 g | €7.00 | WLL 3 kN only → notes |
| [ ] | Quick Link – 8mm \| Rustproof | Quicklink | sleeve | 25 / – / >1 | 10.5 | – | 77 g | €8.00 | |
| [ ] | 7mm Quick Link – INOX | Quicklink | sleeve | 14 / – / >1 | 9.5 | – | 51 g | €4.00 | |
| [ ] | 8mm Delta Quick Link – INOX | Quicklink | sleeve | 25 / – / >1 | 11 | – | 86 g | €9.00 | |
| [ ] | 5mm Delta Quick Link – INOX | Quicklink | sleeve | 8 / – / >1 | 8.5 | – | 24 g | €8.06 | out of stock |

**Balance Community:**

| ✓ | Name | Style | Closure | MBS | Jaw | Pin | Weight | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|
| [ ] | 8mm Twist Shackle | Shackle | screw pin | 29 | 16 | 8 | 80 g | US$13 | 316 stainless, WLL 6 |
| [ ] | 8mm Dee Shackle | Shackle | screw pin | 29 | 17 | 8 | 50 g | US$10 | 316 stainless, WLL 6 |
| [ ] | 12mm Bow Shackle | Shackle | – | – | – | – | – | – | historic, archived URL, no snapshot loaded |
| [ ] | 11mm Twist Shackle | Shackle | – | – | – | – | – | – | historic, as above |
| [ ] | 10mm Oval / 10mm Delta / 8mm Twist Quicklink | Quicklink | sleeve | – | – | – | – | – | historic, as above (3 rows) |

**raed** (current):

| ✓ | Name | Style | Closure | MBS | Jaw | Weight | Price | Notes |
|---|---|---|---|---|---|---|---|---|
| [ ] | Omega Stainless Steel Shackle 10mm | Shackle | screw pin | 42 | 21 | 116 g | €5.95 | |
| [ ] | Omega Stainless Steel Shackle 12mm | Shackle | screw pin | 65 | 27 | – | €9.95 | |
| [ ] | Omega Stainless Steel Shackle 10mm w/ Captive Pin | Shackle | screw pin (captive) | 45 | 20.4 | – | €11.95 | |
| [ ] | Omega Stainless Steel Shackle 12mm w/ Captive Pin | Shackle | screw pin (captive) | 65 | 25.6 | – | €13.95 | |

**SlackGear** (current, ZAR):

| ✓ | Name | Style | MBS | Jaw | Weight | Price | Notes |
|---|---|---|---|---|---|---|---|
| [ ] | 12mm Stainless Steel Bow-Shackle | Shackle | 60 | 25 | 230 g | R180 | WLL 12 |
| [ ] | 12mm Stainless Steel D-Shackle | Shackle | 60 | 25 | 190 g | R140 | WLL 12 |
| [ ] | 12mm Stainless Steel Twisty-Shackle | Shackle | 60 | 25 | 240 g | R140 | WLL 12 |
| [ ] | 8mm Stainless Steel D-Shackle | Shackle | 28 | – | 60 g | R50 | WLL 4 |
| [ ] | 8mm Stainless Steel Twisty-Shackle | Shackle | 28 | – | 75 g | R50 | WLL 4 |
| [ ] | 1.5t / 2t / 3.25t Bow-Shackle (Screw-Pin) | Shackle | – | – | 190 / 310 / 625 g | R30–50 | WLL only, material not stated (3 rows) |

**Spider Slacklines** (archive only, live shop 403; Slack Inov co-lists the range). Spider's
own-label rows are listed here. Its seven Green Pin shackles are Van Beest's and are excluded.

| ✓ | Name | Style | MBS | Jaw | Notes |
|---|---|---|---|---|---|
| [ ] | Twisted Shackles Stainless Steel 8mm (captive pin) | Shackle | 45 | – | WLL 0.8 t (2020) |
| [ ] | Twisted Shackles Stainless Steel 12mm | Shackle | 70 | 25 | WLL 1.8 t (2020) |
| [ ] | Bow Shackles Stainless Steel (sizes?) | Shackle | – | – | sizes and specs not loaded |
| [ ] | D Shape Shackles Stainless Steel | Shackle | – | – | |
| [ ] | Bow Shackle Galvanized High Strength Steel | Shackle | – | – | |
| [ ] | 1.5T / 1T D Shackles Galvanized Steel | Shackle | – | 19 / 17 | WLL only (2 rows) |
| [ ] | Soft Shackle Dyneema | Soft shackle | – | – | snapshot came back compressed and unreadable. Retry |
| [ ] | Steel Carabiner Oval Screw Nut | Carabiner | 28 / – / – (?) | – | screwgate, EN12275 |
| [ ] | Aluminium Carabiner Oval | Carabiner | 25 | 22 | 72 g, key-lock |
| [ ] | Aluminium Carabiner Lime S | Carabiner | 25 | 20 | 78 g |
| [ ] | Steel Carabiner D Screw Nut / Aluminium Mini Oval | Carabiner | – | – | 2 rows, specs not loaded |
| [ ] | Oval Quick Links 8 / 10 / 12 mm | Quicklink | 35 / 50 / 75 | – | EN12275 (3 rows) |
| [ ] | Oval Quick Links Stainless Steel, Delta Quick Links (+ PPE) | Quicklink | – | – | specs not loaded. "PPE Peguet" is filed under Peguet (§ C) |

**Slack Inov historic** (archive, about 2019, before the Spider merger):

- Inox shackle captive pin
- High-strength bow shackle
- Twisted shackle
- Inox shackle Ø6mm 15 kN
- Mini D carabiner (aluminium)
- Oval carabiner "Compact lock" (24 / 10 / 7, opening 16). This is probably a third-party model.
- 5T quick link
- Mini quick link

Specs are mostly not loaded. Kong Ovalone is excluded.

**Slack house** (current, PLN, Polish only → no descriptions; makers not stated, and the carabiner
names look like third-party models, so these need checking):

- Szekla nierdzewna Omega 10 / 12 mm
- Szekla nierdzewna Prosta 12 mm (jaw 25)
- Szekla nierdzewna Twist 8 / 10 / 12 mm
- Maillon Oval 7 mm
- Maillon Delta 10 mm
- Karabinek Oval zakręcany (steel, 30)
- Karabinek Oval Triple Lock (steel, 30)
- Karabinek Oval Pro 3Lock Steel (30)
- Karabinek D Steel Triple Lock
- Karabinek Guide XL 3Lock Alu
- Karabinek Oval Compact Lock Alu
- Karabinek Oval XL Lock Alu

No MBS is stated for any of the shackles.

**Slackliner.de** (Sigma Slacklines label, German only):

- Nirostahlschäkel 12mm (Edelstahl V4A): Bruchlast 6,000 kg → 58.8 kN (answer 4), WLL 1,500 kg, pin bearing
  24 mm, €7.95.
- NIRO Schäkel 12mm gedreht: no strength stated, €12.75.

**Aki Slacklines historic** (archive 2024): the Edelstahlschäkel range, in up to 11 rows:

- gerade 8 / 12 mm
- gerade 12 mm captive pin
- gedreht 8 / 10 / 12 mm captive pin
- geschweift 6 / 8 / 10 / 12 mm

The category page has an MBS table (17–56 kN) that still needs mapping row by row.

**Bera**: Manilha curva pino roscado 1/2" inox (32 kN, WLL 6.4 kN, out of stock). The URL says
"q-fix", so it may be another maker's.

**Slackline-tools historic**: "Classic08 Schäkel", archived URL only.

**Landcruising historic** (shop archived 2016, "Shackles Standard", no strengths stated, all
far-east stock):
- Stainless Steel Bow Shackle 10 / 12 / 13 mm
- Stainless Steel Straight Shackle 8 / 12 / 13 mm
- Niro shackle twisted 8 / 10 / 12 mm
- HW Stainless Bow / Straight Shackle 12 mm

Their "Shackles Stainless EU" and Green Pin shelves are Petersen, Wichard and Van Beest, so § C.

## C. Named makers

**Become brands, with the shops as `gear_sellers`** (answers 3 and 9). These rows still need specs
pulled before they enter the seed:

- **Peguet (Maillon Rapide)**, a new brand:
  - Slacktivity 6mm INOX (26 kN, 8 mm, 37 g), 8mm INOX (44 kN, 10.5 mm, 78 g), 8mm Galvanized
    (28 kN, 10.5 mm, 77 g);
  - BC 8mm Oval Quicklink (34 kN, 11 mm, 77 g, zinc-plated);
  - raed 7mm (45 kN);
  - Spider "Oval Quick Links PPE Peguet".

  The same Peguet part sold by several shops is **one row with several sellers**.
- **Van Beest / Green Pin**: BC's pair (§ A); Spider's seven Green Pins (bow 0.5 / 1.5 / 2 /
  3.25 t, D 0.5 / 1 / 1.5 t); Landcruising's Green Pins (historic). They enter only with an MBS
  (answer 1). Van Beest publishes an MBS for every Green Pin size, so it can come from Van Beest's
  own datasheet.

**Stay out:**
- **Kong**: raed 6mm / 8mm quicklinks; Slack Inov Ovalone.
- **Singing Rock**: SlackGear's three carabiners; Aki's "SR" oval.
- **Climbing Technology**: Slackliner.de Pillar Steel; Aki's CT oval; Spider's "Lime S".
- **CAMP**: all seven of Slack house's carabiners (Oval Compact Lock, Oval XL Lock, Guide XL 3Lock,
  Oval Pro 3Lock, the steel Oval / Oval Triple Lock / D Triple Lock); Slack Inov's "Mousqueton Oval
  Compact Lock". Dropped from the seed 2026-10-11 (operator).
- **Petzl**: Aki's OK, Sm'D, Oxan and Captiv.
- **Edelrid**: raed's Pure Slider.
- **Petersen, Wichard**: Landcruising's "Shackles Stainless EU" (historic).

## Security note — EQB / slackshop.cz

The home page of `slackshop.cz`, the website `manufacturers.json` gives for EQB, contains an
injected card skimmer. A script swaps the one-page-checkout payment step
(`onepagecheckoutps_step_three`) for a base64-encoded fake card form (card holder, number, MM/YYYY,
CVV) and stores the values with `setcookie` under the name `Presta_Shop`. This was seen in the HTML
fetched on 2026-10-11. The site was not crawled any further. **Undecided:** whether to drop or
replace EQB's `website` link on the live site, and whether to tell EQB.
