# Highline leashes — research pass and proposed data structure (2026-10-16)

> **Approved and seeded 2026-10-17** (operator): all 42 candidate rows are now `leashes.json` ids
> 1–42, in candidate order (staging ids 9001–9042), with their photos in `media/leashes/` and the four
> ISA:37 matches in `isa_certified.json`. Part 1 is kept as the research record.

Research for the `Leash` gear type (BACKLOG.md § "Leashes as a gear type"). Part 1 is what the manufacturers in `manufacturers.json` sell or sold,
from their live shops and their Wayback Machine captures. Part 2 is the data structure, with the
operator's decisions of 2026-10-16.

Prices are in the shop's own currency, as listed on 2026-10-16 unless marked historic, with the
capture date of the page they came from. "Leash" means the rope you tie between harness and ring.
"Set" or "kit" means a leash sold together with its ring(s).

---

## Part 1 — What exists

### How the sweep was done

- **Shopify feeds** (`/products.json`): Balance Community, Spider Slacklines US (slacklines.us),
  raed (now `raed-sports.com`), Gibbon, Slackliner.de, Slackline Industries, SlackX, Viper.
- **WooCommerce Store API** (searched for leash, longe, lonża, smycz, leine, correa, lanyard):
  Slacktivity, SlackGear, Bera, Geko, Slackhouse, Middle Way, YogaSlackers, lineGrip.
- **Wayback Machine**: a CDX listing of every archived URL containing *leash*, *longe* or
  *smycz* on about 85 brand domains, including every domain the seeds already cite through
  `web.archive.org`. Then the matching product and category pages were read.
  - **Limitation**: the listing finds pages by URL. Landcruising's T-Leash pages have no "leash"
    in their URL and only turned up through the shop's archived Highline category. A brand that
    named its leash something else in the URL can still be missing.
  - The Archive started answering 429 and then went "Temporarily Offline" near the end of the
    pass, so two pages were not read (see § Open items).
- **Live pages read directly**: EQB (slackshop.cz), Slack Mountain, slack.fr, Aki (closed, password
  page), lineGrip, Acrobat, Petram (now petramslack.com), Slackstar (now on sicherungsprofi.de),
  SlackLife BC (its product URLs now redirect to the homepage).
- **Blocked**: Slack Inov and Spider's EU shop answer 403 (Cloudflare), so they were read from
  Wayback captures, the newest from 2026-10-11. slacklineshop.co.nz answers 403. Cat on slack and
  A-Zero did not resolve (DNS).
- **No leash found**: EQB (rings only), Gibbon, Slackliner.de, lineGrip, Slackline Industries,
  SlackX, Viper (the Enigma ring only), Middle Way, YogaSlackers, Acrobat, Slackstar, Elephant,
  ZERGE (rings and a pouch only), Cat on slack (rings only), slackline-tools.de (photo galleries
  only), Mammut, Edelrid and the other climbing brands (not swept, see Q11).
- **Checked and ruled out**: slack.fr's *longes* (2012–2024) are anchor slings ("Longe de
  slackline large 220cm", "Longe light", "Longe avec boucles"), not leashes.

### Summary: 32 leashes from 18 brands

**Construction**:
- **T** = threaded: a rope inside tubular webbing.
- **R** = rope only: a single rope with no sleeve.

**Ring end** is how the leash meets the ring:
- **knot**: the user ties it, usually a figure-8.
- **sewn**: the eye is sewn to the ring.
- **spliced**: the eye is spliced around the ring.

**MBS** is the strength as the maker states it, with what was measured in brackets. A dash
means not stated.

| # | Brand | Name | Constr. | Core | Sleeve | Ø mm | Length(s) | Weight | MBS | Ring end | Rings | Price | Active | ISA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Balance Community | Threaded Highline Leash Kit | T | 9.8 mm dynamic (Sterling) | 11/16" Slack-Spec tubular | – | 3.50 / 3.75 m | 332 / 352 g | – | knot | none / 2× BC Loop | US$45–69 | yes | ISA:37 (`approved_gear_32`) |
| 2 | Balance Community | Alpine Leash Kit | T | 7.7 mm twin dynamic | 15 mm tubular nylon | – | 3.35 / 3.55 / 3.75 m | 234 / 247 / 262 g | – | knot | none / 2× BC Loop | US$41–69 | yes (new 2026-02) | – |
| 3 | Geko | Geko Leash Teñido | T | Tendon Ambition 10.5 dynamic | 25 mm tubular nylon, tactile twist marker | – | – | – | 12 kN (sleeve) | knot | none | MXN 600 (was 649) | ? (2025-02) | – |
| 4 | Slacktivity | Highline Leash | T, sewn ends | Edelrid Hummingbird Pro Dry 9.2 dynamic | 20 mm nylon tubular, black edges | – | 320 cm | 350 g with 1 ring | 17 kN (fig-8) | knot | none / 1 / 2× HighlineRing | €49–79 | yes | ISA:37 (`approved_gear_4`) |
| 5 | raed | PRO Highline Leash | R | braided polyester cover | – | 12.7 | 350 cm | – | 26 kN | knot | none | €19.50 | yes | ISA:37 (`approved_gear_10`) |
| 6 | raed | PRO Highline Sewn Leash Set | R | PRO leash | – | 12.7 | 250 cm | – | 26 kN (leash) | sewn | 1× HALO | €109.95–119.95 | yes | ISA:37 (`approved_gear_10`) |
| 7 | raed | ALPINE Highline Leash Set | R | 10.0 mm "high stretch" leash | – | 10.0 | 250 cm (350 unsewn) | 193 g with ring | 17 kN | sewn | 1× HALO | €109.95–119.95 | yes | ISA:37 (`approved_gear_11`) |
| 8 | Spider Slacklines | Highline Leash | T, sewn ends | CAMP Quasar 9.9 dynamic | 20 mm nylon tubular "LEASH LINE" | 12.5 | 335 / 360 cm | 345 / 385 g | 20 kN (fig-8) | knot | none / 1–2× 60 mm / HighRing / Vortex 2 | €22.46–24.13; US$34.95–38.45 | yes | – |
| 9 | Spider Slacklines | Spliced Highline Leash | R | 14 mm polyester, 12-strand core / 24 sleeve | – | 14 | 240 cm | 463 g with ring + Donut | 25 kN (fig-8) / 54 kN (splice) | spliced | 1× HighRing 80 mm | €66.63 | yes (temporarily unavailable) | – |
| 10 | Slack Inov | Dynamic leash (Longe dynamique) | R, sleeve optional | "Top Rock Ø11" dynamic | optional accordion sleeve | 11 | 3.4 m | – | EN892: impact < 8.2 kN, > 10 falls | knot | none (made for the Slackisûr) | €16.50 (2016–17) | no | – |
| 11 | Aki Slacklines | Aki T-Leash Cobra | T | Edelrid Cobra 10.3 dynamic | Aki Wave Tube, PU coated | 13.6 | 3.6 m | 375 g (104 g/m) | – | knot | none | €29.95 (2024) | no (Aki closed) | – |
| 12 | Landcruising | T-Leash 3,8m piece | T | Edelrid Osprey 10.3 dynamic | Landcruising Wave Tube (17 kN), PU coated | 13.6 | 3.8 m | 104 g/m | – | knot | none | €19.95 (2016) | no | – |
| 13 | Landcruising | T-Leash short single pieces | T | Edelrid Osprey 10.3 dynamic | Wave Tube | 13.6 | various short (one option: 350 cm) | 104 g/m | – | knot | none | €15.95 (2016) | no | – |
| 14 | Balancing Earth | (Rasta) Highline Leash, later "Highline Leash 11mm" | T | 11 mm Apex dynamic (15 UIAA falls) | 1" tubular (13.3 kN) | – | 12 ft (3.7 m) | – | – | knot | 2× stainless, medium 22.2 kN or large 44.4 kN | US$49.95 (2016–17) | no | – |
| 15 | Balancing Earth | Highline Leash 9.9mm | T | 9.9 mm BlueWater dynamic (15 UIAA falls) | 11/16" tubular | – | 12 ft (3.7 m) | – | – | knot | none / 2× medium / 2× large | US$49.95 (2019) | no | – |
| 16 | SlackLife BC | Highline Leash Rope | T | 9.9 mm dynamic (impact 7.8 kN, 7 UIAA falls) | tubular | – | 4 m | 500 g | – | knot | none | US$55.79 (2017) | no | – |
| 17 | SlackLife BC | Highline Leash Kit | T | (as #16) | tubular | – | 4 m | – | – | knot | 2× forged steel 22 kN, 8 cm ID | CA$102 (2020) | no | – |
| 18 | SlackLife BC | Bomber Highline Leash Kit | T | (as #16) | tubular | – | 4 m | – | – | knot | 1× forged 44 kN, 3" ID | US$50.58 (2019) | no | – |
| 19 | SlackLife BC | Pure Leash | T | (as #16) | tubular | – | 4 m | – | – | knot | 2× PureLoop 25 kN (Pure Slacklines) | US$64.23 (2019) | no | – |
| 20 | Pure Slacklines | PureLoop Leash | T | 9.8 mm dynamic | tubular web sheath | – | 3.5 m | 330 g (430 g with rings) | – | knot | none / 2× PureLoop | AU$39 (2018) | no | – |
| 21 | Slackhouse | Smycza 330 | T | 9.2 dynamic (Tendon Master Pro 9.2) | 18 mm tubular | 12 | 330 cm | – | – | knot | none / 2× Ring F Alu (formerly also Steel) | PLN 130 | yes | – |
| 22 | Slackhouse | Smycza 360 | T | 9.2 dynamic | 18 mm tubular | 12 | 360 cm | – | – | knot | none / 2× Ring F Alu | PLN 140 | yes | – |
| 23 | Slack Mountain | Leash 4 m | T | Beal Edlinger II or Tendon rope | 24 mm tubular or Slack Mountain Snake | – | 4 m rope / 3.5 m sleeve | 120 g/m | – | knot | none | €15.90 (2023) | ? | – |
| 24 | Bera Adventure | Leash para Highline com 2 anéis | T | Bera 10 mm dynamic (PA, 25 % @ 10 kN, 65 g/m) | 20 mm tubular | – | 3.70 m | – | 20 kN (rope) | knot | 2× Anel Duplo, 77 mm ID, 18 kN | R$210 | yes | – |
| 25 | Bera Adventure | Leash para Highline sem anel | T | (as #24) | 20 mm tubular | – | 3.70 m | – | 20 kN (rope) | knot | none | R$100 | yes | – |
| 26 | Bera Adventure | Leash para Freestyle com 2 anéis | T | (as #24) | 20 mm tubular | – | 3.70 m | – | 20 kN (rope) | knot | 2× aluminium, 60 mm ID, 35 kN | R$210 | yes (2025-11) | – |
| 27 | Souz Slackline | Leash | T | dynamic rope | tubular | – | 310 / 350 cm | 320 g | 20 kN, WLL 4 kN | knot | none | RUB 1,426–1,651 (2020) | no | – |
| 28 | Souz Slackline | Leash PP | T | **static** rope | polypropylene tubular, fused ends | – | 310 / 360 / 410 cm | – | 15 kN, WLL 4 kN | knot | none | US$18.86–29.52 (2023) | no | – |
| 29 | SlackGear | Highline Leash Kit | R | 11 mm dynamic | short tubular piece (protection only) | – | 3.70 m | 530 g with rings | – | knot | 2× SlackGear stainless, 50 mm ID, > 60 kN | R550 | sold out | – |
| 30 | SlackTech | Highline Leash Kit | T | 9.9 mm dynamic | 11/16" tubular nylon | – | 12 ft | – | – | knot | 2× forged steel 2 5/16" ID | US$45.95 (2014); leash only −$15.50 | no | – |
| 31 | SlackTech | Leash of Iktomi | R, spliced | – | – | – | 8 ft (tie-in) / 4 / 4.5 / 5 ft | < 1 lb | 39 kN (splice) / 19.5 kN (knot) | spliced | ring 39 kN | from US$154.95 (2019) | no (sold out) | – |
| 32 | Petram Slacklines | Leash Set Petram rings | R, spliced | Sirius 14 mm (WLL 7 kN) | – | 14 | 2.6 m | 151 g/m | 47 kN (splice) | spliced | 2× Petram aluminium, 60 mm ID, 20 kN | €55 | no ("discontinued for now") | – |

Four of these are ISA:37 certified, and those are exactly the four certificates BACKLOG.md
says are waiting on this type. raed's two certificates each cover a **set**, ring and sewn
connection included (product type "Leash"). BC's and Slacktivity's cover the **tether only**
(product type "Leash Teather" [sic]). Their rings are certified separately, as `approved_gear_3`,
`9` and `31`, which already match leash rings 26, 29 and 27.

### Details by brand

#### Balance Community (US)

**1. Threaded Highline Leash Kit** — active since at least 2012.
[Live page](https://www.balancecommunity.com/products/threaded-highline-leash-kit). ISA:37,
`approved_gear_32` (release 2026, tested 2025, "not needed" lab).
- **Now**: a 9.8 mm dynamic rope threaded through 11/16" Slack-Spec Tubular. BC sells Sterling
  9.8 mm Dynamic Rope "for the ultimate highline leash", which is presumably this one. A
  protection sleeve covers the ring attachment point.
- **Options**: colours Black, Blue, Green, Red, Silver. Lengths 3.50 m (11.5 ft) or 3.75 m
  (12.3 ft). Rings: none, 2× Purple Loops, 2× Maroon Loops, or 1 of each. The "Loop" is the BC
  Aluminum Leash Ring, 60 mm ID, 24 kN, already held as leash ring 27.
- **Prices**: leash only US$45 / 49, with two rings US$65 / 69. SKUs follow the pattern
  `S-LEASH-350-BLA-NR` / `K-LEASH-350-BLA-PUR`.
- **Weights** (Shopify grams): leash only 332 / 352 g, with rings 437 / 458 g.
- Blurb: "We have put this leash through exhaustive testing involving several hundred leash
  falls onto the same leash with zero signs of wear."
- **History**:
  - [2012](https://web.archive.org/web/20120610052820/http://www.balancecommunity.com/Threaded-Highline-Leash-Kit?):
    US$49.95, SKU `T-LEASH`, made in USA. 12 ft (3.65 m) end to end, 9.9 mm dynamic rope rated
    for 7 class-2 falls, 11/16" Slack-Spec (13.3 kN). It came pre-tied with a figure-8
    follow-through to **2× 2-5/16" ID forged steel rings, 22.2 kN each**. Total 1,240 g.
  - [2014](https://web.archive.org/web/20140610061852/http://www.balancecommunity.com/accessories/highline-accessories/highline-leashes):
    "Starting at $35.95", 1,240 g, nylon sheath / nylon core.
  - [2022](https://web.archive.org/web/20221102220658/https://www.balancecommunity.com/products/threaded-highline-leash-kit):
    US$39 leash only, US$55 with two black rings, US$69 with an orange or black BigLoop
    (leash ring 31).
- **Resold by Geko** (Mexico) as ["Leash"](https://gekoslacklines.mx/producto/leash), MXN 799,
  blue/red/green/black, no rings. Geko states 12.5 mm, 3.7 m, 368 g and MBS 13.3 kN (the
  sleeve's figure) and links back to BC's page.

**2. Alpine Leash Kit** — new, Shopify created 2026-02-11.
[Live page](https://www.balancecommunity.com/products/alpine-leash-kit).
- **Construction**: a 7.7 mm twin dynamic rope threaded through 15 mm tubular nylon, ring
  protection sleeve included.
- **Options**: colours Purple or Yellow. Lengths 3.35, 3.55 or 3.75 m; the length guide says
  3.60 m instead of 3.55. Rings: the same choice as #1.
- **Prices and weights**: leash only US$41 / 45 / 49 at 234 / 247 / 262 g. With rings
  US$61 / 65 / 69 at 341 / 354 / 369 g.
- "27% lighter than our standard Threaded Highline Leash." The maker notes that the thinner rope
  makes smaller knots, so the finished length is longer.
- No ISA certificate.

#### Geko (MX)

**3. Geko Leash Teñido** — "Edición limitada".
[Capture 2025-02](https://web.archive.org/web/20250213151632/https://gekoslacklines.mx/producto/leash_geko).
- **Construction**: Tendon Ambition 10.5 dynamic rope in 25 mm tubular nylon. The sleeve has a
  tactile twist indicator. Outer sleeve strength 12 kN. Length not stated. No rings.
- **Options and price**: green, light blue, dark blue, pink, ochre or orange. MXN 649, on sale
  at 600.
- Not returned by the live store search, so probably sold out or gone.
- Geko also resells BC's BigLoop and Loop rings.

#### Slacktivity (CH)

**4. Highline Leash** — active. [Live page](https://slacktivity.com/shop/highline-leash/).
ISA:37, `approved_gear_4` (Siebert Consulting, 2020-01, release 2019).
- **Construction**: Edelrid Hummingbird Pro Dry 9.2 mm dynamic rope threaded through 20 mm nylon
  tubular webbing with black edges "for detecting twists". The ends have been sewn since about
  2023, so sleeve and rope cannot slide apart.
- **Specs**: 320 cm. "Breaking load … with Figure-8: 17kN". The feature list names Hummingbird
  ECO Dry instead, EN 892, 6 % static / 31 % dynamic elongation. Leash plus ring weighs 350 g.
  Country of manufacture: Switzerland.
- **Options**: colours LSD, Green or White. Rings: none, single or double HighlineRing (leash
  ring 26: 6061-T6, 80/60 mm, 51 g, 39 kN). The page notes that the ring's laser print shows a
  lower, incorrect MBS.
- **Price**: €49 with no ring up to €79 with two (sale; the regular price is shown as €79).
- **Manuals**: [EN](https://slacktivity.com/wp-content/uploads/2021/02/Manual_EN_HighlineLeash_V1.pdf),
  [DE](https://slacktivity.com/wp-content/uploads/2021/02/Bedienungsanleitung_DE_HighlineLeash_V1.pdf).
- **History**:
  - [2019, slacktivity.ch](https://web.archive.org/web/20190825164212/https://slacktivity.ch/de/highlineleash):
    "HighlineLeash", from CHF 65, total 410 g. It came with **2× HighlineRing in 7075-T6, 48 g,
    20 kN, deforming from 5 kN, "Nicht PSA-zertifiziert"**, and a 320 cm WhiteTube (PA, 18 % at
    10 kN, 17 kN, 33.5 g/m). The page names the rope as Edelrid Topaz Pro Dry 9.2 mm in one
    place and Sterling Nano Fusion 9.0 mm in another.
  - [2019, slacktivity.com](https://web.archive.org/web/20190723120107/https://slacktivity.com/leash-short):
    "Leash (short)", €49.95, SKU `LEASH-1`, out of stock. "HighlineLeash 310-330cm", Topaz Pro
    Dry, "9,7mm Dynamic rope (18% @ 10kN)", 17 kN with figure-8, two green rings. Its text: "The
    shorter length is perfect for a middle leash".
  - [2021](https://web.archive.org/web/20210418182301/https://slacktivity.ch/shop/leash/): "ISA
    zertifizierte Highline-Leash", CHF 65, 350 g. Topaz or Hummingbird Pro Dry 9.2, with **one**
    6kN-preload-tested ring (6061-T6, 39 kN).
- **Accessories** (not leashes, see § Adjacent items): Leash Ring Padding and Magnet Leash
  Holder.

#### raed (DE) — now raed-sports.com

The three current products share one
[manual](https://raed-slacklines.com/media/attachment/file/r/a/raed-leash-manual_1.pdf), which we
already hold on the HALO ring (leash ring 29). Shopify product records were created on
2025-11-16, when the shop moved; the products themselves date from 2021.

**5. PRO Highline Leash** (the leash alone).
[Live page](https://raed-sports.com/products/pro-highline-leash). €19.50.
- **Construction**: 12.7 mm thick with a **braided polyester cover** with neon orange stripes,
  to identify twists. The core is not stated.
- **Specs**: 26 kN. Sent unsewn at the "classic 350cm leash length".
- "certified for the use in highlines after ISA:37".

**6. PRO Highline Sewn Leash Set** (raed sells it as "PRO Highline Leash Set"; renamed by the operator on 2026-10-17, so the name says what sets it apart from #5): the HALO Titanium ring (leash ring 29) plus the PRO leash, joined
by "an ISA:37 certified sewn connection".
[Live page](https://raed-sports.com/products/pro-leash-set).
- **Length**: 250 cm, because no knot is needed at the ring, which gives the same usable length.
- **Price**: €109.95 in Titanium, €119.95 in six anodised colours.
- [2021](https://web.archive.org/web/20210728155353/https://raed-slacklines.com/pro-highline-leash):
  €99.95, built as HALO + PRO leash + "1 x Sewn Loop End". In March 2024 there were nine
  "B-color" variant pages (second-quality colours).

**7. ALPINE Highline Leash Set**: HALO plus a **10.0 mm** leash, sewn.
[Live page](https://raed-sports.com/products/alpine-leash-set).
- **Specs**: 193 g total, ISA:37 certified 17 kN, "high stretch characteristics". The leash's
  construction is not stated.
- **Length**: 250 cm sewn, or 350 cm unsewn. The ALPINE leash is not sold on its own any more.
- **Price**: €109.95 / 119.95. "the lightest fully functional highline leash ever created."
- First listed in 2021 as `alpine-highline-leash-set`.

**History**:
- [2019](https://web.archive.org/web/20190826093537/https://raed-slacklines.com/leash-komplettset):
  "Leash Komplettset", €39: "2 Aluringen + gefädeltem **Statikseil**", a threaded **static**
  rope.
- [2020](https://web.archive.org/web/20200803203254/https://raed-slacklines.com/gear/highline-leashes):
  a "Highline Leash" at €26.95, the only item in the category. Its page was not read; see
  § Open items.

**Service**: "Leash Resewing Service", €33.95, a new PRO leash sewn onto your HALO.

#### Spider Slacklines (IT) and Slack Inov (FR)

The two shops co-list each other's ranges (CLAUDE.md § Co-listings).

**8. Highline Leash** — made in Italy, so it is Spider's.
- **Where it is listed**:
  - Spider's EU shop splits it into three product pages,
    [BLUE](https://web.archive.org/web/20261011120123/https://spider-slacklines.com/shop/en/leashes/1221-6632-highline-leash-9506919000.html)
    (€22.46, 17 reviews),
    [PINK](https://web.archive.org/web/20261011120123/https://spider-slacklines.com/shop/en/leashes/1322-7167-pink-highline-leash-9506919000.html)
    and
    [BLACK](https://web.archive.org/web/20261011120126/https://spider-slacklines.com/shop/en/leashes/1323-7191-black-highline-leash-9506919000.html)
    (€24.13 each).
  - [slacklines.us](https://slacklines.us/products/highline-leash) sells one product with
    colour variants, US$34.95–38.45. Refs: blue `HLSC3`/`HLSC6`, pink `HLSK3`/`HLSK6`, black
    `HLSB3`/`HLSB6`.
- **Construction**: CAMP Quasar 9.9 mm dynamic rope "with uniform thread & dry treatment" in
  20 mm nylon tubular "LEASH LINE", total Ø 12.5 mm. Both ends are sewn to fix the sleeve.
- **Specs**: 335 cm standard or 360 cm extra-long; the text also calls 330 cm standard. MBS
  "with fig-8 knot: 20 kN". 345 / 385 g without rings. Lifespan per CAMP, typically 10 years.
- **Options**: rings none, 1× or 2× 60 mm aluminium (leash ring 25), 1× 80 mm HighRing (32), or
  1× 65 mm Vortex 2 (33) in blue or purple. Ring protection: the Donut. A 20 cm protection
  sleeve is included.
- **Not for highlining**: the page says "our LEASH is not a personal protective equipment (PPE)
  … all manufacturers, including ourselves, have the duty to declare officially these products
  as not suitable for Highlining." Leashes have no field for this (Q9).
- **History** (as Spider and Slack Inov product 215):
  - [2020](https://web.archive.org/web/20200721113844/https://www.spider-slacklines.com/shop/en/leashes/215-highline-leash.html):
    €20.95. 360 cm standard, or 335 cm "Trick-Highline". **Model: CLASSIC leash or DYNAMIC
    leash** ("innovative … with crinkled sleeve"). Rings none, Vortex, or 2× 60 mm. Option of a
    30 cm TENDER sleeve.
  - [2021, Slack Inov](https://web.archive.org/web/20210928080259/https://slack-inov.com/shop/en/leashes/215-1613-highline-leash-9506919000.html):
    €16.35.
  - [2022](https://web.archive.org/web/20220818223855/https://slack-inov.com/shop/en/leashes/215-4000-highline-leash-9506919000.html):
    €20.45, HighRing and Vortex options added.
  - By [January 2023](https://web.archive.org/web/20230129221417/https://slack-inov.com/shop/fr/leash-highline/215-highline-leash-9506919000.html)
    the model selector was gone, although the description still described the accordion
    sleeve.
- **Resold by slack.fr**
  ([2022](https://web.archive.org/web/20220930232920/https://laboutique.slack.fr/en/417-highline-leash-threaded.html)):
  €29.13, 335 cm, "ONLY IN BLUE", as leash only, HighRing + leash, or Vortex + leash.

**9. Spliced Highline Leash** (ref `HLSS4`).
[Capture 2026-10-11](https://web.archive.org/web/20261011120126/https://spider-slacklines.com/shop/en/leashes/1287-7142-spliced-highline-leash-9506919000.html),
€66.63, "TEMPORARILY UNAVAILABLE".
- **Construction**: a Ø14 mm high-tenacity polyester rope ("12 fuses core, 24 fuses sleeve")
  spliced around an 80 mm **HighRing** and padded with a **Donut**.
- **Specs**: 240 cm, "same as 335 cm without fig-8 knot". **MBS 25 kN at the fig-8 end, 54 kN on
  the spliced side**. 463 g with ring and Donut. Lifespan 10 years.
- **Made in France**, although it is listed on Spider's shop; Spider's own leash is made in
  Italy. Whether Slack Inov makes it is not stated (Q8).

**10. Slack Inov "Dynamic leash" / "Longe dynamique"** (Slack Inov's old shop, 2016–2018).
[Capture 2017](https://web.archive.org/web/20170110182356/http://slack-inov.com/gb/leashs/16-dynamic-leash),
€16.50, black.
- **Construction**: a "Top Rock Ø11 hyper dynamic rope", sold as rope only or rope + sleeve. The
  sleeve is accordion-shaped, "preserving all the dynamical properties of the rope".
- **Specs**: 3.4 m. "Shock peaks according to EN892: <8.2KN", "Numbr of falls … >10".
- "Compatible with the Slackisûr" (leash ring 16). A 2016 review calls Slack Inov "le seul
  fabricant français à commercialiser des leash dynamiques".
- Its accordion sleeve looks like the ancestor of #8's DYNAMIC model. That is our inference, not
  the maker's statement.

**Leash accessories on their shops**:
- Spider's "Protective sleeve for leash", €0.82: 25 mm HT polyester, 30 cm, for leashes up to
  Ø20 mm.
- Slack Inov's "Tubular webbing leash cover".
- Spider's "Leash line sold by meter", the LEASH LINE sleeve webbing.
- The Petzl Connect Adjust lanyard, which sits in Spider's "Leashes" category but is a climbing
  lanyard (§ Adjacent items).

#### Aki Slacklines (DE) — closed

**11. Aki T-Leash Cobra**.
[2024](https://web.archive.org/web/20240919200711/https://aki-slacklines.de/en/products/aki-t-leash-cobra):
€29.95.
[2021](https://web.archive.org/web/20210927042323/https://aki-slacklines.de/de/soft-rigging/seil-leash/dynamikseil/167/aki-t-leash-cobra):
€26.95, article AK1190.
- **Construction**: Edelrid Cobra 10.3 mm in Aki Wave Tube with PU coating. The two-colour design
  (orange / light blue) helps spot twists. Each one is "einzeln in sorgfältiger Manufaktur …
  hergestellt".
- **Specs**: Ø13.6 mm, 3.6 m, 104 g/m, 375 g total, polyamide. No rings.
- The successor of Landcruising's T-Leash (#12): Aki's founder ran Landcruising, and Wave Tube
  is already a co-listed Landcruising webbing.
- **Also sold by Aki**: the "Aki Daimo Leash Thimble", €41.65 in 2024, no description captured;
  the Landcruising Leashholder, €4.95 (AK1060); and Edelrid Cobra 10.3 by the metre.

#### Landcruising (DE) — closed 2018

**12. T-Leash 3,8m piece**.
[Capture 2016-01](https://web.archive.org/web/20160113075543/http://www.landcruising-slacklines.de:80/en/shop/37-highline/384-),
€19.95.
- **Construction**: "Edelrid Osprey 10,3 mm" inside Landcruising Wave Tube (17 kN), with a PU
  abrasion coating. "threaded by Landcruising".
- **Specs**: Ø13.6 mm, 104 g/m, a fixed length of 3.8 m, which they called ideal when used with
  a leash holder.
- **Colours**: anthracite, bright blue, bright green, orange. An Edelrid Osprey manual is
  attached. No rings.

**13. T-Leash short single pieces**.
[Capture 2016-01](https://web.archive.org/web/20160113075605/http://www.landcruising-slacklines.de:80/en/shop/37-highline/483-),
€15.95.
- The same construction in "various shorter length", for "smaller persons or leash guidance
  between the legs". The only option captured was brightgreen-350cm (+€1.51).
- These look like offcut lengths of #12, so they may be one product (Q4).

**Accessory**: the Landcruising Leashholder, €8.95, "Our tiny tool for holding the highline leash
sidewards on the harness".

#### Balancing Earth Slacklines (US) — closed

**14. Rasta Highline Leash**, product code `RHL`
([2016](https://web.archive.org/web/20160605203542/http://www.balancingearthslacklines.com/accessories_highline_leash_highline_longline_p/rhl.htm)).
It became "Highline Leash", code `HLL`
([2017](https://web.archive.org/web/20170721225140/http://www.balancingearthslacklines.com/accessories-highline-leash-highline-longline-p/hll.htm)),
and was listed as "Highline Leash 11mm" by 2019.
- **Price**: US$49.95.
- **Construction**: BES's own 1" tubular Rasta webbing (13.3 kN) with 11 mm Apex dynamic rope
  (15 UIAA falls) threaded through.
- **Specs**: 12 ft (3.7 m).
- **Rings**: 2× drop-forged stainless steel, medium (22.2 kN each) or large (44.4 kN each,
  +$10).
- **Colours** (2017): Purple, Rasta, Yellow. Country of manufacture: US.

**15. Highline Leash 9.9mm**, code `HLL9`
([2019](https://web.archive.org/web/20191022091216/http://www.balancingearthslacklines.com/accessories-highline-leash-highline-longline-p/hll9.htm)).
- **Price**: US$49.95. "the industry standard size".
- **Construction**: 9.9 mm BlueWater dynamic rope in 11/16" tubular. 12 ft.
- **Options**: Blue or Green. Rings medium, large (+$10), or leash only (−$15). The page gives
  the large ring as "44.4 kN (5,000 lbf)", where the lbf is a copy error.

#### SlackLife BC (CA) — the shop's product pages are gone

All four are one leash rope, SlackLife's own "Threaded Highline Leash", sold with different
rings. That is the clearest case for Q2.

**16. Highline Leash Rope**, SKU `LEASH-ROPE`
([2017](https://web.archive.org/web/20171029231558/http://slacklifebc.com/product/highline-leash-rope/)),
US$55.79.
- **Construction**: 4 m (13 ft) of 9.9 mm dynamic climbing rope threaded through tubular
  webbing. Rope spec: impact force 7.8 kN, 7 UIAA falls, static 8.4 %, dynamic 35.5 %.
- **Options**: Red or Black. 500 g. "Leash ropes should be retired after 3 years."

**17. Highline Leash Kit**, `LEASH-BMBER-KIT-1`
([2020](https://web.archive.org/web/20201030192259/https://slacklifebc.com/product/highline-leash-kit/)),
CA$102.
- The rope plus 2× drop-forged steel rings.
- **Rings**: 3 1/8" × 3/8", 22.2 kN, gold, proof loaded to 16 kN, 8 cm ID, certified to
  ANSI/ASSE Z359.12-2019 and CSA Z259.12-16. "Always use as a pair".

**18. Bomber Highline Leash Kit**, `LEASH-BMBER-KIT`
([2019](https://web.archive.org/web/20191115232109/https://slacklifebc.com/product/bomber-highline-leash-kit/)),
US$50.58.
- The rope plus **one** 3" ID forged ring, proof-load tested to 10,000 lbs (44 kN), "use a
  single ring".

**19. Pure Leash**, `LEASH-PURE`
([2019](https://web.archive.org/web/20190214170844/https://slacklifebc.com/product/pure-leash/)),
US$64.23.
- The rope plus a pair of Pure Slacklines **PureLoop** aluminium rings: 25 kN each, 60 mm ID,
  50 g.

**Not read**: the 2025 menu also lists an **"Alpine Bounce Leash"**. The Archive was offline
before its page could be read.

#### Pure Slacklines (AU) — closed

**20. PureLoop Leash**
([2018](https://web.archive.org/web/20180312023844/https://pureslacklines.com.au/products/pureloop-leash)),
AU$39.
- **Options**: complete leash in Black or Red, leash rope only in Black or Red, or a pair of
  PureLoop rings.
- **Construction**: "burly 9.8mm dynamic climbing rope and a tubular web sheath", 3.5 m.
- **Weights**: leash rope 330 g, complete 430 g.
- **Rings**: PureLoop, 25 kN MBS ("doubled up 50kN"), 60 mm ID, 50 g each. **This ring is not
  in `leashrings.json`.**

#### Slackhouse (PL) — live

**21. Smycza 330** and **22. Smycza 360**.
[330](https://slackhouseshop.pl/produkt/smycza-330/) costs PLN 130 and
[360](https://slackhouseshop.pl/produkt/smycza-360/) PLN 140, both in stock.
- **Construction**: "Klasyczna dwuwarstwowa, wiązana lonża highline". A 9.2 mm dynamic rope in
  18 mm tubular webbing, with an extra sleeve at the ring contact point.
- Every leash now has a single black stripe for spotting twists. Sold with or without two "Ring F
  Alu".
- **History**:
  - [2020, 330](https://web.archive.org/web/20201020000430/https://slackhouseshop.pl/en/produkt/leash-smycza-330/):
    €17.92, Ø12 mm, rope Tendon Master Pro 9.2. Colours Neo, Red, Sol, Pur. Rings: none,
    2× Ring F Steel (€11.03) or 2× Ring F Alu (€19.30).
  - [2021, 360](https://web.archive.org/web/20211202193150/https://slackhouseshop.pl/en/produkt/highline-leash-smycza360/):
    €19.99, Ø12 mm. Colours Neo, Red S, Blu S, Sol, where "The model S has a single black
    stripe". The stripe later became standard.
- The rings are not the RING77 we hold (leash ring 13).

#### Slack Mountain (FR)

**23. Leash 4 m**, captured
[2015](https://web.archive.org/web/20150613074039/http://slack-mountain.com/shop/fr/cordes/70-leash-4-m.html)
to [2023](https://web.archive.org/web/20230202142942/https://slack-mountain.com/en/rope/70-2786-leash-4-m.html),
€15.90. Not on the current site's menus.
- **Options**: ready to use, or as a DIY kit (4 m rope + 3.5 m strap "to be stuffed yourself").
- **Construction**: "EDLINGER II BEAL rope or tendon rope", "24mm Tubular or Slack Mountain
  Snake", 120 g/m. "A leash must be changed every 9 falls factor 2 (Beal standards)". Made in
  France.

#### Bera Adventure (BR) — live

All three share one leash.
- **Construction**: Bera's 10 mm dynamic rope (100 % polyamide, 25 % at 10 kN, 20 kN, 65 g/m)
  in 20 mm tubular webbing, 3.70 m, with a protection sleeve. The text calls the sleeve both
  "nylon" and "poliéster".
- **Colours**: black, gold yellow, royal blue, "BOB", red, orange, lilac, flag green.

**24. Leash para Highline com 2 anéis**:
[live](https://www.beraadventure.com.br/product/leash-para-highline-com-2-aneis/), R$210, SKU
`CPLV002`. Comes with 2× Anel Duplo (leash ring 34: 77/99 mm, 18 kN, 90 g each).

**25. Leash para Highline sem anel**:
[live](https://www.beraadventure.com.br/product/leash-para-highline-sem-anel/), R$100, SKU
`CPLV004`. No rings.

**26. Leash para Freestyle com 2 anéis**:
[2025-11](https://web.archive.org/web/20251111171501/https://www.beraadventure.com.br/product/leash-para-freestyle-com-2-aneis/),
R$210, SKU `CPLV002-1`.
- Smaller rings, so a foot cannot catch in them during tricks: 2× aluminium, **60/85 mm, 35 kN,
  80 g each**.
- **This ring is not in `leashrings.json`.**

#### Souz Slackline (RU) — closed

**27. Leash**
([2020](https://web.archive.org/web/20200921092134/https://souzslackline.com/product/leash/)),
RUB 1,426–1,651.
- **Construction**: "high quality denamic rope rope clothed with tubular webbing".
- **Specs**: 310 or 350 cm, 320 g, MBS 20 kN, WLL 4 kN.
- **Colours**: Black, Red, Black Red.
- "It must be using with one leashprotector or with 2 leashrings". The Leash Protector is leash
  ring 24.

**28. Leash PP**
([2023](https://web.archive.org/web/20230207145556/https://souzslackline.com/leash-pp.html)),
US$18.86.
- **Construction**: "a **static** climbing rope threaded through a polypropylene tubular sling
  that is securely fused at the ends". It attaches "to the main and back-up highline lines at
  the same time".
- **Specs**: MBS 15 kN, WLL 4 kN.
- **Lengths**: 310, 360 (+$8.20) or 410 (+$10.66); the page writes "m" for cm.

#### SlackGear (ZA)

**29. Highline Leash Kit**.
[Live, out of stock](https://www.slackgear.co.za/product/highline-leash-kit/), R550; the page
dates from 2014.
- **Contents**: 2 leash rings, 3.70 m of 11 mm dynamic rope and a short piece of tubular webbing.
  So it is **not threaded**: the webbing only protects the ring end.
- **Weight**: 530 g.
- **Rings**: SlackGear's welded stainless Leash Rings (leash ring 15: 50 mm ID, > 60 kN).
- The "LeashBuddy" (R15, 18 g), a leash holder, is listed beside it.

#### SlackTech (US) — closed

**30. Highline Leash Kit**
([2014](https://web.archive.org/web/20140506005834/http://slacklinetechnology.com/highline-leash-kit.html)),
US$45.95, or leash only for $15.50 less. Made in USA.
- **Construction**: 12 ft of 9.9 mm dynamic rope in finely woven 11/16" tubular nylon, tied with
  a figure-8 to 2× 2 5/16" drop-forged steel rings, each proof loaded to 3,600 lbf.
- **Rows** (operator, 2026-10-17): no rings (37, US$30.45) and with 2 rings (43, US$45.95), one
  group. The rings are leash ring 35, SlackTech's 2 5/16" ID steel ring (rated 5,000 lbs, US$7.75
  each). SlackTech also sold a 3" ID steel ring (leash ring 36, rated 10,000 lbs).

**31. Leash of Iktomi**
([2019](https://web.archive.org/web/20190511201818/http://slacklinetechnology.com/shop/highline-leash-of-iktomi)),
from US$154.95, sold out, made in USA. "the next step in highline leash evolution".
- **Options**: 8 ft (Tie-in), 4 ft, 4.5 ft or 5 ft.
- **Specs**: ring 39 kN, spliced rope 39 kN, knotted rope 19.5 kN, "Harness Ring Connection (x2):
  44 kN", total weight < 1 lb, colour "Hot".
- It seems to be a spliced system with a ring at the harness end too. The construction is not
  described further.

#### Petram Slacklines (PL) — live page, product discontinued

**32. Leash Set Petram rings**.
[Live page](http://www.petramslack.com/shop-1/leash-set-petram-rings), €55, SKU `LSH`, out of
stock: "Due to no Petram's leash rings in stock. Leashes are discontinued for now."
- **Construction**: a spliced leash, "spliced by a professional arborist". The ring eye is
  spliced: no tying errors, and lighter and stronger than a knot.
- **Rope**: Sirius, 14 mm, 151 g/m, WLL 7 kN, MBS 47 kN in the splice. 2.6 m.
- **Rings**: 2× flat-bottom Petram aluminium, already held as leash ring 23: 80/60 mm, 52 g,
  MBS 20 kN, WLL 4 kN, each tested to 5 kN.
- Petram also sells "Leash Rings Padding" (€12).

### Adjacent items found (not leashes)

- **Ring padding**:
  - Slacktivity Leash Ring Padding: €24–39, single or double, TPU 85A, with free 3D-print files.
  - Spider DONUT: sizes for the 80 mm HighRing, 2× 60 mm and 1× 60 mm rings, US$10.50–18.50.
    "Do not use this ring as a standalone leash ring!"
  - Petram Leash Rings Padding: €12.
  - The `RingPadding` model on branch `bungees_ringpadding` was made for this.
- **Leash holders**:
  - Slacktivity Magnet Leash Holder: €19, about 22 cm, about 20 g.
  - Landcruising Leashholder: €8.95; €4.95 at Aki.
  - SlackGear LeashBuddy: R15, 18 g.
- **Protection sleeves and leash materials by the metre**:
  - Spider: protective sleeve, LEASH LINE webbing.
  - Slack Inov: tubular leash cover.
  - BC: rope sleeving, Sterling 9.8 rope, 11/16" Slack-Spec.
  - Aki: Edelrid Cobra.
- **Service**: raed Leash Resewing.
- **Thimble**: Aki Daimo Leash Thimble.
- **Not a highline leash**: the Petzl Connect Adjust lanyard (Spider) and Spider's "Dyneema rope
  mini leash for gear".
- **Rings seen in leash kits that we do not hold**:
  - PureLoop (Pure Slacklines)
  - Bera's 60/85 mm freestyle ring
  - Slackhouse Ring F Alu / Ring F Steel
  - SlackLife BC's 22 kN gold ring and 44 kN bomber ring
  - Balancing Earth's medium and large stainless rings
  - SlackTech's 2 5/16" and 3" steel rings
  - Viper's Enigma ring (live on Viper's Shopify)

  BC's 2012 2-5/16" steel ring may be our "Medium Steel Ring" (leash ring 12, 59 mm ID); not
  checked.

### Inconsistencies in the sources

Each needs a decision when the row is entered.

- **Slacktivity 2019** names two different ropes (Topaz Pro Dry 9.2 and Sterling Nano Fusion
  9.0), and the "Leash (short)" says 9.7 mm. The current page says both Hummingbird **Pro** Dry
  and **ECO** Dry.
- **BC Alpine**: the 3.55 m variant is called 3.60 m in the length guide.
- **Spider**: 335 cm "standard" in the specs, 330 cm "standard" in the text.
- **Bera**: the sleeve is called nylon in one sentence and polyester in another.
- **Balancing Earth 9.9mm**: "Large - 44.4 kN (5,000 lbf)".
- **Souz Leash PP**: lengths written "310m / 360m / 410m".
- **Slack Inov 2016**: "Top Rock Ø11" is not an identified rope model.

### Open items

- **raed 2020 "Highline Leash"** (€26.95, `raed-slacklines.com/highline-leash`) and **SlackLife BC
  "Alpine Bounce Leash"**: not read because the Archive was offline. Re-run once it answers.
- **Slack Inov's live range**: only reachable from a real browser (403). It may carry the
  Spliced leash under its own name, which would settle Q8.
- **Cat on slack, A-Zero, slacklineshop.co.nz**: unreachable this time.

---

## Part 2 — Proposed data structure

The current types are the template: a `Base<X>` / table / `Public` / `Create` / `Update` model, a
`crud_router`, an entry in `GEAR` and `COLLECTIONS`, seeds in the model's own field names, and
explicit ids. **Every question below was answered by the operator on 2026-10-16**, either directly
or as "everything else as recommended". Each heading records the decision; the options considered
are kept underneath.

### What the research says the model has to carry

1. **Two build families**:
   - **Threaded**, a rope inside tubular webbing: 24 of the 32.
   - **Rope only**: raed PRO / ALPINE, the spliced leashes, Slack Inov's sleeve-optional leash,
     SlackGear's kit (bare rope, protection piece only).
2. **Three ring ends**: knot (most), sewn (raed sets), spliced (Spider Spliced, Petram, Iktomi).
   This changes the length: 240–260 cm sewn or spliced against 320–400 cm knotted.
3. **The core is usually a named third-party climbing rope**: Edelrid Hummingbird, Topaz, Cobra
   or Osprey; CAMP Quasar; Sterling; Tendon; Beal; Apex; BlueWater. Its type matters for safety:
   Souz's Leash PP and raed's 2019 set are **static**.
4. **Almost every leash comes in 2–3 lengths.** Weight and price follow the length.
5. **Rings are an option on most leashes** ("none / 1 / 2 rings"), and the rings are mostly ones
   we already hold in `leashrings.json`.
6. **Strength is stated in incompatible ways**: knot strength, splice strength, the sleeve's
   strength, rope EN 892 data (impact force, falls), and WLL.
7. **Twist marking** (stripes, edges, two-colour sleeves) is a selling point on seven of them.
8. **ISA:37** certifies either the tether or a whole sewn set.

### Q1. A gear type of its own — DECIDED: a, a new `Leash` type

| Option | For | Against |
|---|---|---|
| **a. New `Leash` type** (`leashes.json`, `/leash`, a "Leashes" tab after Leash Rings) | Matches how shops and the ISA treat leashes. Gives the four waiting ISA:37 certificates a home. Its own filters (length, construction, ring end) | One more type to wire through the checklist |
| b. Fold into Leash Rings as "leash systems" | No new tab | Mixes hardware and rope, so the ring filters (material, ID) mean nothing for a leash |
| c. Treat leashes as kits (Starter Kits) | Sets are kits | Starter kits are webbing + tensioner. Most leashes are sold without rings |

### Q2. What one row is, and how rings attach — DECIDED: a, link to leash rings

Most leashes are one product with a ring option (BC, Spider, Slacktivity, Slackhouse, Bera,
Pure, Balancing Earth). raed's sets have the ring sewn on permanently. SlackLife BC sold one
leash rope under four product names, one per ring choice.

| Option | For | Against |
|---|---|---|
| **a. One row per leash; rings are a reference list** `ring_options: [{leashring_id, count}]`. A permanently sewn or spliced ring is the same list plus `ring_end: Sewn`/`Spliced`, and that set is its own row | One row per thing that is actually made. Ring specs stay on the ring rows. The detail page can link "comes with 2× HighlineRing" | **The first cross-link between gear types**; CLAUDE.md says there are none. Every edit, merge and import has to keep the ids valid, as ISA match blocks do today |
| b. One row per leash; rings described in text | No cross-link. Quick to import | Ring data duplicated and unfilterable. Goes stale when a ring row is corrected |
| c. One row per purchasable configuration (leash only / +1 ring / +2 rings) | Each row has an exact price and weight | Explodes the rows and duplicates the leash specs. ISA matches would fan out |

**Decided: a.** So:
- `ring_options` is a JSON list, validated at load the way `gear_sellers` names are validated
  against `manufacturers.json`. The loader refuses an id that is not a leash ring, and reports a
  ring whose `"<brand> <name>"` no longer matches, as `load_isa_certifications.py` does.
- **Only rings we already hold are linked.** New leash rings are out of scope (Q11), so a ring a
  leash is sold with but we do not hold is named in the leash's `notes` instead. The leashes this
  affects:
  - Pure Slacklines PureLoop Leash and SlackLife BC's Pure Leash option (PureLoop ring);
  - Bera's freestyle leash (60/85 mm ring);
  - Slackhouse Smycza (Ring F Alu / Steel);
  - SlackLife BC's 22 kN and 44 kN rings;
  - Balancing Earth's medium and large stainless rings;
  - SlackTech's 2 5/16" steel rings, and BC's 2012 steel rings (history only, Q6).
- Merging or deleting a leash ring has to re-point or refuse the leashes that name it. Nothing
  checks that today, because no gear type points at another.

**Exceptions, one row per option (operator, 2026-10-17).** Where a maker sells the same leash in
priced options, these are rows of their own in the leash's group, each with its own price, weight
and `ring_options`:
- **BC Threaded Highline Leash Kit**: 3.50 m and 3.75 m, each with no rings (US$45, 49) or two BC
  Loop rings (US$65, 69) — ids 1–4.
- **Slacktivity Highline Leash**: no ring (€49), one ring (€65), two rings (€79) — ids 9–11.
- **Slack Inov Dynamic leash**: rope only or threaded (rope + sleeve) — ids 18–19.
- **SlackTech Highline Leash Kit**: no rings (US$30.45) or two 2 5/16" steel rings (US$45.95) —
  ids 37 and 43.

The comparison table on the detail page then reads "N options" and shows a Rings and a
Construction column where the rows differ in them.

### Q3. Leash only vs set — DECIDED: as recommended

- **raed**: PRO Highline Leash, PRO Highline Sewn Leash Set and ALPINE Leash Set are **three leashes**. The sets
  are sewn, shorter (250 cm), and certified as sets.
- **SlackLife BC**: Rope, Kit, Bomber Kit and Pure Leash are **one leash** (the leash rope). Its
  `ring_options` are empty, because none of the three rings is one we hold (Q2). The kit names
  and their rings go in `notes`.

### Q4. Lengths — DECIDED: a, one row per length

| Option | For | Against |
|---|---|---|
| **a. One row per length, grouped by `product_group` (as connectors do sizes)** | Consistent with connectors. Each row has its exact weight and price | Doubles or triples the rows for what every shop sells as one product. ISA matches must list every length |
| b. One row; `lengths` as a JSON list of `{length_cm, weight_g}` | One row per product, with weight per length kept | A JSON column. The edit form needs a list editor |
| c. One row; `length` = the standard length only, other lengths in `notes` | Simplest | Loses data the shops do publish |

Each length is its own row, with its own `length`, `weight` and `price` (leash only; ring prices
go in `notes`). What follows:
- **About 45 rows** instead of 32: BC Threaded 2, BC Alpine 3, Spider 2, Souz Leash 2, Souz PP 3,
  SlackTech Iktomi 4 (if its "8 ft (Tie-in)" counts as a length), everything else 1.
- Slackhouse's **Smycza 330 / Smycza 360**, which the maker already sells as two products, become
  one leash in two lengths.
- Landcruising's **T-Leash short single pieces** (#13) becomes the 350 cm row next to the 3.8 m
  T-Leash (#12).
- ISA:37 match blocks list every length row of a certified leash (BC Threaded: 2 rows).
- `ring_options` is repeated on each length row.

**Q4b. The lengths of one leash share a `product_group` — DECIDED: a, as recommended.** For
example `product_group: "Threaded Highline Leash Kit"` on both BC rows. The listing then shows one
card with length and weight ranges, which `groups.ts` already does. Until now `product_group`
meant "one product stated by several makers or shops"; this adds "one product in several
lengths". So `VendorTable.tsx` needs a leash column set that shows each row's length, not its
shop.

### Q5. Colour variants and per-shop splits — DECIDED: one row, as recommended

Spider's EU shop has three pages for one leash (Blue / Pink / Black, at €22.46 vs €24.13). It is
one leash. Colours go in `notes`, and the price is the cheapest colour.

### Q6. Versions over time — DECIDED: a, one row, history in notes

Products changed while keeping their name:
- BC: steel rings (2012) → BC Loop (today).
- Slacktivity: two 20 kN rings, Topaz → one 39 kN ring, Hummingbird, sewn ends.
- Spider: CLASSIC / DYNAMIC models → one model.

Each row describes the current (or last sold) version, and earlier versions are summarised in
`notes`. A product the maker named separately stays separate: the Landcruising T-Leash (#12/#13)
and the Aki T-Leash Cobra (#11) are different leashes, with different makers, ropes and lengths.

### Q7. Fields — DECIDED: as recommended, with one strength field

The common fields carry over from the other types:
- `name`, `brand`, `release_date`, `product_url`, `price`, `currency`
- `description`, `version`, `notes`, `active`
- `gear_sellers`, `product_group`
- `isa_certified` / `isa_certificate` / `isa_warning`

**Not carried over**: `manufacturer_not_for_highline` and its `_source` (Q9).

Leash-specific fields:

| Field | Type | From the data | Notes |
|---|---|---|---|
| `construction` | enum `LeashConstruction`: **Threaded** / **Rope** | 24 threaded, 8 rope-only | Required. A sleeve-optional leash (Slack Inov) is Rope, with the option in notes |
| `ring_end` | enum `RingConnection`: **Knot** / **Sewn** / **Spliced** | knot 27, sewn 2, spliced 3 | "Knot" covers BC's pre-tied 2012 kit |
| `core_type` | enum: **Dynamic** / **Static**; null = not stated | 1 static (Souz PP) | A filter. Shown as "Rope Type" |
| `core_rope` | str | e.g. "Edelrid Hummingbird Pro Dry 9.2" | Free text: a named third-party product, not a brand we hold. Shown as "Rope": inside the sleeve, or the whole leash on a rope leash |
| `core_diameter` | float, mm | 7.7–11 | |
| `sleeve_material` | enum: **Nylon** / **Polyester** / **Polypropylene** / **Other** | | Null for rope-only leashes |
| `sleeve_width` | float, mm | 15–25 (11/16" ≈ 17.5, 1" ≈ 25.4) | |
| `diameter` | float, mm | 10–14 | Overall, as stated |
| `length` | float, cm | 240–410 | One per row (Q4). For a sewn or spliced leash, the length as sold |
| `weight` | float, g | | This length, leash only (with ring where it is sewn or spliced on) |
| `breaking_strength` | float, kN | 15–47 | **One value** (operator): the strength the maker states for the leash. Named as on leash rings |
| `ring_options` | JSON list `{leashring_id, count}` | see Q2 | Rings we hold only |
| `twist_marker` | bool | 7 true (#3, 4, 5, 6, 11, 21, 22) | Stripes, edges, two-colour, tactile |

**Which figure goes in `breaking_strength`.** Where the maker states two, it holds the **lower**,
which is the knotted end, the one that fails first:
- Spider Spliced: 25 kN, not 54 kN on the spliced side;
- SlackTech Iktomi: 19.5 kN, not 39 kN on the spliced side.

The other figure goes in `notes`. So do figures for a component rather than the leash: the
sleeve's strength (BC 13.3 kN, Geko 12 kN) and the core rope's alone (Bera 20 kN). The rope's
EN 892 data (impact force, UIAA falls, elongation) is in `notes` too, not in fields.

### Q8. Who makes the Spliced Highline Leash — DECIDED: Slack Inov makes it, Spider sells it

It is listed on Spider's EU shop but "Made in France", while Spider's own leash is made in Italy.
First filed under Spider, where it is sold. **Changed 2026-10-17 (operator):** the ISA's Notice of
2026-09-01 on this leash names **Slack-Inov** as its maker, so it is filed under Slack Inov, with
Spider Slacklines as a seller (`gear_sellers`). The notice is ISA warning 83, matched to leash 17.

### Q9. "Not for highlining" — DECIDED: leashes do not have that field

`manufacturer_not_for_highline` and `manufacturer_not_for_highline_source` are **not on the
`Leash` model**. Spider's disclaimer ("all manufacturers, including ourselves, have the duty to
declare officially these products as not suitable for Highlining") is not recorded as a field.

### Q10. Which candidates to import — DECIDED: all 32, historic too, as staging

All 32 leashes, historic ones as `active: false`, and **all of them as staging candidates**, not
straight into `leashes.json`:
- they go in `candidates/leashes.json` (untracked, git-excluded, like the other candidate files),
  in the seed's own shape, with **temporary ids from 9000**;
- `python3 candidates/stage.py apply|revert|status` loads them into the local dev catalogue for
  review on the frontend, and `revert` removes everything with an id ≥ 9000;
- approving one is the usual move: the entry goes into the root `leashes.json`, gets a real id
  from `scripts/backfill_seed_ids.py`, and the catalogue is re-seeded.

What follows from this:
- **`stage.py` needs updating before it can stage anything.** It still imports the per-type
  loaders (`load_connectors`, `load_webbings`, …), which were replaced by the single
  `load_data/load_gear.py` on 2026-10-13, and it has no `leashes` entry. It also predates the
  catalogue store, so it only works against the SQLite catalogue, not in store mode.
- The static-core **Souz Leash PP** is staged like the rest, with `core_type: Static`.
- **raed's 2019 static "Leash Komplettset" is not staged.** It is not one of the 32: its page gives
  nothing but "2 Aluringen + gefädeltem Statikseil" and a price. Its row would hold almost no data.
- **Slack Mountain** "Leash 4 m" is staged with `core_rope` left null, because its rope is "Beal
  Edlinger II **or** Tendon"; both are named in `notes`.
- **Landcruising T-Leash short** is the 350 cm row of the T-Leash (Q4).

### Q11. Scope — DECIDED: all three left out

- **Accessories** (ring padding, leash holders, sleeves).
- **New leash rings** found here. Rings a leash comes with but we do not hold are named in its
  `notes` (Q2).
- **Climbing-brand lanyards** (Petzl Connect Adjust, Edelrid and others).

### ISA:37 matches

These go into `isa_certified.json` when the leashes leave staging, since a match block needs a real
id. Until then `candidates/isa_matches.json` holds them against the staged ids, and
`candidates/stage.py apply` certifies the staged rows from it through the loader's own name check.

| Certificate | Product type | Matches |
|---|---|---|
| `approved_gear_4` Slacktivity HighlineLeash | Leash Teather | #4 Highline Leash |
| `approved_gear_32` BC Threaded Highline Leash | Leash Teather | #1 Threaded Highline Leash Kit, both length rows |
| `approved_gear_10` raed PRO leash | Leash (set) | #6 PRO Highline Sewn Leash Set **and** #5 PRO Highline Leash. raed's page for the leash alone says it is "certified for the use in highlines after ISA:37", although the certificate's link is the set |
| `approved_gear_11` raed ALPINE leash | Leash (set) | #7 ALPINE Leash Set |

The loader rule in `load_isa_certifications.py` becomes: ISA:37 certificates of product type
"Leash" or "Leash Teather" certify a leash row, and "Leashring" certificates keep certifying leash
rings. Leashes get `isa_certified` / `isa_certificate`, with no class.

### Model

```python
class LeashConstruction(str, Enum):
    THREADED = "Threaded"   # a rope inside tubular webbing
    ROPE = "Rope"           # a single rope, no sleeve

class RingConnection(str, Enum):
    KNOT = "Knot"           # tied by the user (or pre-tied by the maker)
    SEWN = "Sewn"           # eye sewn to the ring
    SPLICED = "Spliced"     # eye spliced around the ring

class CoreType(str, Enum):      # None = not stated
    DYNAMIC = "Dynamic"
    STATIC = "Static"

class SleeveMaterial(str, Enum):
    NYLON = "Nylon"
    POLYESTER = "Polyester"
    POLYPROPYLENE = "Polypropylene"
    OTHER = "Other"

class BaseLeash(SQLModel):
    name: str | None = Field(default=None, index=True)
    construction: LeashConstruction | None = None
    ring_end: RingConnection | None = None
    core_type: CoreType | None = None
    core_rope: str | None = None            # e.g. "Edelrid Hummingbird Pro Dry 9.2"
    core_diameter: float | None = None      # mm
    sleeve_material: SleeveMaterial | None = None
    sleeve_width: float | None = None       # mm
    diameter: float | None = None           # mm, overall
    length: float | None = None             # cm, one length per row
    weight: float | None = None             # g, this length, leash only
    breaking_strength: float | None = None  # kN, the leash's stated strength; the lower if two
    ring_options: list[dict] | None = Field(default=None, sa_column=Column(JSON))  # [{leashring_id, count}]
    twist_marker: bool | None = None
    release_date: int | None = None
    product_url: str | None = None
    isa_certified: bool = False             # set only by load_isa_certifications.py
    isa_certificate: str | None = None
    isa_warning: ISAWarning | None = None
    price: float | None = None              # this length, leash only (cheapest colour)
    currency: Currency | None = None
    description: str | None = None
    version: str | None = None
    notes: str | None = None
    active: bool | None = Field(default=None, index=True)
    gear_sellers: list[str] | None = Field(default=None, sa_column=Column(JSON))
    product_group: str | None = Field(default=None, index=True)
```

Required on the table: `name`, `construction`, `brand_id`.

**Sellers**, from Part 1:
- Spider Highline Leash → Slack Inov (bulk co-listing) and Slack.fr.
- BC Threaded Highline Leash Kit → Geko.

`isa_certified`, `isa_certificate`, `gear_sellers` and `product_group` go into `_EXCLUDED` as on
the other types.
