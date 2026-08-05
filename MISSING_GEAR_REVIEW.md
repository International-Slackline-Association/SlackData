# Missing Gear — MASTER LIST (deep sweep, 2026-07-31)

**This is the authoritative list.** It re-diffs every candidate — from this deep sweep **and** the two
earlier sweeps below — against the *current* seed JSON (533 items). Earlier sweeps are archived at the
bottom unchanged; anything from them that is still genuinely missing has been folded up into here, and
anything already imported (e.g. all of Sweep 1's webbings) has been dropped.

## Method

Went to each active, slackline-oriented manufacturer's own store and enumerated the **entire** catalog,
not just featured items:

- **Shopify** brands — pulled the full `/products.json` feed (Gibbon, Balance Community, Slackline
  Industries, Viper). Raed/`raed-sports.com` rate-limited (429) on every attempt — its items are already
  deep in the DB from Sweep 1, so its still-missing kits are carried from there.
- **WooCommerce** brands — pulled the full `/wp-json/wc/store/v1/products` feed with category names
  (Slacktivity 119, Slack house 128, Bera Adventure 149, SlackGear 35, Yoga Slackers 42, lineGrip 35,
  Middle Way 18).
- **PrestaShop / custom / Wix** brands — fetched shop + category pages (Slack Mountain, EQB/slackshop.cz,
  Slackliner.de, Radrigs, Petram). Spider & Slack Inov block automated fetches (403) — their still-missing
  items are carried from Sweep 1.

**Diffing:** each catalog item was normalized (drop length/width tokens, fold `MK`/`Type`/`G` variants)
and matched *within its own gear type* against the DB. Only genuine gaps are listed. Excluded throughout:
carabiners, shackles, quicklinks, maillons, ropes/slings, rigging plates, ratchets/soft-releases,
training boards (SlackBoard/SlackRack), apparel, courses, and general climbing/PPE hardware.

**Retailer caveat:** Slack house, EQB and Slackliner.de also *resell* other brands (e.g. the Gibbon
BananaLama/Jibline/Funline sets, Petram's Coelum/Aeris). Where a product is really another brand's, it is
listed once under its true maker, not the shop.

**Scope note:** the 16 general climbing/PPE brands (Petzl, CAMP, Kong, Edelrid, Mammut, ISC, SMC, Rock
Exotica, Van Beest, Singing Rock, Tendon, Trango, Fusion Climb, CMC Rescue, Krok, Episwiss) were not
deep-swept — their slackline-specific items are already in the DB and their catalogs are overwhelmingly
non-slackline. Length/color variants of one product are collapsed to a single row.

Tick a box to confirm an item should be imported; fix the **Type** inline where the guess is wrong.
Adjudicated items leave the candidate tables below: approved ones move to
[✅ Approved — ready to import](#-approved--ready-to-import), rejected ones to
[🚫 Rejected — do not re-surface](#-rejected--do-not-re-surface).

## ✅ Approved — ready to import

Reviewed and confirmed. **Another agent can start adding these now** — they are no longer candidates.

Before writing any row, read the relevant `slack_data/models/<type>.py` and the `slack_data/utilities/`
enums for the real field names, types and enum values — do not infer the schema from these tables (see
CLAUDE.md → "Frontend ↔ Backend contract rule"). Add objects to the matching `<type>s.json` at repo root
using the key names that type's loader already reads — **the two loaders take different shapes, see
below.** Re-seed by deleting `slack_data/database.db` and restarting.

Set `active` on every new row: `true` = still sold, `false` = legacy/discontinued.

**Webbing** — `models/webbing.py` · `webbings.json` · `load_webbings.py`. Flat objects; brand key is
`brand`. `materialType` → `FiberMaterial`, `stretch` stored as a JSON *string*, `date_introduced` →
`release_date` (unix ms). Stretch curves must contain no `kn: 0` anchor and no `percent: 0` readings.

**Weblock** — `models/weblocks.py` · `weblocks.json` · `load_weblocks.py`. **Not flat** — entries keep the
SlackDB scrape shape: top-level `name`, `brand`, `product_url`, `date_introduced`, `active`, plus a nested
`specifications` object whose keys are human-readable strings the loader parses: `Material` →
`MetalMaterial`, `Compatible webbing width` (a range string like `"24mm - 27mm"` → `width_min`/`width_max`),
`Weight` (`"185gr"`), `MBS` (`"50kN"`), `Webbing connection type` → `FrontPin`, `Anchor connection type` →
`AttachmentPoint`, `ISA approved` (yes/no). Price/currency are regex-parsed from a `pricing` array of
`{"text": "1 unit and above : 84.40 EUR"}`.

**Leash Ring** — `models/leashrings.py` · `leashrings.json` · `load_leashrings.py`. Flat objects, but the
brand key is **`manufacturer`**, not `brand`. Fields: `name`, `material` (→ `MetalMaterial`),
`inner_diameter`, `outer_diameter`, `weight`, `breaking_strength`, `isa_certified`, `price`, `currency`,
`notes`, `date_introduced`, `product_url`, `active`.

**Grip** — `models/grips.py` · `grips.json` · `load_grips.py`. Flat; brand key **`manufacturer`**. Fields:
`name`, `material` (→ `MetalMaterial`), `width_min`, `width_max`, `weight`, `wll`, `mbs`,
`common_slipping_threshold`, `connection_type` (→ `ConnectionType`), `isa_certified`, `price`, `currency`,
`date_introduced`, `product_url`, `active`.

**Roller** — `models/rollers.py` · `rollers.json` · `load_rollers.py`. Flat; brand key **`manufacturer`**.
Watch the renames: JSON `mbs` → `breaking_strength`, `locking_type` → `lock_type`, `isa_approved` →
`isa_certified`, and **currency comes from `price_unit`**, not `currency`. Other fields: `name`,
`material`, `roller_material` (→ `RollerMaterial`), `bearing_material`, `width`, `weight`, `slider_type`,
`price`, `date_introduced`, `product_url`, `active`.

### Webbing (10) — ✔ **imported 2026-08-01**

All ten are in `webbings.json` (242 rows) with full manufacturer specs, descriptions, source notes and
images (`frontend/public/gear-images/webbings/`, manifest rebuilt). Re-seed to pick them up: delete
`slack_data/database.db` and restart the server.

| ✓ | Item | Brand | Source | Import notes |
|---|------|-------|--------|--------------|
| [x] | [Flama](https://slackhouseshop.pl/en/produkt/flama/) | Slack house | slackhouseshop.pl | 20mm flat nylon, 23 kN, 52 g/m. **No stretch curve published** — `stretch: null`; revisit if Slackhouse publishes one. |
| [x] | [Tiger](https://slackhouseshop.pl/en/produkt/tiger/) | Slack house | slackhouseshop.pl | 21.5mm flat UHMWPE, 30 kN, 29.8 g/m. Spec table (1.9 % @5kN / 2.8 % @10kN) preferred over the prose figures. |
| [x] | [Rubbit](https://slackhouseshop.pl/en/produkt/rubbit/) | Slack house | slackhouseshop.pl | MK II, 26mm tubular nylon, 24 kN. 20-point stretch curve digitised from Slackhouse's own chart (matches the published 12.3 %/17.7 % anchors). X-Type is the same webbing, not a second row. |
| [x] | [Slamina](https://slackhouseshop.pl/en/produkt/gibbon-slamina-trickline-50mm/) | ~~Slack house~~ → **Gibbon** | slackhouseshop.pl | `active: false`. **Brand corrected**: the shop lists Gibbon as producer (Jaan Roose signature line, Gibbon-branded box) — filed under the true maker per the retailer rule in [Method](#method). Fibre and g/m weight are unpublished → `materialType: "Other"`, `weight: null`. |
| [x] | [Brasileirinha (Nylon)](https://www.beraadventure.com.br/product/fita-flat-brasileirinha-nylon-25mm-x-50-metros/) | Bera Adventure | beraadventure.com.br | 25mm flat nylon, 28 kN, 60 g/m; length variants collapsed, 8.00 BRL/m. |
| [x] | [Sky 2.0](https://www.beraadventure.com.br/product/fita-flat-double-face-sky-2-0-50-metros-vinho-e-lilas/) | Bera Adventure | beraadventure.com.br | 25mm flat double-face polyester, 35 kN, 68 g/m; 7.00 BRL/m. |
| [x] | [Sky 2.0 3D](https://www.beraadventure.com.br/product/fita-flat-double-face-sky-2-0-3d-50-metros/) | Bera Adventure | beraadventure.com.br | Kept separate from `Sky 2.0` — 3D weave, lower MBS (33 kN); 5.50 BRL/m. |
| [x] | [Brazilian Tube](https://www.beraadventure.com.br/product/brazilian-tube/) | Bera Adventure | beraadventure.com.br | 25mm tubular nylon, 25.5 kN, 50 g/m, 20 % @6kN. |
| [x] | [Lagoon](https://www.slackshop.cz/en/dyneema/256-eqb-lagoon.html) | Equilibrium (EQB) | slackshop.cz | 50/50 HMPE-PES hybrid → `materialComposition: ["Dyneema/HMPE", "Polyester"]`; 31 kN at 35 g/m. Weave not stated in the data sheet — recorded `Flat` from the product photos. |
| [x] | [Paradigm MK2](https://balancecommunity.com/products/paradigm-mk2) | Balance Community | balancecommunity.com | ⚠ newer rev of `Paradigm` — both kept. **Stretch chart is not final: revisit and update the curve once BC publishes released-product data** (only the ISA 5 kN/10 kN anchors are stored). |

### Weblock (20)

| ✓ | Item | Brand | Source | Import notes |
|---|------|-------|--------|--------------|
| [ ] | [Slackfriend](https://www.radrigs.co.uk/product-page/slackfriend) | Radrigs | radrigs.co.uk | **Type corrected: weblock, not roller** — was listed under Roller / Pulley in Sweep 2 and the deep sweep. Import into `weblocks.json`. |
| [ ] | [MightyLock](https://balancecommunity.com/products/mightylock) | Balance Community | balancecommunity.com | |
| [ ] | [Aluminum Line-Locker Ring](https://balancecommunity.com/products/aluminum-line-locker-ring) | Balance Community | balancecommunity.com | |
| [ ] | [ChainLock](https://slacktivity.com/shop/chainlock-slackline-linelocker/) | Slacktivity | slacktivity.com | |
| [ ] | [ZENLOCK WEBLOCK](https://slacklines.us/products/zenlock-weblock) | Spider Slacklines | slacklines.us | |
| [ ] | [DIAMOND LOCK LINELOCK](https://slacklines.us/products/weblock-diamond-lock) | Spider Slacklines | slacklines.us | |
| [ ] | [BLUEBERRY SR WEBLOCK](https://slacklines.us/products/weblock-blueberry-sr) | Spider Slacklines | slacklines.us | |
| [ ] | [BLUEBERRY WEBLOCK](https://slacklines.us/products/weblock-blueberry) | Spider Slacklines | slacklines.us | |
| [ ] | [LINELOCK ALUMINUM RING](https://slacklines.us/products/linelock-ring-slackline) | Spider Slacklines | slacklines.us | |
| [ ] | [Simplex Locker](https://slackhouseshop.pl/produkt/simplex-locker/) | Slack house | slackhouseshop.pl | |
| [ ] | [Weblock 50mm (Soft Release)](https://www.beraadventure.com.br/product/weblock-50mm-soft-release-50mm/) | Bera Adventure | beraadventure.com.br | trickline |
| [ ] | [Anel Linelock – Bera](https://www.beraadventure.com.br/product/anel-linelock-bera/) | Bera Adventure | beraadventure.com.br | |
| [ ] | [Line Lock](https://yogaslackers.com/shop/slackline/linelock/) | Yoga Slackers | yogaslackers.com | |
| [ ] | [lineLoose Buckle](https://www.linegrip.com/shop/slackpro-lineloose-buckle/) | lineGrip | linegrip.com | ex-Slack Pro! |
| [ ] | [Boa – Weblock for 25mm](https://www.viperslacklines.co.za/products/boa-constrictor-slackline-weblock) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Aluminium Static Linelock Ring](https://www.viperslacklines.co.za/products/aluminium-static-slackline-linelock) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Viper Constrictor 25mm](https://www.viperslacklines.co.za/products/viper-constrictor-25mm-linelock) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Chainlink LineLocker](http://www.slackgear.co.za/product/chainlink-linelocker/) | SlackGear | slackgear.co.za | |
| [ ] | [Meercat LineLocker](http://www.slackgear.co.za/product/meercat-linelocker/) | SlackGear | slackgear.co.za | |
| [ ] | [Linelocker for 50mm](https://www.slackliner.de/de/Linelocker-fuer-50mm-Baender-251.html) | Slackliner.de | slackliner.de | 50mm |

### Leash Ring (4)

| ✓ | Item | Brand | Source | Import notes |
|---|------|-------|--------|--------------|
| [ ] | [BigLoop](https://balancecommunity.com/products/bigloop) | Balance Community | balancecommunity.com | |
| [ ] | [80MM HIGHRING](https://slacklines.us/products/highline-leash-ring) | Spider Slacklines | slacklines.us | |
| [ ] | [VORTEX 2](https://slacklines.us/products/vortex-highline-ring) | Spider Slacklines | slacklines.us | ⚠ distinct from Slack Inov's `Vortex` already in the DB — different brand, keep both |
| [ ] | [Anel Duplo para Leash](https://www.beraadventure.com.br/product/anel-duplo-para-leash/) | Bera Adventure | beraadventure.com.br | double leash ring |

### Roller / Pulley (3)

| ✓ | Item | Brand | Source | Import notes |
|---|------|-------|--------|--------------|
| [ ] | [HIGHWHEEL LONGLINE FLAT PULLEY](https://slacklines.us/products/highwheel-longline-flat-pulley) | Spider Slacklines | slacklines.us | |
| [ ] | [Rolley – 25mm Roller](https://www.viperslacklines.co.za/products/rollie-25mm-slackline-roller) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Polia de Fita Bera](https://www.beraadventure.com.br/product/polia-de-fita-bera/) | Bera Adventure | beraadventure.com.br | webbing pulley |

### Grip (8)

| ✓ | Item | Brand | Source | Import notes |
|---|------|-------|--------|--------------|
| [ ] | [SHARK](https://spider-slacklines.com/shop/en/tensioning-systems/550-shark.html) | Spider Slacklines | spider-slacklines.com | |
| [ ] | [MOUSE GRIP](https://slacklines.us/products/mousegrip) | Spider Slacklines | slacklines.us | |
| [ ] | [Wafer 2.0](https://balancecommunity.com/products/wafer-2-0) | Balance Community | balancecommunity.com | ⚠ newer rev of `Wafer` — keep both |
| [ ] | [Wafer XL](https://balancecommunity.com/products/wafer-xl) | Balance Community | balancecommunity.com | ⚠ distinct size, not a variant of `Wafer` — keep both |
| [ ] | [T-Grip Light](https://slacktivity.com/shop/t-grip-light/) | Slacktivity | slacktivity.com | |
| [ ] | [T-Grip](https://slacktivity.com/shop/t-grip-webbing-grip-tool/) | Slacktivity | slacktivity.com | |
| [ ] | [Grippex](https://www.viperslacklines.co.za/products/grippex-25mm-slackline-webbing-grip) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [BeraGrip 50mm](https://www.beraadventure.com.br/product/beragrip-50mm/) | Bera Adventure | beraadventure.com.br | trickline grip |

---

## Candidates — still to adjudicate

### Tree Protector (6)

| ✓ | Item | Brand | Source | Note |
|---|------|-------|--------|------|
| [ ] | [LineSlider 2.0](https://slacktivity.com/shop/lineslider-slackline-protection/) | Slacktivity | slacktivity.com | |
| [ ] | [Flexitube](https://sicherungsprofi.de/flexitube/SL05-RS) | Slackstar | sicherungsprofi.de | |
| [ ] | [Impact Protection](https://sicherungsprofi.de/prallschutz/SL81803-A) | Slackstar | sicherungsprofi.de | |
| [ ] | [Tree Protectors](http://www.slackgear.co.za/product/tree-protectors/) | SlackGear | slackgear.co.za | |
| [ ] | ["Boomslang" Tree Protectors](https://www.viperslacklines.co.za/products/boomslang-tree-protectors) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Protetor de Árvore Regulável](https://www.beraadventure.com.br/product/protetor-de-arvore-regulavel-bera/) | Bera Adventure | beraadventure.com.br | adjustable |

### Starter / Longline / Highline Kit (59)

| ✓ | Item | Brand | Source | Note |
|---|------|-------|--------|------|
| [ ] | [BANANALAMA SET](https://www.gibbon-slacklines.com/products/bananalama) | Gibbon | gibbon-slacklines.com | |
| [ ] | [CLASSICLINE SET](https://www.gibbon-slacklines.com/products/classicline-treewear-set) | Gibbon | gibbon-slacklines.com | |
| [ ] | [JIBLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/jibline) | Gibbon | gibbon-slacklines.com | |
| [ ] | [SURFERLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/surfer-line-treewear-set) | Gibbon | gibbon-slacklines.com | |
| [ ] | [TRAVELLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/travel-line-treewear-set) | Gibbon | gibbon-slacklines.com | |
| [ ] | [FUNLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/fun-line-treewear-set) | Gibbon | gibbon-slacklines.com | |
| [ ] | [FLOWLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/1-inch-flow-line-treewear-set) | Gibbon | gibbon-slacklines.com | |
| [ ] | [SlackYard Set](https://www.gibbon-slacklines.com/products/slackyard-set) | Gibbon | gibbon-slacklines.com | freestanding |
| [ ] | [Pro Slackline Kit 75/100M](https://slacktivity.com/shop/pro-slackline-kit/) | Slacktivity | slacktivity.com | |
| [ ] | [Expert Pro Slackline Kit 50M](https://slacktivity.com/shop/expert-pro-slackline-kit/) | Slacktivity | slacktivity.com | |
| [ ] | [Expert Slackline 50/70M](https://slacktivity.com/shop/expert-slackline-50m-70m/) | Slacktivity | slacktivity.com | |
| [ ] | [AcroLine Set](https://slacktivity.com/shop/acroline-set/) | Slacktivity | slacktivity.com | |
| [ ] | [Ice & Fire 25m Set](https://slacktivity.com/shop/ice-fire-25m-slackline-set/) | Slacktivity | slacktivity.com | |
| [ ] | [Rodeo Slackline Set 40m](https://slacktivity.com/shop/rodeo-slackline-set-40m/) | Slacktivity | slacktivity.com | |
| [ ] | [PARK50](https://slacktivity.com/shop/park50-50m-25mm-slackline/) / [PARK100](https://slacktivity.com/shop/park100-100m-slackline-set/) | Slacktivity | slacktivity.com | polyester longline+pulley kits |
| [ ] | [REDPARK](https://slacktivity.com/shop/redpark-longline-kit/) / [PINKPARK](https://slacktivity.com/shop/pinkpark-longline-slackline-kit/) / [LSDPARK](https://slacktivity.com/shop/lsdpark-slackline-pulley-system-set/) | Slacktivity | slacktivity.com | 50m longline+pulley kits |
| [ ] | [Rock Highline Kit](https://slacktivity.com/shop/rock-highline-kit/) | Slacktivity | slacktivity.com | highline kit |
| [ ] | [Tree Highline Kit](https://slacktivity.com/shop/tree-highline-kit/) | Slacktivity | slacktivity.com | highline kit |
| [ ] | [MonsterSet 25M](https://slackhouseshop.pl/produkt/monsterset/) | Slack house | slackhouseshop.pl | |
| [ ] | [MonsterSet Plus 25M](https://slackhouseshop.pl/produkt/zestaw-monsterset-plus-25m/) | Slack house | slackhouseshop.pl | |
| [ ] | [Buddha 25M](https://slackhouseshop.pl/produkt/zestaw-buddha-25m/) | Slack house | slackhouseshop.pl | |
| [ ] | [Laser 15M](https://slackhouseshop.pl/produkt/laser-15m/) | Slack house | slackhouseshop.pl | |
| [ ] | [Laser Plus 15M](https://slackhouseshop.pl/produkt/laser-plus/) | Slack house | slackhouseshop.pl | |
| [ ] | [System Red 18:1](https://slackhouseshop.pl/produkt/system-red-181/) | Slack house | slackhouseshop.pl | pulley system kit |
| [ ] | [Kit Slack Camuflado](https://www.beraadventure.com.br/product/kit-camuflado-20-metros/) | Bera Adventure | beraadventure.com.br | |
| [ ] | [Kit Pink Slack](https://www.beraadventure.com.br/product/kit-pink-slack-20-metros/) | Bera Adventure | beraadventure.com.br | |
| [ ] | [Kit Bobslack](https://www.beraadventure.com.br/product/kit-bobslack-20-metros-backup/) | Bera Adventure | beraadventure.com.br | |
| [ ] | [Kit Primitivo Double Face](https://www.beraadventure.com.br/product/kit-primitivo-double-face-start-40-metros/) | Bera Adventure | beraadventure.com.br | primitive kit (30m/40m Start; also a [Sky 2.0 version](https://www.beraadventure.com.br/product/kit-primitivo-double-face-sky-2-0-40-50-ou-70-metros-vinho-e-lilas/)) |
| [ ] | [Compact Pulley System](http://www.slackgear.co.za/product/compact-pulley-system/) | SlackGear | slackgear.co.za | |
| [ ] | [Highline Leash Kit](http://www.slackgear.co.za/product/highline-leash-kit/) | SlackGear | slackgear.co.za | |
| [ ] | [eLine Slackline: Eco Kit](https://yogaslackers.com/shop/slackline/eline-slackline-eco-kit/) | Yoga Slackers | yogaslackers.com | |
| [ ] | [eLine Slackline Pro Kit](https://yogaslackers.com/shop/slackline/eline-slackline-pro-kit/) | Yoga Slackers | yogaslackers.com | |
| [ ] | [eLine Slackline Full Kit](https://yogaslackers.com/shop/slackline/eline-slackline-kit/) | Yoga Slackers | yogaslackers.com | |
| [ ] | [50M Slackline w/ 3:1 Tensioning Kit](https://www.viperslacklines.co.za/products/50m-slackline-with-3-1-tensioning-kit) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [30m Lightweight Primitive Kit](https://www.viperslacklines.co.za/products/30m-lightweight-slackline-kit-primitive-tension) | Viper Slacklines | viperslacklines.co.za | |
| [ ] | [Ultra-Light Rodeo Slackline](https://www.viperslacklines.co.za/products/ultra-light-rodeo-slackline) | Viper Slacklines | viperslacklines.co.za | rodeo kit |
| [ ] | [BC LongLine Kit](https://balancecommunity.com/products/pro-longline-kit) | Balance Community | balancecommunity.com | |
| [ ] | [BC Starter Slackline Kit](https://balancecommunity.com/products/bc-starter-slackline-kit) | Balance Community | balancecommunity.com | |
| [ ] | [Lightweight Longline Kit](https://balancecommunity.com/products/lightweight-longline-kit) | Balance Community | balancecommunity.com | |
| [ ] | [BC Prim-50 Slackline Kit](https://balancecommunity.com/products/bc-prim-50-custom-slackline-kit) | Balance Community | balancecommunity.com | ⚠ vs `BC Prim-25` |
| [ ] | [Modular Freestyle Kit](https://balancecommunity.com/products/modular-freestyle-kit) | Balance Community | balancecommunity.com | |
| [ ] | [Balance 20 m](https://www.slackshop.cz/en/for-beginners/10-balance-20-m.html) | Equilibrium (EQB) | slackshop.cz | ⚠ was listed as "Buddy Slackline Kit" — no such product exists on slackshop.cz; this is the shop's beginner kit ([Step 12m](https://www.slackshop.cz/en/for-beginners/9-eqb-step-12-m.html), [Yoga 15m](https://www.slackshop.cz/en/for-beginners/93-eqb-yoga-15-m.html) are the others). Confirm which was meant. |
| [ ] | [Zen Longline Kit 35/50/60m](https://www.slackshop.cz/en/for-advanced/2-526-zen-longline-set.html) | Equilibrium (EQB) | slackshop.cz | |
| [ ] | [PRIMITIVE ZAO](https://slacklines.us/products/primitive-zao) | Spider Slacklines | slacklines.us | |
| [ ] | [SLACKLINE OUTDOOR KIT WHITE LINE 15](https://slacklines.us/products/slackline-outdoor-kit-white-line-15) | Spider Slacklines | slacklines.us | |
| [ ] | [LONGLINE KIT – PRIMITIVE 30](https://slacklines.us/products/longline-kit-primitive-30) | Spider Slacklines | slacklines.us | |
| [ ] | [LONGLINE KIT – PRIMITIVE 50](https://slacklines.us/products/longline-kit-primitive-50) | Spider Slacklines | slacklines.us | |
| [ ] | [Beginner Longline Set](https://raed-sports.com/products/beginner-longline-set) | Raed Slacklines | raed-sports.com | |
| [ ] | [HUMBOLDT Ultralight Travel Set](https://raed-sports.com/products/humboldt-ultralight-travel-slackline-set) | Raed Slacklines | raed-sports.com | |
| [ ] | [Parkline Comfort Set](https://raed-sports.com/products/parkline-comfort-set) | Raed Slacklines | raed-sports.com | |
| [ ] | [Rodeoline Set](https://raed-sports.com/products/rodeoline-set) | Raed Slacklines | raed-sports.com | |
| [ ] | [Rodeoline Beginner Set](https://raed-sports.com/products/rodeoline-beginner-set) | Raed Slacklines | raed-sports.com | |
| [ ] | [Acrobat Kit 15m](https://www.acrobatslackline.com/product-page/%D7%A2%D7%A8%D7%9B%D7%AA-%D7%A1%D7%9C%D7%A7%D7%9C%D7%99%D7%99%D7%9F-15-%D7%9E) | Acrobat Slackline | acrobatslackline.com | |
| [ ] | [30m Slackline Kit (1" Slackhouse Webbing)](https://slackmitra.myinstamojo.com/product/30m-slackline-kit-1-slackhouse-webbing) | Slack Mitra | slackmitra.myinstamojo.com | |
| [ ] | [DoubleLine Basic](https://sicherungsprofi.de/doubleline-basic/SL81809) | Slackstar | sicherungsprofi.de | |
| [ ] | [Slack-Kit](https://www.radrigs.co.uk/product-page/slack-kit) | Radrigs | radrigs.co.uk | |

### Trickline Kit (8)

| ✓ | Item | Brand | Source | Note |
|---|------|-------|--------|------|
| [ ] | [TRICK LINE KIT](https://www.slacklineindustries.com/products/trick-line-kit) | Slackline Industries | slacklineindustries.com | |
| [ ] | [BELLA CIAO – TRICKLINE](https://slacklines.us/products/bella-ciao-trickline) | Spider Slacklines | slacklines.us | |
| [ ] | [TRICKLINE KIT – TRICK LINE 30](https://slacklines.us/products/trickline-kit-trick-line-30) | Spider Slacklines | slacklines.us | |
| [ ] | [DUOred](https://www.slackliner.de/de/DUOred8.html) | Slackliner.de | slackliner.de | |
| [ ] | [Kit Elastic Line 50mm](https://www.beraadventure.com.br/product/kit-elastic-line-50mm-x-30-metros/) | Bera Adventure | beraadventure.com.br | elastic trickline |
| [ ] | [Zestaw Andy Lewis Trickline](https://slackhouseshop.pl/produkt/zestaw-andy-lewis-trickline/) | Slack house | slackhouseshop.pl | |
| [ ] | [Jibline (trickline set)](https://slackhouseshop.pl/produkt/zestaw-jibline/) | Slack house | slackhouseshop.pl | |
| [ ] | [Trickline](https://middlewayslacklines.com/trickline/) | Middle Way | middlewayslacklines.com | ⚠ vs DB `23m kit` — confirm distinct |

**Master list total: 125 items across 8 gear types** — 45 approved (10 of them **imported**: the whole
Webbing section, 2026-08-01), 7 rejected, 73 still to adjudicate.

Brands confirmed **fully covered** by this sweep (no new items — catalog already in DB): Slack Mountain,
Slack Inov, Spider (webbings), Slackliner.de (webbings), Middle Way (Chi/Zen/Classic), plus all Sweep-1
webbings already imported. Brands unreachable / not deep-swept: Raed (429, carried from Sweep 1), Spider &
Slack Inov shop pages (403, carried from Sweep 1), a-zero.com.ar (DNS), slacklineshop.co.nz (403),
bloacs.de (B2B, no retail), Krok/Geko/Petram (tiny catalogs, existing DB coverage adequate).

---

## 🚫 Rejected — do not re-surface

Items examined and deliberately **not** imported. A future sweep must diff its candidates against this
table and drop any match, so these are not re-adjudicated every time. Match on brand + normalized name
(same normalization the sweep already uses: drop length/width tokens, fold `MK`/`Type`/`G` variants); the
URL is evidence, not identity, because shop slugs change.

**Reason vocabulary:** `novelty` (cosmetic/limited edition of a product we already hold) · `repackage`
(a set/bundle built from gear we already hold) · `variant` (length/colour variant) · `out-of-scope`
(not slackline gear) · `duplicate` (same product under another vendor) · `revisit` (deferred, **not**
permanent — re-examine on the next sweep).

| Item | Brand | Type | Reason | Rejected | Rationale |
|------|-------|------|--------|----------|-----------|
| [Type X Highline Webbing](https://slacktivity.com/shop/type-x-highline-webbing/) | Slacktivity | webbing | `novelty` | 2026-08-01 | Novelty line, not a distinct webbing construction — no unique specs to record. |
| [DaVinci](https://slacktivity.com/shop/davinci-slackline/) | Slacktivity | webbing | `novelty` | 2026-08-01 | Novelty line, not a distinct webbing construction — no unique specs to record. |
| [Balance Roller](https://www.gibbon-slacklines.com/products/balanceroller) | Gibbon | roller | `out-of-scope` | 2026-08-01 | Not slackline hardware — a cork balance trainer that turns the Gibbon **SLACKBOARD** into a fitness tool. Falls under the existing training-board exclusion (SlackBoard/SlackRack). |
| [Compact Single Pulley](http://www.slackgear.co.za/product/compact-single-pulley/) | SlackGear | roller | `out-of-scope` | 2026-08-01 | Rope pulley, not a webbing roller — belongs to the general rigging-hardware exclusion. |
| [Compact Double Pulley](http://www.slackgear.co.za/product/compact-double-pulley/) | SlackGear | roller | `out-of-scope` | 2026-08-01 | Rope pulley, not a webbing roller — belongs to the general rigging-hardware exclusion. |
| [Utility Rings](http://www.slackgear.co.za/product/utility-rings/) | SlackGear | leashring | `out-of-scope` | 2026-08-01 | Not a leash ring — the vendor's own listing states they must **not** be used as a highline leash ring. General rigging rings; same class as the ring/quicklink hardware exclusion. |
| [CobraGrip (One Inch Dreams Ed.)](https://www.linegrip.com/shop/one-inch-dreams-edition-cobragrip/) | lineGrip | grip | `novelty` | 2026-08-01 | One-off One Inch Dreams collaboration edition. lineGrip's catalog carries no base CobraGrip, so there is no distinct product line to record — see the note below. |

**Follow-up — lineGrip CobraGrip:** the One Inch Dreams edition is the *only* CobraGrip in lineGrip's
current catalog (35-product WooCommerce feed, checked 2026-08-01), and no base `CobraGrip` exists in
`grips.json`. So this rejection closes the edition, not the product line — if a base CobraGrip ever
existed it is a genuine gap neither the DB nor this sweep covers. Worth a look when lineGrip is next swept.

Category-level exclusions applied throughout the sweep (never listed as candidates in the first place)
are recorded in [Method](#method) rather than here: carabiners, shackles, quicklinks, maillons,
ropes/slings, rigging plates, ratchets/soft-releases, training boards, apparel, courses, and general
climbing/PPE hardware.

---

# ⬇ Archived — earlier sweeps (superseded by the master list above)

# Missing Gear — Review List

Scraped 2026-07-19 from balancecommunity.com, slacklines.us, slacktivity.com, raed-sports.com.
Diffed against current seed JSON (470 existing items). **Name / URL / proposed type only — no specs pulled.**

Tick the box to confirm an item should be imported. Correct the **Type** column inline where I guessed wrong.

Rows marked **⚠ similar to `X`** closely resemble an existing DB row — confirm they are distinct products before import.

- Section 1 — 64 items to confirm

---

## 1. New items


### Webbing (19)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Paradigm](https://balancecommunity.com/products/paradigm) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Secondaire MK2](https://balancecommunity.com/products/secondaire-mk2) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Axiom](https://balancecommunity.com/products/axiom) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Pharaoh](https://balancecommunity.com/products/pharaoh) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Paradigm Signature](https://balancecommunity.com/products/paradigm-signature-1) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Spider Silk MK5](https://balancecommunity.com/products/spider-silk-mk5) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [Silk 99](https://balancecommunity.com/products/silk-99) | Balance Community | balancecommunity.com | `webbing` |
| [ ] | [PULSAR - 19mm Highline Backup Webbing](https://raed-sports.com/products/pulsar-19mm-highline-backup-webbing) | Raed Slacklines | raed-sports.com | `webbing` |
| [ ] | [X-Wing - Highline Freestyle webbing](https://raed-sports.com/products/x-wing-webbing) | Raed Slacklines | raed-sports.com | `webbing` |
| [ ] | [Y2K Light](https://slacktivity.com/shop/y2k-light-18mm-hightech-webbing/) | Slacktivity | slacktivity.com | `webbing` |
| [ ] | [AcroLine Webbing](https://slacktivity.com/shop/acroline-webbing/) | Slacktivity | slacktivity.com | `webbing` |
| [ ] | [PRO Webbing](https://slacktivity.com/shop/pro-low-stretch-webbing/) | Slacktivity | slacktivity.com | `webbing` |
| [ ] | [Experience Webbing](https://slacktivity.com/shop/experience-30m-70m/) | Slacktivity | slacktivity.com | `webbing` |
| [ ] | [LEMON HAZE](https://slacklines.us/products/lemon-haze) | Spider Slacklines | slacklines.us | `webbing` |
| [ ] | [PANTHER](https://slacklines.us/products/panther) | Spider Slacklines | slacklines.us | `webbing` |
| [ ] | [Jelly PRO Desert](https://balancecommunity.com/products/jelly-pro-desert) | Balance Community | balancecommunity.com — ⚠ similar to `Jelly` (webbings.json) | `webbing` |
| [ ] | [GREEN T20](https://slacktivity.com/shop/green-t20/) | Slacktivity | slacktivity.com — ⚠ similar to `Green` (webbings.json) | `webbing` |
| [ ] | [GREEN MAMBA](https://slacklines.us/products/highline-webbing-greenmamba) | Spider Slacklines | slacklines.us — ⚠ similar to `Green` (webbings.json) | `webbing` |

### Weblock (8)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [MightyLock](https://balancecommunity.com/products/mightylock) | Balance Community | balancecommunity.com | `weblock` |
| [ ] | [Aluminum Line-Locker Ring](https://balancecommunity.com/products/aluminum-line-locker-ring) | Balance Community | balancecommunity.com | `weblock` |
| [ ] | [ChainLock](https://slacktivity.com/shop/chainlock-slackline-linelocker/) | Slacktivity | slacktivity.com | `weblock` |
| [ ] | [ZENLOCK WEBLOCK](https://slacklines.us/products/zenlock-weblock) | Spider Slacklines | slacklines.us | `weblock` |
| [ ] | [DIAMOND LOCK LINELOCK](https://slacklines.us/products/weblock-diamond-lock) | Spider Slacklines | slacklines.us | `weblock` |
| [ ] | [BLUEBERRY SR WEBLOCK](https://slacklines.us/products/weblock-blueberry-sr) | Spider Slacklines | slacklines.us | `weblock` |
| [ ] | [BLUEBERRY WEBLOCK](https://slacklines.us/products/weblock-blueberry) | Spider Slacklines | slacklines.us | `weblock` |
| [ ] | [LINELOCK ALUMINUM RING](https://slacklines.us/products/linelock-ring-slackline) | Spider Slacklines | slacklines.us | `weblock` |

### Roller (1)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [HIGHWHEEL LONGLINE FLAT PULLEY](https://slacklines.us/products/highwheel-longline-flat-pulley) | Spider Slacklines | slacklines.us | `roller` |

### Grip (6)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [SHARK](https://spider-slacklines.com/shop/en/tensioning-systems/550-shark.html) | Spider Slacklines | spider-slacklines.com (EU site) | `grip` |
| [ ] | [Wafer 2.0](https://balancecommunity.com/products/wafer-2-0) | Balance Community | balancecommunity.com | `grip` |
| [ ] | [Wafer XL](https://balancecommunity.com/products/wafer-xl) | Balance Community | balancecommunity.com | `grip` |
| [ ] | [T-Grip Light for Tensioning Slacklines and Highlines](https://slacktivity.com/shop/t-grip-light/) | Slacktivity | slacktivity.com | `grip` |
| [ ] | [T-Grip](https://slacktivity.com/shop/t-grip-webbing-grip-tool/) | Slacktivity | slacktivity.com | `grip` |
| [ ] | [MOUSE GRIP](https://slacklines.us/products/mousegrip) | Spider Slacklines | slacklines.us | `grip` |

### Leash Ring (4)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [BigLoop](https://balancecommunity.com/products/bigloop) | Balance Community | balancecommunity.com | `leashring` |
| [ ] | [80MM HIGHRING - FLAT ALUMINUM HIGHLINE RING](https://slacklines.us/products/highline-leash-ring) | Spider Slacklines | slacklines.us | `leashring` |
| [ ] | [60MM CLASSIC -  ALUMINUM HIGHLINE RING](https://slacklines.us/products/highline-aluminium-ring) | Spider Slacklines | slacklines.us | `leashring` |
| [ ] | [VORTEX 2 - INNOVATIVE HIGHLINE RING](https://slacklines.us/products/vortex-highline-ring) | Spider Slacklines | slacklines.us — ⚠ similar to `Vortex` (leashrings.json) | `leashring` |

### Tree Protector (3)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [LineSlider 2.0](https://slacktivity.com/shop/lineslider-slackline-protection/) | Slacktivity | slacktivity.com | `treepro` |
| [ ] | [TREE PROTECTION LARGE](https://slacklines.us/products/slackline-tree-protection) | Spider Slacklines | slacklines.us — ⚠ similar to `Tree Pro` (treepros.json) | `treepro` |
| [ ] | [TREE PROTECTION EXTRA LARGE](https://slacklines.us/products/tree-protection-slackline-xl) | Spider Slacklines | slacklines.us — ⚠ similar to `Tree Pro` (treepros.json) | `treepro` |

### Starter Kit (18)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [BC LongLine Kit](https://balancecommunity.com/products/pro-longline-kit) | Balance Community | balancecommunity.com | `starterkit` |
| [ ] | [BC Starter Slackline Kit](https://balancecommunity.com/products/bc-starter-slackline-kit) | Balance Community | balancecommunity.com | `starterkit` |
| [ ] | [Lightweight Longline Kit](https://balancecommunity.com/products/lightweight-longline-kit) | Balance Community | balancecommunity.com | `starterkit` |
| [ ] | [Beginner Longline Set](https://raed-sports.com/products/beginner-longline-set) | Raed Slacklines | raed-sports.com | `starterkit` |
| [ ] | [HUMBOLDT - Ultralight Travel Slackline Set](https://raed-sports.com/products/humboldt-ultralight-travel-slackline-set) | Raed Slacklines | raed-sports.com | `starterkit` |
| [ ] | [Parkline Comfort Slackline Set](https://raed-sports.com/products/parkline-comfort-set) | Raed Slacklines | raed-sports.com | `starterkit` |
| [ ] | [Pro Slackline Kit](https://slacktivity.com/shop/pro-slackline-kit/) | Slacktivity | slacktivity.com | `starterkit` |
| [ ] | [Allround Slackline Kit](https://slacktivity.com/shop/allround-slackline-kit/) | Slacktivity | slacktivity.com | `starterkit` |
| [ ] | [Expert Pro Slackline Kit](https://slacktivity.com/shop/expert-pro-slackline-kit/) | Slacktivity | slacktivity.com | `starterkit` |
| [ ] | [AcroLine Set](https://slacktivity.com/shop/acroline-set/) | Slacktivity | slacktivity.com | `starterkit` |
| [ ] | [PRIMITIVE ZAO](https://slacklines.us/products/primitive-zao) | Spider Slacklines | slacklines.us | `starterkit` |
| [ ] | [SLACKLINE OUTDOOR KIT WHITE LINE 15](https://slacklines.us/products/slackline-outdoor-kit-white-line-15) | Spider Slacklines | slacklines.us | `starterkit` |
| [ ] | [LONGLINE KIT - PRIMITIVE 30](https://slacklines.us/products/longline-kit-primitive-30) | Spider Slacklines | slacklines.us | `starterkit` |
| [ ] | [LONGLINE KIT - PRIMITIVE 50](https://slacklines.us/products/longline-kit-primitive-50) | Spider Slacklines | slacklines.us | `starterkit` |
| [ ] | [BC Prim-50 Slackline Kit](https://balancecommunity.com/products/bc-prim-50-custom-slackline-kit) | Balance Community | balancecommunity.com — ⚠ similar to `BC Prim-25 Slackline Kit` (starterkits.json) | `starterkit` |
| [ ] | [Rodeoline Set](https://raed-sports.com/products/rodeoline-set) | Raed Slacklines | raed-sports.com — ⚠ similar to `Rodeo` (webbings.json) | `starterkit` |
| [ ] | [Rodeoline Beginner Set](https://raed-sports.com/products/rodeoline-beginner-set) | Raed Slacklines | raed-sports.com — ⚠ similar to `Rodeo` (webbings.json) | `starterkit` |
| [ ] | [Rodeo Slackline Set – 40m](https://slacktivity.com/shop/rodeo-slackline-set-40m/) | Slacktivity | slacktivity.com — ⚠ similar to `Rodeo` (webbings.json) | `starterkit` |

### Trickline Kit (5)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [BELLA CIAO - TRICKLINE](https://slacklines.us/products/bella-ciao-trickline) | Spider Slacklines | slacklines.us | `tricklinekit` |
| [ ] | [Super Jumpline – Trickline Webbing](https://slacktivity.com/shop/super-jumpline-trickline-webbing/) | Slacktivity | slacktivity.com — ⚠ similar to `Super Jumpline Slackline Set` (tricklinekits.json) | `tricklinekit` |
| [ ] | [TRICKLINE KIT - TRICK LINE 30](https://slacklines.us/products/trickline-kit-trick-line-30) | Spider Slacklines | slacklines.us — ⚠ similar to `Trickline Kit - Pro Line 25` (tricklinekits.json) | `tricklinekit` |
| [ ] | [SLACKLINE KIT - TRICK LINE 25](https://slacklines.us/products/slackline-kit-trick-line-25) | Spider Slacklines | slacklines.us — ⚠ similar to `SLACKLINE KIT - PIRATE 18` (starterkits.json) | `tricklinekit` |
| [ ] | [SLACKLINE KIT - PRO LINE 20](https://slacklines.us/products/slackline-kit-pro-line-20) | Spider Slacklines | slacklines.us — ⚠ similar to `SLACKLINE KIT - PIRATE 18` (starterkits.json) | `tricklinekit` |


---

## Sweep 2 — all active manufacturers (added 2026-07-31)

Swept all 42 active manufacturers with a website from `manufacturers.json`. This section holds **73 candidates** across 17 brands, diffed against the DB. **Name / URL / guessed type only.**

Method: Shopify/WooCommerce JSON feeds where available (Gibbon, Viper, Slackline Industries, Middle Way, Yoga Slackers, SlackGear, Bera, Slack house), WebFetch for the rest. Non-Latin names (Hebrew) left as-is.

**Scope notes:** the 16 general climbing/PPE brands (Petzl, CAMP, Kong, Edelrid, Mammut, ISC, SMC, Rock Exotica, Van Beest, Singing Rock, Tendon, Trango, Fusion Climb, CMC Rescue, Krok, Episwiss) were **not** deep-swept — their slackline-specific gear is already in the DB and their catalogs are overwhelmingly non-slackline. Unreachable: a-zero.com.ar (DNS fail), slacklineshop.co.nz (403), bloacs.de (B2B installs, no retail products). Length variants collapsed to one row per product.

### Webbing (5)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Lagoon](https://www.slackshop.cz/en/dyneema/256-eqb-lagoon.html) | Equilibrium Slacklines (EQB) | slackshop.cz | `webbing` |
| [ ] | [FireFly](https://slack-mountain.com/fr/sangles-slackline/185-4504-firefly.html) | Slack Mountain | slack-mountain.com | `webbing` |
| [ ] | [Sigma N (Jormungand)](https://www.slackliner.de/de/Sigma-N-jormungand-270.html) | Slackliner.de | slackliner.de | `webbing` |
| [ ] | [50M 25mm Slackline Webbing](https://www.viperslacklines.co.za/products/50m-25mm-slackline-webbing) | Viper Slacklines | viperslacklines.co.za | `webbing` |
| [ ] | [eLine Webbing: Now available at 49 or](https://yogaslackers.com/shop/slackline/eline-webbing/) | Yoga Slackers | yogaslackers.com | `webbing` |

### Weblock (12)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [WEBLOCK](https://www.beraadventure.com.br/product/weblock-50mm-soft-release-50mm/) | Bera Adventure | beraadventure.com.br | `weblock` |
| [ ] | [ANEL LINELOCK – BERA](https://www.beraadventure.com.br/product/anel-linelock-bera/) | Bera Adventure | beraadventure.com.br | `weblock` |
| [ ] | [Slackfriend](https://www.radrigs.co.uk/product-page/slackfriend) | Radrigs | radrigs.co.uk | `weblock` |
| [ ] | [Aeris Mono weblock](https://slackhouseshop.pl/produkt/aeris-mono-weblock/) | Slack house | slackhouseshop.pl | `weblock` |
| [ ] | [Chainlink LineLocker](http://www.slackgear.co.za/product/chainlink-linelocker/) | SlackGear | slackgear.co.za | `weblock` |
| [ ] | [Meercat LineLocker](http://www.slackgear.co.za/product/meercat-linelocker/) | SlackGear | slackgear.co.za | `weblock` |
| [ ] | [Linelocker for 50mm](https://www.slackliner.de/de/Linelocker-fuer-50mm-Baender-251.html) | Slackliner.de | slackliner.de | `weblock` |
| [ ] | [Boa - Slackline Weblock for](https://www.viperslacklines.co.za/products/boa-constrictor-slackline-weblock) | Viper Slacklines | viperslacklines.co.za | `weblock` |
| [ ] | [Aluminium Slackline Linelock Ring](https://www.viperslacklines.co.za/products/aluminium-static-slackline-linelock) | Viper Slacklines | viperslacklines.co.za | `weblock` |
| [ ] | [Viper Constrictor](https://www.viperslacklines.co.za/products/viper-constrictor-25mm-linelock) | Viper Slacklines | viperslacklines.co.za | `weblock` |
| [ ] | [Line Lock](https://yogaslackers.com/shop/slackline/linelock/) | Yoga Slackers | yogaslackers.com | `weblock` |
| [ ] | [lineLoose Buckle](https://www.linegrip.com/shop/slackpro-lineloose-buckle/) | lineGrip (formerly Slack Pro!) | linegrip.com | `weblock` |

### Roller (4)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Balance Roller](https://www.gibbon-slacklines.com/products/balanceroller) | Gibbon | gibbon-slacklines.com | `roller` |
| [ ] | [Compact Single Pulley](http://www.slackgear.co.za/product/compact-single-pulley/) | SlackGear | slackgear.co.za | `roller` |
| [ ] | [Compact Double Pulley](http://www.slackgear.co.za/product/compact-double-pulley/) | SlackGear | slackgear.co.za | `roller` |
| [ ] | [Rolley](https://www.viperslacklines.co.za/products/rollie-25mm-slackline-roller) | Viper Slacklines | viperslacklines.co.za | `roller` |

### Grip (2)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Grippex](https://www.viperslacklines.co.za/products/grippex-25mm-slackline-webbing-grip) | Viper Slacklines | viperslacklines.co.za | `grip` |
| [ ] | [CobraGrip (One Inch Dreams Edition)](https://www.linegrip.com/shop/one-inch-dreams-edition-cobragrip/) | lineGrip (formerly Slack Pro!) | linegrip.com | `grip` |

### Leash Ring (3)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Leash Rings Padding](http://www.petramslack.com/shop-1/leash-rings-padding) | Petram Slacklines | petramslack.com | `leashring` |
| [ ] | [Leash Rings](http://www.slackgear.co.za/product/leash-rings/) | SlackGear | slackgear.co.za | `leashring` |
| [ ] | [Enigma Leash Ring](https://www.viperslacklines.co.za/products/enigma-highline-leash-ring) | Viper Slacklines | viperslacklines.co.za | `leashring` |

### Tree Protector (14)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Treewear XL](https://www.gibbon-slacklines.com/products/slackline-treewear-xl) | Gibbon | gibbon-slacklines.com | `treepro` |
| [ ] | [Treewear](https://www.gibbon-slacklines.com/products/slackline-treewear) | Gibbon | gibbon-slacklines.com | `treepro` |
| [ ] | [Owijka Treewear XL](https://slackhouseshop.pl/produkt/treewear-xl/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Owijka Treewear](https://slackhouseshop.pl/produkt/treewear/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Classic Line Treewear](https://slackhouseshop.pl/produkt/classic-line-treewear/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Classic Line XL Treewear](https://slackhouseshop.pl/produkt/classic-line-xl-treewear/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Jibline XL Treewear](https://slackhouseshop.pl/produkt/jibline-xl-treewear/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Jibline Treewear](https://slackhouseshop.pl/produkt/jibline-treewear/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Surfer Line Treewear](https://slackhouseshop.pl/produkt/zestaw-surfer-line/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Funline Treewear](https://slackhouseshop.pl/produkt/zestaw-funline/) | Slack house | slackhouseshop.pl | `treepro` |
| [ ] | [Tree Protectors](http://www.slackgear.co.za/product/tree-protectors/) | SlackGear | slackgear.co.za | `treepro` |
| [ ] | [Flexitube](https://sicherungsprofi.de/flexitube/SL05-RS) | Slackstar | sicherungsprofi.de | `treepro` |
| [ ] | [Impact Protection](https://sicherungsprofi.de/prallschutz/SL81803-A) | Slackstar | sicherungsprofi.de | `treepro` |
| [ ] | ["Boomslang" Slackline Tree Protectors](https://www.viperslacklines.co.za/products/boomslang-tree-protectors) | Viper Slacklines | viperslacklines.co.za | `treepro` |

### Starter Kit (27)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Acrobat Kit 15m](https://www.acrobatslackline.com/product-page/%D7%A2%D7%A8%D7%9B%D7%AA-%D7%A1%D7%9C%D7%A7%D7%9C%D7%99%D7%99%D7%9F-15-%D7%9E) | Acrobat Slackline | acrobatslackline.com | `starterkit` |
| [ ] | [KIT SLACK CAMUFLADO](https://www.beraadventure.com.br/product/kit-camuflado-20-metros/) | Bera Adventure | beraadventure.com.br | `starterkit` |
| [ ] | [KIT ELASTIC LINE](https://www.beraadventure.com.br/product/kit-elastic-line-50mm-x-30-metros/) | Bera Adventure | beraadventure.com.br | `starterkit` |
| [ ] | [KIT PINK SLACK](https://www.beraadventure.com.br/product/kit-pink-slack-20-metros/) | Bera Adventure | beraadventure.com.br | `starterkit` |
| [ ] | [KIT STREET BALANCE SLACK](https://www.beraadventure.com.br/product/kit-street-balance-slack-20-metros-backup/) | Bera Adventure | beraadventure.com.br | `starterkit` |
| [ ] | [KIT BOBSLACK](https://www.beraadventure.com.br/product/kit-bobslack-20-metros-backup/) | Bera Adventure | beraadventure.com.br | `starterkit` |
| [ ] | [Zen Longline Kit](https://www.slackshop.cz/en/for-advanced/2-526-zen-longline-set.html) | Equilibrium Slacklines (EQB) | slackshop.cz | `starterkit` |
| [ ] | [BANANALAMA SET](https://www.gibbon-slacklines.com/products/bananalama) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [CLASSICLINE SET](https://www.gibbon-slacklines.com/products/classicline-treewear-set) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [JIBLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/jibline) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [SURFERLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/surfer-line-treewear-set) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [TRAVELLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/travel-line-treewear-set) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [FUNLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/fun-line-treewear-set) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [FLOWLINE TREEWEAR SET](https://www.gibbon-slacklines.com/products/1-inch-flow-line-treewear-set) | Gibbon | gibbon-slacklines.com | `starterkit` |
| [ ] | [Slack-Kit](https://www.radrigs.co.uk/product-page/slack-kit) | Radrigs | radrigs.co.uk | `starterkit` |
| [ ] | [30m Slackline Kit: 1" Slackhouse Webbing](https://slackmitra.myinstamojo.com/product/30m-slackline-kit-1-slackhouse-webbing) | Slack Mitra | slackmitra.myinstamojo.com | `starterkit` |
| [ ] | [Highline Leash Kit](http://www.slackgear.co.za/product/highline-leash-kit/) | SlackGear | slackgear.co.za | `starterkit` |
| [ ] | [BOSS LINE KIT - WEB EXCLUSIVE](https://www.slacklineindustries.com/products/boss-line-kit) | Slackline Industries | slacklineindustries.com | `starterkit` |
| [ ] | [Sigma Slackline Set 35mm](https://www.slackliner.de/de/Sigma-Slackline-Set---35-mm----15m-lang-180.html) | Slackliner.de | slackliner.de | `starterkit` |
| [ ] | [DoubleLine Basic](https://sicherungsprofi.de/doubleline-basic/SL81809) | Slackstar | sicherungsprofi.de | `starterkit` |
| [ ] | [30m Lightweight Slackline Kit - Primitive Tension](https://www.viperslacklines.co.za/products/30m-lightweight-slackline-kit-primitive-tension) | Viper Slacklines | viperslacklines.co.za | `starterkit` |
| [ ] | [20m Lightweight Slackline Kit - Primitive Tension](https://www.viperslacklines.co.za/products/20m-25mm-slackline-kit) | Viper Slacklines | viperslacklines.co.za | `starterkit` |
| [ ] | [eLine SlackLine: Eco Kit](https://yogaslackers.com/shop/slackline/eline-slackline-eco-kit/) | Yoga Slackers | yogaslackers.com | `starterkit` |
| [ ] | [eLine Slackline Pro Kit](https://yogaslackers.com/shop/slackline/eline-slackline-pro-kit/) | Yoga Slackers | yogaslackers.com | `starterkit` |
| [ ] | [eLine Slackline](https://yogaslackers.com/shop/slackline/eline-slackline-108-kit/) | Yoga Slackers | yogaslackers.com | `starterkit` |
| [ ] | [eLine Slackline Full Kit](https://yogaslackers.com/shop/slackline/eline-slackline-kit/) | Yoga Slackers | yogaslackers.com | `starterkit` |
| [ ] | [Tree Pro (Set of 2)](https://yogaslackers.com/shop/slackline/tree-pro/) | Yoga Slackers | yogaslackers.com | `starterkit` |

### Trickline Kit (6)

| ✓ | Item | Brand | Source | Type |
|---|------|-------|--------|------|
| [ ] | [Trick 20m](https://www.slackshop.cz/en/for-beginners/8-eqb-trick-20-m.html) | Equilibrium Slacklines (EQB) | slackshop.cz | `tricklinekit` |
| [ ] | [ערכת טריקליין Trickline](https://middlewayslacklines.com/trickline/) | Middle Way Slacklines | middlewayslacklines.com | `tricklinekit` |
| [ ] | [Zestaw Andy Lewis Trickline](https://slackhouseshop.pl/produkt/zestaw-andy-lewis-trickline/) | Slack house | slackhouseshop.pl | `tricklinekit` |
| [ ] | [Jibline](https://slackhouseshop.pl/produkt/zestaw-jibline/) | Slack house | slackhouseshop.pl | `tricklinekit` |
| [ ] | [TRICK LINE KIT](https://www.slacklineindustries.com/products/trick-line-kit) | Slackline Industries | slacklineindustries.com | `tricklinekit` |
| [ ] | [DUOred](https://www.slackliner.de/de/DUOred8.html) | Slackliner.de | slackliner.de | `tricklinekit` |
