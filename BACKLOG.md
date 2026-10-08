# Backlog

Non-phase engineering tasks not tracked in [PLAN.md](PLAN.md) (frontend roadmap).

## Backend / data

- [ ] **Elephant Slacklines: loose ends from the archive pass (2026-10-08).** The Elephant rows
  were checked against the Wayback copies of elephant-slacklines.com (three shops, 2011–2019) and
  the still-live Shopify store, where all five products are sold out (all our rows are already
  `active: false`). Archived pages are in English up to 2013; the 2014–2016 meter-ware pages are
  German, so they gave specs and prices but no descriptions.

  Done:
  - [x] **Wing 3.5** (webbing #108) — maker blurb and archive link from the 2012 English page;
    €1.60/m and 54 g/m from the 2015 meter-ware page (cited in `notes`). Specs already matched
    (35 mm, 30 kN, 5.9 % at 7.5 kN). First photos: a coil shot (main), the 25 m set with the two
    treeskins painted out onto the white background (a crop would have cut the ratchet), and the
    archived coil on white.
  - [x] **Passion Red** (webbing #25) — price changed from 3 CAD to Elephant's own €2.20/m, plus an archive
    link to the meter-ware page. Specs matched (polyamide, 3.6 mm, 33 kN, 69 g/m, 11 % at 7.5 kN,
    15 % at 15 kN). Only German text exists, so no description.
  - [x] **flash'line** (webbing #106) — breaking strength filled in (45 kN), €2.30/m (was €2.35), link
    moved from the homepage to the archived meter-ware page. 86 g/m and 2 % at 7.5 kN matched (other
    Elephant pages say 2 % at 7 kN). Second photo: the pink and yellow rolls.
  - [x] **blueWing** (webbing #24) — three photos added (coil on white, 200 m spool, rigged line from
    the live shop); the conflicting stretch figures recorded in `notes` (see below). Live link and
    blurb kept.
  - [x] **EcoLine** (webbing #107) — three in-use photos from the live shop (scaled to 1200 px). Specs,
    price (€1.95/m) and live link all matched. The shop's 1000 px product shot is the same photo as
    ours with more white around it, so ours stays the main image.
  - [x] **T-Rig** (weblock #100) — maker blurb and archive link from the 2017 English page; two
    photos on white. Specs and €95 matched. The 2019 shop's "Line lock" is the same product renamed,
    not a second weblock.
  - [x] **on'sight** (starter kit #73) — new row. 25 m × 25 mm, single long-arm ratchet, slings,
    shackles and tree'skins; the 15 m version and the webbing's specs (light blue, 30 kN, 3.6 % at 7 kN, 7.2 % at
    15 kN) are in `notes`. blueWing's predecessor. German page only, so no description; the only photo
    is the boxed set at 300 px. It was briefly webbing #270, never committed.
  - Checked, left alone: **Treeskin** (tree protector #23) is 1.5 m × 14 cm, as held. Elephant
    priced it at €8.75 (2015) against the €9.68 we hold from a shop, whose live link still works.

  Still open:
  - [ ] **blueWing stretch.** Elephant published three different figures (all in the row's
    `notes`): 3.6 % at 7 kN / 7.2 % at 15 kN (2012), 7.2 % at 7 kN / 14.5 % at 15 kN (2014), and 5.9 %
    at 7.5 kN on today's shop page (the Wing 3.5's number, likely a copy-paste). The 20-point curve we
    hold matches the 2014 page at 15 kN only. Which figure is right is still undecided.
  - [ ] **Kits we don't hold.** None of Elephant's other sets has a starter-kit row: Rookie, Addict
    and Freak flash'line, the Wing 3.5 sets (15 m girth hitch, 25 m slings), the blueWing 25 m set,
    EcoLine 12 m, PocketLine (13 m, 25 mm, Ellington, 850 g) and Garden Kit. All have archived pages
    and photos, e.g.
    <https://web.archive.org/web/20121015235310/http://www.elephant-slacklines.com:80/contents/en-uk/d86_rookie.html>.
    Horizon (100 m blueWing) and Cloud (70 m Passion) are longline kits, which no gear type covers.
  - [ ] **trendline** (yellow 50 mm set) — only its images were archived, no page or specs:
    <https://web.archive.org/web/2013/http://elephant-slacklines.com/contents/media/l_trendline_set_2013_web.png>.
  - [ ] **T-Lock** — the T-Rig's predecessor ("As successor of our trusted T-Lock…"), part of the
    Horizon set. No archived page.
  - Not Elephant's own, so skipped: the lineGrip G4 Alu (Slackpro's, held already) and the
    Edelrid pulleys.

- [ ] **Landcruising gear we don't hold, and loose ends from the archive pass (2026-10-01).** The
  existing 23 Landcruising rows were updated from the Wayback copy of landcruising-slacklines.de
  (archive links, maker blurbs, prices, not-for-highline from the Lynx/Zilla manuals, manuals and
  test certificates in `gear-manuals/`). The products below are Landcruising's own; none had a row
  when this pass started.
  "(DE)" means the only working capture is German, so there is no description to take.

  **Imported 2026-10-08**: every product below that has a photo is now a real row in the root
  seeds (ticked, with its id). The four without one — Linelocker 25, Linelocker 35, Cruiser 2.0
  Classic and Cruiser 2.0 Vari — **need a photo before they go on the main site**. Until then they
  stay staged in the local dev DB only: `candidates/` (untracked, git-excluded) holds them in seed
  format with temporary ids 9001+, and `python3 candidates/stage.py apply|revert|status` puts them
  in or takes them out. Items with only a name and no working capture are in the next-but-one
  section instead.

  Socials, for gear announcements with photos and specs: Facebook
  <https://www.facebook.com/landcruising.slackline> (from `manufacturers.json`). No Instagram
  found: Landcruising closed in 2018, and `@landcruising` is an unrelated account.

  - Webbings
    - [x] **Nova Magic 25** (webbing #265) — red White Magic, PES flat, 31 kN, 57 g/m, 6 % at ⅓ MBS (DE):
      <https://web.archive.org/web/20100328221304/http://www.landcruising-slacklines.de/03-02-01-nova-magic-25mm-meterware.html>
    - [x] **White Magic 35mm** (webbing #266) — 35 kN, sold as 16 m with sewn loop (DE):
      <https://web.archive.org/web/20121026070842/http://www.landcruising-slacklines.de/de/shop/2-slackline-band/26-polyester/132-white-magic-35mm-mit-schlaufe>
    - [x] **Sonic** (1st gen, webbing #267) — PA core-sheath, 31.5 kN, 63 g/m, 13.4 % at 10 kN (DE):
      <https://web.archive.org/web/20120822061828/http://www.landcruising-slacklines.de/de/shop/2-slackline-band/29-polyamid/283-sonic-25mm-meterware>.
      Sonic 2.0 is held already, as Aki Slacklines **#5**.
    - [x] **Verve 25, red (2010)** — merged into **#151**, renamed **Verve Red** (2026-10-07). The
      red page's specs won (31 kN, 7 % at 10 kN, 58 g/m, 1.49 €/m); the 2014 page #151 used to cite
      ("shiny yellow", 11 % at 10 kN, 59 g/m) is kept in its notes:
      <https://web.archive.org/web/20110722171318/http://www.landcruising-slacklines.de/en/shop/2-slackline-band/26-flachband-25/148-verve-25mm-meterware?limitstart=0>
  - Weblocks
    - [x] **Lockman** (weblock #139) — stainless pin, 75 g, >30 kN, 10 kN WLL; not for highlines per its manual
      (rev 1.1, German, filed as its manual):
      <https://web.archive.org/web/20141231113021/http://www.landcruising-slacklines.de/en/shop/12-bandhalter/48-landcruising-lockman>
      (German: <https://web.archive.org/web/20130318032941/http://www.landcruising-slacklines.de/index.php?category_id=12&page=shop.product_details&product_id=48&Itemid=34&option=com_virtuemart&vmcchk=1&Itemid=34>,
      manual: <https://web.archive.org/web/20140702200322/http://www.landcruising-slacklines.de/data/docu/manuals/lockman%20manual-rev1.1.pdf>)
    - [x] **Lockman 2.0** (weblock #140) — 93 g, >30 kN, 8 kN WLL. Also sold by Aki as "Aki Lockman 2": one
      product, one row (Landcruising, Aki as seller). Only photo is 200 × 200; its own manual
      ("Manual-Lockman 2.0") is linked from the page but not yet found:
      <https://web.archive.org/web/20161103153205/http://www.landcruising-slacklines.de/en/shop/34-neue-produkte/486-landcruising-lockman-20>
    - [x] **Puma 32** (1st gen, weblock #141) — 30–32 mm, 380 g, >59 kN, 14 kN WLL. Second photo
      is the Puma jumpline series (26 / 32 / 35 / 50); the 26, 35 and 50 were available on
      request and are recorded in #141's notes, deliberately not as rows. The page links a manual
      (PDF) not yet fetched:
      <https://web.archive.org/web/20120822095728/http://www.landcruising-slacklines.de/en/shop/4-harte-ware/12-fixierer/285-landcruising-puma>
    - [ ] **Linelocker 25** — chain link, 60 g, 31.5 kN WLL. Staged; **needs a photo** (the archive
      holds none of its own) before it goes on the main site:
      <https://web.archive.org/web/20130415083232/http://www.landcruising-slacklines.de/en/shop/12-fixierer/29-landcruising-linelocker-25mm>
    - [ ] **Linelocker 35** — 130 g, 53 kN WLL (DE). Staged; **needs a photo** before it goes on
      the main site:
      <https://web.archive.org/web/20140507075500/http://www.landcruising-slacklines.de/de/shop/12-fixierer/30-landcruising-linelocker-35mm>
  - Starter kits
    - [x] **Starter Flex** (starter kit #67) — 35 mm × 16 m, ratchet, 3.3 kg:
      <https://web.archive.org/web/20130212093429/http://www.landcruising-slacklines.de/en/shop/1-slackline-sets/30-starter-serie/4-starter-flex-slackline-set-16m?vmcchk=1>
    - [x] **Starter Aerial** (starter kit #68) — 35 mm × 16 m, ratchet, 4.45 kg:
      <https://web.archive.org/web/20120802062120/http://www.landcruising-slacklines.de/en/shop/1-slackline-sets/30-starter-serie/6-starter-aerial-slackline-set-16m?vmcchk=1>
    - [x] **StarterPlus** (starter kit #69) — 35 mm × 16 m, ratchet (DE):
      <https://web.archive.org/web/20100328221014/http://www.landcruising-slacklines.de/01-02-landcruising-starterplus.html>
    - [x] **Cruiser** (starter kit #70) — 25 mm × 30 m, Ellington, 4.3 kg:
      <https://web.archive.org/web/20110722151940/http://www.landcruising-slacklines.de/en/shop/1-slackline-sets/31-cruiser-serie/113-cruiser-slackline-set-30m>
    - [ ] **Cruiser 2.0 Classic** — 25 mm × 30 m yellow Verve, Ellington, 5.4 kg. Staged; **needs a
      photo** (only 120–132 px thumbnails were archived) before it goes on the main site:
      <https://web.archive.org/web/20161007043021/http://www.landcruising-slacklines.de/en/shop/34-neue-produkte/369-cruiser-20-classic-slackline-set-33m>
    - [ ] **Cruiser 2.0 Vari** — 25 mm, webbing chosen separately (none / 20–50 m), 2 Lockman 2,
      ≈5.4 kg. Staged; **needs a photo** before it goes on the main site:
      <https://web.archive.org/web/20161007042747/http://www.landcruising-slacklines.de/en/shop/34-neue-produkte/370-cruiser-20-vari-25mm-slackline-set>
  - Tree protectors
    - [x] **TreePlus 2.0** (tree protector #27) — 2 m × 18 cm, 600 g/pair:
      <https://web.archive.org/web/20110722120010/http://www.landcruising-slacklines.de/en/shop/3-baumschutz/73-treeplus-20-baumschuetzer>
    - [x] **TreeBuddies** (tree protector #28) — 1.6 m × 14 cm, 270 g/pair (DE):
      <https://web.archive.org/web/20100717061247/http://www.landcruising-slacklines.de/04-04-treebuddies-baumschuetzer.html>
  - Longline kits (Conveyor, Ronin, Sensei 1–3, Ninja) are archived too but fit no gear type we have.
  - Loose ends on rows we hold
    - [ ] **Webbing #152 "Wave Tube  32"** is not a duplicate of Matrix Outer #115 after all: it is
      Aki's Wave Tube 32, with the wrong brand, material and width. See the Aki item below.
    - [ ] **Aloha #164** still links the live `aki-slacklines.de` Tidal page; it was never archived.
    - [x] **Wave Tape 19 #117 was merged into Wave Tube 19 #118** (2026-10-07): one product in two
      colours. Where they disagreed (flat vs tubular, 18 vs 17 kN, 38 vs 36 g/m) the Wayback page
      of #118 won; #117's red photo is now #118's second. `/webbing/117` now 404s, as 209/210 do.
    - [ ] **Photos too small** — larger ones would be better: Matrix Outer #115 (two 150 × 85
      thumbnails from the shop's related-products box), Nova Magic 25 #265 and White Magic 35mm
      #266 (150 × 85 each), Starter Flex #67 and StarterPlus #69 (120 × 73), Lockman 2.0 #140
      (200 × 200, the only size archived). (Wizard #8 and Puma 2.0 #66, missing until now, have
      photos supplied by the operator, 2026-10-07.)
    - [ ] **Manuals linked but not fetched**: Puma 32 #141 (its shop page links a PDF), Lockman 2.0
      #140 ("Manual-Lockman 2.0", not found in the archive yet) and Aki Soma #268 (see the Aki item).
      Lockman #139's German manual (rev 1.1) is filed and is what sets its not-for-highline flag.
    - [ ] **Stretch curves that disagree with the maker's own table** were left as they are: White
      Magic #6 (maker gives 4.8 % at 10 kN, the seed 5.1 %) and Core 1 #3 (maker gives 2.7 % at
      10 kN, the seed 2.8 %). The differences are small, but a decision is needed on which source wins.
    - [ ] **Unicorn #7 highline status** was left null: the maker markets it for highlines, but also
      says they "officially do not sell slacklines for use in highlines".

- [ ] **Aki Slacklines gear we don't hold, and loose ends from the archive pass (2026-10-05).** Aki
  continued part of the Landcruising range, and its shop is now behind a password page, so
  everything below comes from the Wayback copies of aki-slacklines.de: the old Shopware shop
  (numbered URLs, mostly German captures, to 2024) and the Shopify shop that replaced it (2024–25).
  Raptor was added as weblock **#134** in the same pass. "(DE)" means the only working capture is
  German, so there is no description to take.

  **Imported 2026-10-08**: every product below now has a real row in the root seeds (ticked,
  with its id); none is left staged.

  Socials, for gear announcements with photos and specs (linked from Aki's own shop footer):
  Facebook <https://www.facebook.com/akislack>, Instagram <https://www.instagram.com/akislack/>,
  YouTube <https://www.youtube.com/channel/UCw5wJslJNS96DMOKNcg2LTA>.

  - Webbings
    - [x] **Soma** (webbing #268) — PES flat 3-layer, 24.5 mm, 2.7 mm, 32.5 kN MBS (34 kN average), 6.5 kN WLL,
      8.7 % at 10 kN, 62 g/m, 1.40 €/m on sale, made in Germany (DE); the page links a manual, not
      yet fetched. Width is an integer column, so the 24.5 mm is served as 24:
      <https://web.archive.org/web/20240713154858/https://aki-slacklines.de/de/slacklineband/polyester/186/aki-soma-slacklineband?c=6>
  - Weblocks
    - [x] **Lockman 2** — settled: it is Landcruising's Lockman 2.0 (weblock #140), under Landcruising with
      Aki as a seller (see the Landcruising item). Aki's page (64 × 18 × 18 mm, 16.50 €, DE):
      <https://web.archive.org/web/20210728193156/https://aki-slacklines.de/de/hardware/bandhalter/13/aki-lockman-2-bandhalter?c=13>
  - Tree protectors (we hold no Aki tree protectors). Polypropylene felt, 5 mm, Velcro closure, sold
    singly, not in pairs.
    - [x] **Tree Protection Small** (tree protector #29) — 100 × 15 cm, no loops, 100 g, trees up to 0.9 m, blue or
      orange, 6.50 €, made in Poland. The old shop's "Baumschutz S" is the same product:
      <https://web.archive.org/web/20250121181919/https://aki-slacklines.de/en/products/aki-slackline-treepro-small>
    - [x] **Tree Protection Medium** (tree protector #30) — 150 × 20 cm, 2 sewn loops, 170 g, trees up to 1.3 m, black,
      9.50 €, made in Poland:
      <https://web.archive.org/web/20240919201753/https://aki-slacklines.de/en/products/aki-slackline-treepro-medium>
    - [x] **Tree Protection XL** (tree protector #31) — 250 × 25 cm, 4 sewn loops, 360 g, trees up to 2.3 m, black,
      14.50 €:
      <https://web.archive.org/web/20250121184542/https://aki-slacklines.de/en/products/aki-slackline-treepro-xl>
  - Not a gear type we have: Starter 35 (the 35 mm line from the Starter kits, not a webbing
    in its own right), T-Leash Cobra, sewn loops, the T-Loop backup split, Backup Extenders,
    Soft Release Light, Soft Thimble, slings, Zentube centering bushings, and the third-party gear
    Aki resold (shackles, Ticket to the Moon hammocks).
  - Loose ends on rows we hold
    - [ ] **Aki is recorded as a seller** (`gear_sellers`) on the eight Landcruising webbings its
      shops sold — White Magic #6, Unicorn #7, Wizard #8 (on the operator's word, 2026-10-07), Wave
      Tube #116, Wave Tube 19 #118, Verve Red #151, Wave Tube 32 #152 and Aloha/Tidal #164 — and on
      one weblock, Lockman 2.0 #140 (sold as "Aki Lockman 2"; the separate Aki row was never kept). Aki's founder founded and ran Landcruising (2008–2018,
      <https://web.archive.org/web/20241204015541/https://aki-slacklines.de/en/pages/about-aki-slacklines>).
      The duplicate Aki rows White Magic #209 and Unicorn #210 were merged into #6 and #7
      (2026-10-05). Their photos moved across; Aki's own prices (1.30 and 1.79 €/m) had nowhere to
      go, since a co-listing stores no per-seller price. Old `/webbing/209` and `/webbing/210` links
      now 404, because there is no redirect mechanism yet. Not added, since the match is unconfirmed: Matrix Outer #115
      (see #152 below) and Verve 35mm #113 (the old Aki shop's "Landcruising Slackline 35mm 18m"
      may be it).
    - [ ] **Wave Tube #116 and Wave Tube 19 #118** have Aki pages with fuller specs and archive
      links (both DE). Wave Tube 25: PA tubular, 25 mm, 2.3 mm, 21 kN, 4 kN WLL, 17 % at 10 kN,
      42 g/m, 1.80 €/m
      (<https://web.archive.org/web/20230930232851/https://aki-slacklines.de/de/slacklineband/polyamid/138/aki-wave-tube-25-slacklineband?c=6>).
      Wave Tube 19: 2.4 mm, PU-coated, 17.5 kN, 3.5 kN WLL, 18 % at 10 kN, 36 g/m, 1.45 €/m; mainly
      a sheath over dynamic rope
      (<https://web.archive.org/web/20240528072644/https://aki-slacklines.de/de/slacklineband/polyamid/15/aki-wave-tube-19-slacklineband>).
      The rows give 20 kN and 17 kN.
    - [ ] **Webbing #152 "Wave Tube  32"** is Aki's **Wave Tube 32**, recorded wrongly as a
      Landcruising 25.4 mm polyester webbing. Aki's page gives: PA tubular, 32 mm, 2.3 mm, 27 kN,
      5.4 kN WLL, 16 % at 10 kN, 55 g/m, 2.00 €/m, made in the EU; 25 mm weblocks don't fit it, and
      it threads over Wave Tube 25 to make a Matrix jumpline. Correct the brand, material, width,
      weight and price, and add the link (DE):
      <https://web.archive.org/web/20240528074507/https://aki-slacklines.de/de/slacklineband/polyamid/14/aki-wave-tube-32-slacklineband>.
      Matrix Outer #115 (Landcruising, 32 mm PA, 27 kN, 58 g/m) looks like the same webbing's
      earlier name. Decide whether they are one product.
    - [ ] **Starter Comfort #13** was renamed **"Aki Starter Slackline Kit"** in the Shopify shop:
      the same contents (adjustable tree slings, Tree Protection Medium), the same 30 kN / 5 kN /
      4 kg, and an English blurb that translates the German one. The newer page gives the English
      description, the 4 kg weight and 134.95 €:
      <https://web.archive.org/web/20241204025754/https://aki-slacklines.de/en/products/aki-starter-slackline-kit>.
      **Starter Classic #12**'s own capture gives its weight, 4.2 kg; the row has none.
    - [ ] **Rows linking the live, now password-locked shop** need archive links: Polar #177,
      Purple Gold #202, Nomad #203 and Lynx 5 #53. Shopify-era captures exist for Polar and Purple
      Gold (`/en/products/aki-polar-slackline-webbing`, `/en/products/aki-purple-gold-slacklineband`).
      Nomad's old page was never archived.

- [ ] **Aki / Landcruising gear known by name only — no working capture.** Not staged: each has
  a name and a URL at most, no page with specs or a photo. Each needs a capture found (a
  different Wayback timestamp, the Shopify-era URL, a dealer's copy) before it can become a row.
  - [ ] **Nova Magic 35** (Landcruising) — the only capture is "product not found"; the Starter
    Flex page names it as the red 35 mm line.
  - [ ] **Lockman Air** (Landcruising) — no page of its own and no specs of its own; it appears
    only as a +20 € combo option on the AirBow page (WLL 6 kN in combination):
    <https://web.archive.org/web/20161009010520/http://www.landcruising-slacklines.de/en/shop/6-/38-/491-landcruising-airbow>.
    A 200 × 200 photo survives from the later Landcruising site:
    <https://web.archive.org/web/20180921083857im_/http://landcruising-slacklines.de/media/image/f3/53/63/Landcruising-Slacklines-Landcruising-Lockman-Air-Webbing-Anchor-01_200x200.jpg>
  - [ ] **Lockman Air** (Aki) — in the old shop's sitemap
    (`/de/hardware/bandhalter/81/aki-lockman-air-bandhalter`), no capture. Probably the same
    product as the Landcruising one.
  - [ ] **Polar B-quality** (Aki) — a fixed-length seconds version of Polar #177, listed in the old
    shop as `/en/webbing/polyester/217/aki-polar-webbing-b-quality-fixed-length`, no capture.
    Probably a note on #177 rather than a row.
  - [ ] **Tree Protection Large** (Aki) — old shop only
    (`/en/soft-rigging/tree-protection/154/aki-tree-protection-large`), no capture. Probably the
    XL: the XL's photo file is named `…-Baumschutz-Large-black.jpg`.

- [ ] **Slacktivity gear we didn't hold, and loose ends from the archive pass (2026-10-08).** Every
  Wayback capture of slacktivity.com, .ch, .de and .at was swept: the Joomla shop (2009–16), the
  Magento shop (2015–21), the WooCommerce shop (2021–) and its product sitemaps (2022–26), and the
  German Shopify shop on slacktivity.de. We already held 40 Slacktivity rows, so only five products
  turned out to be missing, all still sold. Three were added, one is on hold and one was rejected.
  Fixing the tree protectors added a sixth row (#32), and merging #157 into #223 removed one.

  **Still open:**
  - Ice & Fire is on hold, waiting on how to store kits that are both starter and trickline kits.
  - Is LSD-T20 its own row, or a colourway of GREEN T20 #225?
  - Should PRO #223 be renamed "PRO / Playline"?

  - Added (approved 2026-10-08), each linking the live page with the Wayback capture in its notes
    - [x] **Super Jumpline**, webbing **#269**: 37 mm, 36 kN, 5 % at 10 kN, 64 g/m, 2.98 €/m. The
      fibre and the construction are not stated anywhere, so both are null. It is the webbing in
      the held Super Jumpline set (tricklinekit #5).
    - [x] **Allround Light INOX | 15m**, starter kit **#71**: 15 m × 37 mm, a stainless ratchet,
      V-Loops, no slings or tree protectors (made for posts and wall mounts), 99 €.
    - [x] **Experience Light INOX | 30m**, starter kit **#72**: 30 m × 37 mm Experience webbing and
      two stainless ratchets, no slings, 159 € (DE, so no description).
  - On hold
    - [ ] **Ice & Fire | 25m Slackline Set**: 25 m × 38 mm, white or orange Super Jumpline, two
      stainless ratchets, slings and tree protectors, 299 €. **Waiting on a decision about kits
      that fit both starterkits and tricklinekits**: it is marketed for beginners, but two ratchets
      on 25 m is a trickline setup, and the held Super Jumpline set (#5) is a tricklinekit. The
      entry and its four photos are kept in `candidates/on_hold/`, which `stage.py` does not read:
      <https://slacktivity.com/shop/ice-fire-25m-slackline-set/>
  - Rejected — do not add
    - **Slackline Ring** (aluminium, 60/80 mm, 51 g, 20 kN, not PSA certified, 11 €; earlier
      "HighlineRing Green" 2016–17 and "AluminiumRing" 2020–21). **Not a leash ring** (operator,
      2026-10-08): it is a general-purpose ring that Slacktivity sells as a multiplier, and says
      not to use as an anchor. Recorded here so a later archive pass does not stage it again. It
      is not the held HighlineRing #26 (39 kN, ISA certified):
      <https://slacktivity.com/shop/slackline-ring/>
  - Looked at and not staged
    - **Variants and renames of held rows**: the Screw-gate HangOver (= HangOver-S #4, also sold
      with a "Black Gate"); Traveler-40m, Traveler-T20 40m and GREEN-T20 20m (lengths of GREEN T20
      #225); Super Jumpline trickline kit 25/50/70 m and Slackline-Set superJumpline (= #5);
      Allround, Allround-2, Allround-3 (= #14); Experience-2 (= #31); IUJ Slackline YOGA Set (the
      same 30 m pinkTube and HangOver-pulley set as #60, with IUJ branding); AcroLine 8 m and
      12 m sets (sets of the held AcroLine #222, set up untensioned). The tree protectors
      (TreeProtection 2.0 / 3.0 / V3 / 3L) are covered under the loose ends.
    - **LSD-T20** (20 mm nylon tube, 14 m with a sewn loop, 12 kN, 28 g/m): the GREEN-T20 webbing
      with an LSD sublimation print, and the line in the Traveler kit #62. It was not staged
      because we merged Wave Tape 19 into Wave Tube 19 as one product in two colours. **Decide
      whether it is a colourway of #225 or a row of its own**:
      <https://web.archive.org/web/20200919192803/https://www.slacktivity.com/lsd-t20>
    - **Type X Highline Webbing**: pinkTube #61 sewn to LSDTube #189 or to a 43 g/m PES backup. It
      is an assembly of held webbings, not a new one:
      <https://slacktivity.com/shop/type-x-highline-webbing/>
    - **Longer than any starter kit we hold (max 35 m)**, like the Landcruising longline kits:
      Expert 50/70 m and Expert Pro, Pro kit 50–100 m, Playline set 50–100 m, Lightning 40 m,
      Rodeo 40 m, Park50/Park100, redPark/pinkPark/LSDpark longline kits, HangOverPulley longline
      sets, Highline/Tree Highline/Rock Highline kits, Highline Trickzone Pro setup.
    - **Not a gear type we have**: Weekend Warrior (ninja line), DaVinci, Saltonator, ActiveCube,
      posts and wall mounts, the anti-theft slackline locks (small and large), bigGrip/smallGrip
      rope ascenders, soft releases, rigging plates, static rope, slings, shackles, bungees, the
      HighlineTool, and the X-Connection (a sewing service).
    - **Made by someone else and resold by Slacktivity**: recorded as co-listings (below), not
      rows. Edelrid Eddy is not a gear type we have.
  - Loose ends on rows we hold
    - [x] **Low stretch Webbing #157 merged into PRO #223** (2026-10-08): one webbing, 37 mm PES,
      3 % at 10 kN, 64 g/m, sold as "Low stretch 37 mm" (2017), "lowStretch" / "PRO 50m–100m"
      (2019–21), PRO, and on slacktivity.ch as **Playline**. #157's photo was a thumbnail of #223's
      and was dropped; `/webbing/157` now 404s. #223's notes record the names. Its name could
      become "PRO / Playline":
      <https://slacktivity.ch/shop/playline-slacklineband/>
    - [x] **Slacktivity recorded as a seller** (2026-10-08) of Slack Pro! LineGrip Alu G4 (grip #1),
      LineGrip G5 (#6) and HighlineGrip G2 (#9), and of Souz Snatch 2.2 (#2). Each was on
      Slacktivity's own shop.
    - [x] **#10 and #12 re-checked against the live pages** (2026-10-08). They are different
      products, and both had the wrong photo.
      - #10 is now named **TreeProtection Set**, as the shop does (it was "Slackline Tree
        Protection Set"): all felt, grey, 240 × 16 cm × 5 mm, 340 g, 40 € a set. Its old photo
        showed the white-edged TreeProtector 3.0 and was replaced with the live one.
      - #12 **Tree Protection | 3L**: felt front, polyester back, three 8 cm loops, 240 × 13.5 cm ×
        3 mm, 332 g, 23 € single. It now has both live photos.
      <https://slacktivity.com/shop/treeprotection-set/>,
      <https://slacktivity.com/shop/tree-protection-3l/>
    - [x] **#11 split into TreeProtector 2.0 and 3.0** (2026-10-08). The old row "TreeProtection
      Set | V2" had the 2.0's name and photo, the 3.0's specs, and #10's URL and description.
      Slacktivity's own comparison photo shows both generations
      (<https://slacktivity.ch/wp-content/uploads/2021/02/slackline-baumschutz-vergleich.jpg>).
      - **#11 TreeProtector 2.0** is historic: SKU TREE / TREE-2, about 2013–19, an all-brown felt
        roll, 240 × 12.5 cm × 3 mm, 0.5 l, 340 g, 29.95 € a pair. Photos: its old one, plus
        slacktivity.de's, which still lists it at 15 €.
      - **#32 TreeProtector 3.0** is new, and **inactive**: SKU TREE-3, from November 2019, felt
        with a white polyester edge, 240 × 13.5 cm × 3 mm, 1.0 l, 315 g, 23 CHF single. It links
        the live .ch page and has that page's five photos. The page still lists it, but on
        2026-10-08 it showed "Nicht vorrätig" (schema.org OutOfStock), so `active` is false.
      - **What changed** between them, in the maker's words: the 3.0 has a smaller pack size, is
        widened to 13.5 cm and is lighter. The stated volume went up (0.5 → 1.0 l) despite that.
      - slacktivity.com's 2021 "3.0" page repeated the 2.0's 12.5 cm / 340 g, so its specs were
        not used.
    - [x] **#12 3L and #32 3.0 stay separate rows** (operator, 2026-10-08). They have the same body
      (240 × 13.5 cm × 3 mm), but the 3L adds three 8 cm sling loops: SKU TREE-3L against TREE-3,
      332 g against 315 g. Slacktivity has listed them side by side since at least 2021 (the old
      .com shop's "TreeProtection-Set 3.0", TREE-3-2x, and "TreeProtection 3L SET", TREE-3L-1).
      They relate as Allround Light does to Allround. Folding #32 into #12, with loops as an
      option, was offered and not taken.

- [ ] **Raed Slacklines gear we don't hold, and loose ends from the archive pass (2026-10-08).**
  Every Wayback capture of raed-slacklines.com was swept: the Magento 1 shop (2018–19), the
  Magento 2 shop (2020–25), its category pages year by year, and the German `/de/` pages. The
  archive holds nothing before 2018 (raed.de, captured in 2011, is the climbing business). The live
  Shopify shop on raed-sports.com was read through its `products.json` as a cross-check, and is
  where the photos of products still sold come from. We already held 25 Raed rows, and every Raed
  webbing in the archive turned out to be one of them.

  Everything found was approved into the seeds on 2026-10-08: three weblocks (#142–#144) and eight
  starter kits (#74–#81). Only the Felt TreeProtection is held back, until a photo turns up.
  Products still sold link the live page, with the Wayback capture in their notes.

  - Weblocks
    - [x] **BLNC Weblock**: approved, weblock **#142**. Steel, hollow aluminium diverter, one
      PushPin plus big shackle holes, 284 g, 50 kN (2019) / 62 kN (2021), WLL 10 kN on its label,
      89.95 €, 2019–21. The RigLock #130 replaced it:
      <https://web.archive.org/web/20211126224802/https://raed-slacklines.com/blnc-weblock>
    - [x] **RODEO Steel Weblock**: approved as its own row, weblock **#143**. #73 was renamed
      **RODEO Ultralight Weblock**, and its photos re-keyed to `raed_rodeo-ultralight-weblock`. The
      steel one weighed 114 g / 9 kN at its launch (preorders Dec 2017), and 136 g / 13 kN after the
      June 2019 redesign, which Raed's blog marked "prohibited for tricklining and highlining". The
      same URL describes the aluminium #73 from 2021-07 on:
      <https://web.archive.org/web/20210117055054/https://raed-slacklines.com/rodeo-weblock>
    - [x] **PRO Weblock X-Link**: approved, weblock **#144**, a version of the PRO Weblock #65 with the pulley
      system's X-Link, which takes a Dyneema whoopie directly with no shackle. 389 g, 109 €, 2019.
      Its own page gives no material, WLL, pin types, width, diverter or usage, so those are #65's.
      MBS is #65's 62 kN, though its own page said 75 kN:
      <https://web.archive.org/web/20191120052510/https://raed-slacklines.com/pro-weblock-x-link>
  - Starter kits, all approved. Rodeoline Beginner, Yoga, Ninja and Parkline Comfort lead with a
    composite of their components' own photos, followed by the kit's own photos. The felt tree
    protection is missing from these composites because no photo of it exists. Ninja's composite
    shows shackles, as its text says, though the 2025 configurator gave carabiners. FUN Kit #33,
    Helium, Ultralight Travel, HUMBOLDT and Travel Set keep their own photos, which already show
    every piece.
    - [x] **Travel Slackline Set 20 m** (#74): 25 m MOTM, aluminium carabiners, D-ring linelockers,
      slings, tree protectors, 2100 g, 139.95 €, 2018–19:
      <https://web.archive.org/web/20191120052521/https://raed-slacklines.com/travel-slackline-set-20m>
    - [x] **Helium Set** (#75): 20 m Helium, Dyneema whoopies, aluminium carabiners, 1370 g, 179 €,
      2018–19:
      <https://web.archive.org/web/20191120052504/https://raed-slacklines.com/helium-ultralight-set>
    - [x] **Ultralight Travel Slackline Set** (#76): 20 m MOTM light (19 mm), 6 mm quicklinks, Helium
      slings, 1090 g, 106.67 €, 2020–21, no tree protection:
      <https://web.archive.org/web/20210926134532/https://raed-slacklines.com/ultralight-travel-slackline-set>
    - [x] **HUMBOLDT – Ultralight Travel Slackline Set** (#77): Eclipse webbing, RODEO weblock, Eclipse
      soft release, felt patches, 780 g. It was a 15 m kit in the archive (129.22 €) and is 20 m on
      the live shop (130 €). `manufacturer_not_for_highline` is set from the page's "RODEO may
      never be used in highlines":
      <https://raed-sports.com/products/humboldt-ultralight-travel-slackline-set>
    - [x] **Parkline Comfort Set** (#78): 30 m Rainbow, RODEO weblock, soft release, soft shackles,
      felt tree protection, 180 €, 2023–:
      <https://raed-sports.com/products/parkline-comfort-set>
    - [x] **Yoga Slackline Set** (#79): 25 m MOTM, carabiners, D-rings, felt tree protection, 140 €,
      2020–: <https://raed-sports.com/products/yoga-slackline-set>
    - [x] **Ninja Slackline Set** (#80): 30 m Rainbow (Cumulus in 2020), shackles, D-rings, felt
      tree protection, 139 €, 2020–. Approved as a starter kit, where Raed files it, though it is
      pitched at "your first tricks":
      <https://raed-sports.com/products/ninja-slackline-set>
    - [x] **Rodeoline Beginner Set** (#81): 25 m Helium, RODEO weblock, 2 slings, 2 carabiners, 130 €,
      2020–. It has no tensioning system (`Other`):
      <https://raed-sports.com/products/rodeoline-beginner-set>
  - Tree protectors
    - [ ] **Felt TreeProtection**: **not staged until a photo turns up**. Sold in pairs, 9.99 €,
      300 g, 2020–. There are no dimensions and no photo anywhere (the archive has only
      placeholders). In 2019 it was sold singly as "treeprotection feltmat" for 7.99 €:
      <https://raed-sports.com/products/2-felt-treeprotection>
  - Looked at and not staged
    - **Longline kits**, which fit no gear type we have (as with Landcruising and Slacktivity). They
      come with pulley systems: **Beginner Longline Set** (BLNC 5:1, BLNC weblock, 50 m Parsec,
      2019–, out of stock now), **Advanced Longline Set** (BLNC 9:1, TiLock, 2020–), **PRO
      Longline Set** (formerly "PRO Longline-Set Alpha", PRO 9:1, PRO weblock, TreePRO, 2019–21)
      and **Ultralight Longline Set** (PRO 5:1, Helium, 2020). The details, prices and photos for
      all four were gathered before they were dropped and can be restored.
    - **Variants and renames of held rows**: Fun Slackline Set 20 m (2019) is the FUN Kit #33.
      "PRO weblock \*\*\* new \*\*\*" and `pro-highline-weblock` are #65. The TiLock Titanium
      Alpine Highline Weblock is the TiLock rows. Dyneemite PRO 19mm is #229. Cumulus pure, MOTM
      light pure and Helium incl. loop are #60, #186 and #59. Rainbow rest pieces and every
      "used" or "B-Ware" listing are also covered by held rows.
    - **Not a gear type we have**: the PRO, BLNC and TiPS pulley systems (5:1 and 9:1) and their
      multipliers. Also the RopeGrabber, which grabs pulley rope, not webbing. Also rigging plates,
      Eclipse and Helium soft releases, anchor slings (RED, Helium, Parsec, Ultra, Dyneema
      whoopies), soft shackles, the PRO and ALPINE leashes and leash sets, TrickZone sleeves,
      highline freestyle and split setups (assemblies of held webbings), PushPins, sewing and
      testing services, and the ZAED climbing devices.
    - **Rodeoline Set** (live shop only): an empty bundle placeholder with no content.
    - **Made by someone else and resold by Raed**: the Seasure D-Ring linelocker, Kong and Maillon
      Rapide quicklinks, Omega shackles, Gleistein, Teufelberger and Skylotec ropes, Edelrid, and
      Spanset. (LineGrip G5 is held, and now lists Raed as a seller; see below.)
  - Loose ends on rows we hold (all done 2026-10-08)
    - [x] **RODEO Ultralight #73's `date_introduced`** is now Jul 2021: the page shows it on
      2021-07-25, and Raed's blog announced it on 2021-08-14. The Dec 2017 date it used to carry was
      the steel one's launch, which #143 now carries.
    - [x] **PRO Weblock #65 is now 62 kN**, Raed's own figure from 2021 on (75 kN in 2019). SlackDB
      had 100 kN.
    - [x] **Dyneemite PRO #229 now links its last Wayback capture.** Its price is still unset,
      though Raed sold it new until at least 2025-09 (3.79 €/m in 2022, 3.99 €/m in 2025):
      <https://web.archive.org/web/20250916235734/https://raed-slacklines.com/dyneemite-pro-ultralight-highline-project-webbing>
    - [x] **SuperMOTM #158 now links its Wayback capture**:
      <https://web.archive.org/web/20190718073229/https://raed-slacklines.com/supermotm-threaded-tubular-nylon-slackline-webbing>.
      No page for **#FFF #153** turned up under any slug.
    - [x] **Raed as a seller**: added to LineGrip G5 #6's `gear_sellers`, next to Slacktivity.

- [ ] **The webbing loader drops `notes`.** `add_webbings_to_db()` (`load_data/load_webbings.py`)
  never passes `notes` (nor `colors` or `version`) to `WebbingCreate`, so every webbing seed's notes
  are silently discarded at seed time — 78 rows carry them today, including the merge records on
  Wave Tube 19 #118 and Verve Red #151 and the provenance of #265–#268. The other loaders pass
  them through. Found 2026-10-08; one line each in the `WebbingCreate(...)` call, plus a test.

- [ ] **Adjudicate the remaining missing-gear candidates.** [MISSING_GEAR_REVIEW.md](MISSING_GEAR_REVIEW.md)
  has one section left from the 2026-07-31 deep sweep: **Starter / Longline / Highline Kit, 56
  rows**. 54 still need a keep/reject call; the two YogaSlackers eLine kits are ticked but not yet
  imported. Every other type is done: the approved webbing, weblock, leash ring, tree protector,
  roller, grip and trickline kit batches are all imported (trickline kits on 2026-09-29), and 11
  items are on the rejected list. Follow the per-type schema notes in that file's "Approved"
  section — the loaders take different object shapes (kits use `manufacturer`, not `brand`).

- [ ] **Named webbings we know exist but hold no specs for.** Twelve products surfaced by name only
  — no manufacturer confirmed for most, no width, MBS, weight, stretch or price. None of them are in
  `webbings.json` today. They are recorded here rather than seeded as stubs: a webbing row needs
  `width` NOT NULL, and the two ISA stubs in the entry below already show what that costs (BoomBoom seeds as
  **0 mm**). Source each one, then add it the normal way — id, brand with a `manufacturers.json`
  entry, `active` flag.

  - [ ] **Mystery Tube**
  - [x] **The Path** — added 2026-09-10 as webbing **260**, Cong Gear "Path".
  - [ ] **TWTSNBN** ("the webbing that shall not be named")
  - [x] **Float** (Balance Community) — not relevant: a prototype polypropylene/HMPE blend the
    operator had a few meters made of, never a product. Not to be listed.
  - [x] **PHAT** ("Polyester, Heavy, And Thicc", Balance Community) — not relevant: a prototype
    heavy polyester webbing the operator made a few meters of, never a product. Not to be listed.
  - [ ] **Pure**
  - [ ] **PowerLine** (HopOn) — reviewed at
    <https://www.outdoorgearlab.com/reviews/climbing/slackline/hopon-powerline>, which is a
    sourceable spec sheet. HopOn is not one of our manufacturers yet.
  - [ ] **Marmot Tube** (Mammot Tubular)
  - [ ] **Nathan Paulin castle special** — a one-off/limited line rather than a catalogue product;
    decide whether it belongs in the catalogue at all before sourcing it. (Techni Sangles)
  - [ ] **Dynosaur** (Santi)
  - [ ] **Bearsling**
  - [x] **Duct Tape** (Wall Ace) — added 2026-09-10 as webbing **259**, from the maker direct:
    the same 25 mm Dyneema-centre/nylon-edge weave as their Steel Cable, just thinner.

- [ ] **Add the gear items the ISA warnings point at.** Every entry in
  [isa_gear_warnings.json](isa_gear_warnings.json) now carries a `match` block (`gearType`,
  `gearIds`, `gearNames`, `confidence`, `note`) resolving it against the catalogue — 53 exact,
  12 likely, 1 partial, 10 ambiguous. **Six have nothing to point at**, in two tiers:

  *Type and brand both exist — just add the row (both done):*
  - [x] **SladLock light** (slack.fr) — ISA 82, weblock. Added 2026-09-02 as weblock **131**
    (`SladLock Light`) from the archived shop page; ISA 82 now points at it, and weblock 96
    SladLock Power stays a separate product with its own warning (ISA 12).
  - [x] **RigLock** (Raed Slacklines) — ISA 80, weblock. Added 2026-09-02 as weblock **130** from
    the archived manufacturer page; ISA 80 now points at it. Marked `active: false` — Raed's
    current weblock line is the TiLock and the RODEO.

  *Manufacturer missing:*
  - [ ] **Passion / Passion 18m** (Mountain Equipment) — ISA 40 (recall) + 41, starter kit. The kit
    type exists; Mountain Equipment is not one of our 56 brands. Two warnings resolve at once.

  *Needs a gear type we don't model:*
  - [ ] **Dogbones** — ISA 1 (Krok Хвостик) and 8 (Gibbon lineLock) have no home at all, and a
    further 7 dogbone warnings (2–7, 9) currently ride on the parent weblock's row rather than the
    product they actually name. Both brands already exist. Adding a `Dogbone` type is the single
    highest-yield gap here: 9 warnings.
  - [ ] **Whoopie** (Raed Slacklines) — ISA 22, sling, still in production. Brand exists, slings
    don't.
  - [ ] **Grigri** (Petzl) — ISA 42, brake, still in production. Neither a brake type nor Petzl as
    a brand; the only entry from outside the slackline industry.

  *A stub, now sourced:*
  - [x] **Slacktivity Hangover 1.0** (`rollers.json`, roller 22) for ISA 45. Specs, price (55 EUR)
    and two photos come from Slacktivity's own
    [HangOver Color-Edition](https://slacktivity.com/shop/hangover-color-edition/) page, which
    still sells V1.0 ("small gaps between the ball bearings") beside V2.0 — so it is `active: true`,
    even though the 2019 ISA entry says `inProduction: "No"`. Aluminium body as the roller material,
    steel bearings, per the operator (the same holds for Hangover 2.0, roller 2).

  The other stub, **Slack Inov BoomBoom** (`webbings.json` 246, ISA 78), is done — it carries real
  manufacturer specs now (25 mm tubular nylon, 52 g/m, 27 kN, a full 1–20 kN stretch curve, the
  Spider Slacklines co-listing). Only price and product URL are still unknown, and it stays
  `active: false`.

  The 10 `ambiguous` matches are a separate, smaller call: the ISA names one product where we hold
  several rows (EQB Katana/Katana FX, Mithril Pull/Quick Pin, Slacktivity SlackDuck/-DP, Raed TiLock
  19/25mm, Petram Aeris/Aeris P, lineGrip LineLock AL MK4/VA MKIII, LineGrip Alu G4/G5/nano, Souz
  Snatch 2.2/2.2T, Spider Lime vs Lime SR, Souz Rowan 1.2). Decide per item whether the warning
  covers the whole family or one variant.

- [ ] **Auto-sync ISA certification (every 24h).** Build a scheduled job that fetches the
  official ISA-approved gear list from
  <https://data.slacklineinternational.org/safety/isa-approved-gear/> once per day and refreshes
  `isa_approved_data.csv`, then rebuilds `isa_certified.json` with `scripts/build_isa_certified.py`
  (which keeps every hand-written `match` block and reports new certificates with an empty one).
  Certification is **derived** from that file by `load_isa_certifications.py` — no gear seed
  carries a flag any more (CLAUDE.md § ISA certifications, [PR #83](https://github.com/International-Slackline-Association/SlackData/pull/83)).
  So the job's real output is a queue of new certificates to adjudicate, not a DB write. All 17
  certificates we can hold are matched today, including **BC Loop** (leashring 27, the renamed BC
  Aluminum Leash Ring) and **SlackX Orange** (weblock 58, now `SlackX (formerly RadRigs) Orange`
  — the two brands were merged 2026-10-07). What stays unmatched is tracked in the entries below.

- [ ] **Leashes as a gear type.** Four ISA:37 certificates wait on it: **BC Threaded Highline
  Leash**, **Slacktivity HighlineLeash**, **raed PRO leash** and **raed ALPINE leash**
  (`approved_gear_4`, `10`, `11`, `32` in `isa_certified.json`). Needs the full new-gear-type
  checklist (CLAUDE.md), then `match` blocks for those four and a rebuild/re-seed.

- [ ] **"Not for highline" research for the other gear types.** `manufacturer_not_for_highline`
  (+ `_source`) exists on all eight gear models, but the first research pass covered only the 35
  sub-22 kN webbings (Appendix A of the [certification plan](https://github.com/International-Slackline-Association/SlackData/blob/5be24c10402cd1917d83385a9af001c142b622cc/ISA_CERTIFICATION_PLAN.md#appendix-a-the-35-sub-22-kn-webbings-s3-research-list), PR #83). Still to check against each maker's own
  page: weblocks, rollers, leash rings, grips, tree protectors, starter kits, trickline kits. `true`
  only on an explicit statement, `false` when marketed for highlining, `null` when silent or gone.

- [ ] **ISA certificates with no gear row to land on.** Left unmatched, each with a note:
  - **Slacktivity KingPin** — `approved_gear_27`, ISA:52 **Connector**. We *do* hold a Slacktivity
    KingPin, as **weblock 41** (style "Tensionable Weblock"); it was left unmatched because a
    connector certificate is not a weblock certificate. Decide whether it is the same product and
    whether an ISA:52 certificate should certify a weblock row — matching it would make 18
    certified rows, not 17.
  - **Intermittent Connection** webbing certificates (`approved_gear_16`, `19`, `22`, `25`, `26`) —
    they certify a way of joining webbing, not the webbing, so they never count (the loader refuses
    them even if matched). Revisit only if we ever model connection methods.

- [ ] **Add bungees as a gear type.** The `Bungee` model already exists on branch
  `bungees_ringpadding` (`slack_data/models/bungees.py`) but has **no seed JSON, no loader, no
  router, and no `Brand` back-reference** — no source data yet. To wire it up: source/build a
  `bungees.json`, add the `Brand._bungees` Relationship + computed field, a loader, a router,
  register both in `main.py`, then re-seed. Frontend: add to `config/gearTypes.ts` (already flagged
  "upcoming" in PLAN.md) + TS types mirroring `BungeePublic`.

  **Reference data sources (manufacturer bungee product pages):**
  - <https://www.balancecommunity.com/products/bc-bungees>
  - <https://slackx.eu/Products/Bungee-Anchor/>
  - <https://slacktivity.com/shop/slackline-bungees/>
  - <https://spider-slacklines.com/shop/en/bungee/1284-7330-modular-bungee.html#/1362-select_model-soft_shackle_openable>

- [ ] **Store production batches of the same product.** One row is currently one product, so every
  spec is a single value that silently claims to hold for everything ever sold under that name. It
  does not: a manufacturer changes a weave, a supplier, or a sewing line, and MBS / stretch /
  weight / thickness — and the ISA's opinion of the result — change with it.

  **This is already wrong on the live site, and in the direction that matters.** Five of the 82
  entries in [isa_gear_warnings.json](isa_gear_warnings.json) are explicitly batch-scoped ("Only
  one batch is affected", "produced before April 2020", "Serial Nr. XXXX2017", "50 Pins of the
  first batch"), and [load_isa_warnings.py](slack_data/load_data/load_isa_warnings.py) stamps them
  onto the whole product row because there is nothing narrower to stamp. **Slacktivity pinkTube**
  (`webbings.json` 61) carries two of them and is `active: true` — so we show a warning badge on a
  webbing you can buy new today, when only pre-April-2020 stock is affected. Over-warning is the
  safer failure of the two, but it is still false, and a catalogue that cries wolf on current stock
  teaches people to scroll past the badge that is real. **Slacktivity KingPin** (`weblocks.json` 41,
  also `active: true`) is the same shape.

  **The shape to decide.** Duplicating rows per batch is the one option to rule out up front — an id
  is the catalogue's stable identity (§ Loader pattern), already recorded in ISA match blocks,
  manufacturer credentials, submitted corrections and bookmarked links, and most products have
  exactly one batch anyway. That points at a child table (`WebbingBatch`, FK to `webbing.id`) whose
  columns are **nullable overrides** — null means "same as the parent" — plus whatever identifies
  the batch in the wild: a date range, a serial/lot pattern, a colour run. Open questions:

  - **Which fields are per-batch?** `breaking_strength`, `stretch`, `weight`, `thickness`,
    `isa_warning` are the candidates (certification is per certificate, set from
    `isa_certified.json`, so a batch-scoped one would need the certificate to say which batch).
    `name`, `brand_id`, `width`, `price` almost certainly are not. Getting this list wrong in either direction is what
    makes the feature either useless or unfillable.
  - **`ISAGearWarning` links by `(gear_type, gear_id)` with no FK** — deliberately, because a
    warning can land on any of five tables. A batch-scoped warning needs a third component, or a
    `gear_type` of `webbing_batch`. Either way the `isa_warning` severity enum on the parent row
    has to become an explicit "worst across batches", not an accident.
  - **Identity for the manufacturer API.** `matching.py` resolves `gear_id` + `name`; a batch adds
    a third axis with no name of its own. `manufacturer_sku` is the natural key and is already
    stored-but-unmatched — except most brands keep no part numbers at all, which is why it matches
    nothing today. A brand that cannot name its own batches cannot correct them either.
  - **Frontend.** A card shows one spec set and compare assumes one row is one thing. Batches
    probably belong on the detail page only (a selector, defaulting to current production), leaving
    the card showing the parent — but that has to be a decision, not a default.

  Note `BaseWebbing.version: str | None` already exists, is exposed on `WebbingPublic` and typed in
  `frontend/src/types/gear.ts`, and is **null for all 246 webbings**. It is a free-text label, not a
  batch entity — decide whether it becomes the batch's human-readable name or gets dropped, rather
  than leaving two half-answers to the same question in the schema.

  Only webbing is scoped here because that is where the evidence is; weblocks (KingPin, Slackibloc
  4) have the same problem and should be designed for even if not built at the same time.

- [~] **One product, several brands or sellers.** `brand_id` is a single required FK on every gear
  row, so the schema can only say "this is a Slack Inov Vortex". It cannot say "…which Spider
  Slacklines also sells", which is now true of most of the Slack Inov range. Rebadging and
  reselling are normal in this trade and we model neither.

  **The seller half is built and seeded** — `gear_sellers`, 64 co-listings, the Brand filter and
  "Also sold by" (§ Shipped, CLAUDE.md § Co-listings). What that leaves:

  **A. Data.**

  - [ ] **Per-seller prices and product URLs are not held at all**, and the schema no longer has
    anywhere to put them. That is the deliberate trade: nobody has sourced a per-product price or
    shop URL for this range, and a price on a public page that no shop ever quoted is worse than no
    price. If they are ever sourced, widening `gear_sellers` from `list[str]` to a list of objects
    is the change — and it should not be made before the data exists.
  - [ ] **Who actually makes what.** The bulk pass kept the catalogue's existing `brand_id` as the
    maker and named the other company as a seller. That is right for the common case and is **not
    verified per product** — where Slack Inov and Spider both resell a third party's webbing, the
    schema has no honest answer and the current rows silently assert one. Worth a pass with the
    manufacturers.

  **B. Frontend.**

  - [ ] **Answer counts and dedup before anything renders a seller on a card or in a list.**
    Manufacturer inventory counts ([brandSections.ts](frontend/src/utils/brandSections.ts),
    [useBrandDirectory.ts](frontend/src/hooks/useBrandDirectory.ts)), listing totals and
    [compare.ts](frontend/src/utils/compare.ts) all assume one row is one product. A seller-only brand would read
    as **0 items** on the directory for exactly this reason (SlackX did, until it was merged with
    Radrigs). Decide whether a seller's items
    count toward their inventory **before** the number is on screen and someone quotes it.

  **C. The write loop — not built, and deliberately so.**

  - [ ] **A seller has no way to correct anything about their own listing**, because there is
    nothing per-seller left to correct. The `matching.Role` maker/seller split, `SELLER_CHANGE_FIELDS`,
    the 403 on a spec change from a seller and `Submission.target` were all built against the side
    table and removed with it. Rebuild them **only** alongside per-seller price/URL data (A above) —
    they exist to bound an edit surface that does not currently exist.

  **D. Deliberately not built.**

  - [ ] **The rebadge half.** `gear_sellers` says "one product, two shops". It does **not** merge
    two rows that are one product, which is what the pairs below are, and the ISA split is still
    live for them — the failure is on the site now, and co-listings did not touch it.
  - [ ] **Adding or removing a co-listing is an operator edit to a seed**, never an API call:
    creating one is a claim about somebody else's product.

  **The data already carries the problem**, from before anyone tried to. Nine product names were
  held by two brands each, and at least four pairs are plainly one product twice:
  **EQB / Spider `Bandit SH` and `Bandit SL`** (`weblocks.json` 13+14, 15+16; merged into 13 and
  15 with Spider as seller on 2026-10-07, without a redirect),
  **Landcruising / Aki `Unicorn` and `White Magic`** (`webbings.json` 6+209, 7+210; merged into
  6 and 7 with Aki as seller on 2026-10-05, without a redirect), Slacklife BC's `HighTech`
  (`webbings.json` 137, a mistaken duplicate of the `Lion Line` #144; deleted 2026-10-08, without a
  redirect),
  **Slack.fr / Slack Pro! `Neon Light`** (`webbings.json` 100+154; merged into 100 with Slack Pro!
  as seller on 2026-10-08, without a redirect — the Slack.fr specs were kept, so 154's 33 kN /
  3.8 % @ 10 kN readings are gone), and **Landcruising `Core 2 HS` / Raed
  `TWTMNBN (The Webbing That Must Not Be Named)`** (`webbings.json` 1+263 — Raed's 2019 end-of-stock
  resale under the old slackshop.de nickname, added 2026-10-01; its description links to row 1 via
  the `[text](/path)` internal-link syntax in `utils/description.ts` as a stopgap until merged). The Bandit pair showed what that costs: the ISA
  pushpin warning is matched to weblocks **12, 13, 15 — all EQB** — so the Spider-badged 14 and 16
  were the same hardware displayed with a clean record, until the merge. (The specific Slack Inov ↔ Spider overlap is *not* visible
  in the seeds — our SlackDB-era snapshot predates the arrangement — so this one needs sourcing
  before it can be modelled.)

  **Separate the two things it could mean before designing anything.** "Made by X, also sold by Y"
  is a list of seller names on one product row (built) — the further payoff being a price, currency
  and product URL per seller, which is real value we do not offer today. "Sold by X and Y under different names" is
  a rebadge, where the second row should arguably not exist at all and needs merging with a
  redirect, since ids are already recorded in ISA match blocks and bookmarked links (§ Loader
  pattern). The Bandit pair is the second kind; the Slack Inov range is the first. A join table that
  tries to be both will be neither.

  Consequences to think through either way:

  - **Who may edit it.** Nobody but an operator, today: `gear_sellers` is excluded from every write
    path, and there is no per-seller field for a seller to correct. The maker/seller distinction the
    catalogue can *prove* (rather than `BrandPermission`, which is per-credential and cannot vary
    per product) is the right basis for that if it ever comes back.
  - **Counts and dedup.** Manufacturer-page inventory counts, listing totals and compare all assume
    one row is one product. Compare showing the same object twice under two brands is the visible
    failure.
  - **Corrections and warnings must not split.** A submission fixing the EQB Bandit, or an ISA
    recall landing on it, has to reach the Spider one. That is the same `(gear_type, gear_id)` link
    the batch entry above has to widen.
  - **Do not confuse this with one company behind several brand names.** Slack.fr, Slack Inov and
    Easy Slackline are already known to be one operation with three brands — see `KNOWN_SHARED` in
    [tests/test_manufacturer_emails.py](tests/test_manufacturer_emails.py). That is a fact about
    brands; this entry is a fact about products.

  Design this together with the batch entry above. Both hang a second dimension off a gear row that
  currently claims to be one indivisible thing, and solving either one alone very likely means
  rewriting it to fit the other.

- **Manuals we know exist but do not hold.**
  - ~~**Raed's webbing manual.**~~ Held now (vers. 2.4 / 2024-12), fetched by hand: their
    Cloudflare answers this network 429 for every automated request, browser headers included, so
    anything further from raed-slacklines.com has to be downloaded in a real browser. Their
    highline leash-system manual came in the same way and sits on the **Halo** leash ring, the one
    product of the three it documents (HALO ring / PRO leash / ALPINE leash) that we carry.
  - **A dead link on the maker's own site**: Bera's `certificados/anel_linelock.pdf` 404s as of
    2026-09-09. Slacktivity's redTube manual did too — the manuals index still points at
    `Manual_EN_HighlineWebbing_redTube-A_V1.pdf`, which is gone; the B revision was fetched by hand
    and is what we hold. The rigging recommendation their page also carries is **not** a manual for
    the webbing and is deliberately not shown under a heading that says "Manuals & documents".
  - **Documents whose product we do not carry**, found while crawling and worth revisiting if those
    gear types ever land: Spider/Slack Inov's manuals for the Slackimoufle, Infinity, Spacer, EVO,
    Radix and their bungee and leash (bungees and leashes are unseeded types), and Slacktivity's
    TreeSling and softRelease.
  - **German-only manuals are held, titled as such** — Slacktivity's Super Jumpline and
    Slackliner.de's ratchet-set manual (range-wide: all three of their starter kits are single
    ratchet, and the document names no product). The **German** duplicates of documents we already
    hold in English were not taken, nor were Slacktivity's DE-only pinkTube B and C sheets, which
    describe webbing variants the catalogue holds as one `pinkTube`.
  - **Balance Community links most manuals client-side**, so crawling their HTML found three of the
    five we hold; the rest were confirmed by verified URL. A future sweep of that catalogue needs a
    real browser, not curl.

## Infrastructure / deploy

Carried over from LAUNCH_RUNBOOK.md and PHASE4_SHIP_PLAN.md when both were removed (2026-10-04).

- [ ] **Serverless Framework v3 → v4, and who runs deploys.** Pinned to v3 so launch did not wait
  on deciding who owns a Serverless account; v3 is EOL and gets no security updates. The same
  answer decides both: whether we deploy into the ISA's account or they deploy from this config,
  and whose account the Serverless org lives under (it should be ISA-owned, not personal).
  Migration itself is a version bump and one env var — infra/README.md § Serverless Framework
  version + account.
- [ ] **Budget alarm.** Needs an ISA admin: `budgets:*` and `ce:*` are denied to our permission
  set. Suggested: a $20/month `COST` budget named `slackdata`.
- [ ] **Delete the orphaned Cognito pool `eu-central-1_kIHciXdAG`** — left over from the failed
  2026-08-25 deploy (the stack-managed admin pool is `eu-central-1_Fzl6ssZOQ`). Check first whether
  it is already gone.
- [ ] **ISA sign-off on the manufacturer onboarding policy** (infra/README.md § Onboarding policy)
  from whoever holds the ISA's slackdata mailbox. Three brands have been onboarded under it since
  2026-08-28; check whether this was given and record it.
- [ ] **No Cypress coverage of the triage UI's manufacturer path**: batch grouping, the manufacturer
  badge, the SKU and rejecting an already-approved row. The grouping logic is unit-tested only.

## Frontend / UX

- [ ] **Universal search (considered, deferred).** Search is per gear type: the box on the webbings
  page searches webbings. Someone who knows a product name but not its category — which is most
  people who arrive from outside — has to guess the tab first. Two shapes were weighed: one search
  box in `TopNav` searching all eight types with a grouped results surface, or the same box with an
  Amazon-style category selector fused to its left, defaulting to the category being browsed.

  Deferred rather than dropped. The immediate complaint behind it was that the listing toolbar was
  overloaded and the search box was being squeezed to ~130px, and that is fixed (§ Shipped) without
  moving search anywhere. Doing it properly needs a cross-type search surface — a results page that
  can rank a webbing against a weblock, which we have no relevance model for — and that is a feature,
  not a layout change. Revisit once there is a homepage/dashboard to hang it off (PLAN.md).

## ✅ Shipped (kept here briefly so the entries above don't get re-opened)

- **Back goes where you actually were.** Three parts of one complaint, all fixed.

  - **The back link on a detail page was `/${slug}`** — the gear type's bare listing, whoever sent
    you. Open a webbing from Balance Community's page and it said "← Webbings" and meant it; open
    one from a filtered listing and the filters were gone. Links into a detail page now carry the
    page they were clicked on in `location.state` (`utils/origin.ts`, `context/OriginContext.tsx`),
    so the link reads "← Balance Community" or "← Compare Webbings" and returns there, filters and
    sort intact. `components/layout/BackLink.tsx` is a real `<Link>` with a real href — middle-click
    and copy-link work — but a plain left click prefers `history.back()` when we know we arrived by
    PUSH, so the scroll offset `useScrollRestoration` keeps is not thrown away by re-pushing the URL.
    An origin out of history state is validated before it becomes an href
    (`tests/unit/origin.test.ts`): a protocol-relative path is not a same-site path.
  - **Two filters were not in the URL and so silently reverted**, which is the "Local listing state
    does not survive Back" entry this replaces. The webbing stretch widget (`?kn=`, `?stretch_min=`,
    `?stretch_max=`) and the ALL/CURRENT/HISTORIC status scope (`?status=`) were `useState` in
    `GearListingPage`; both are query params now, so Back restores them, they are deep-linkable, and
    the two clears drop them along with the rest of the query string rather than resetting them by
    hand. `navigation.cy.ts` covers both, plus every back-link route above.
  - **The compare selection went the same way, and then came back.** It was `?compare=3,1,9` in
    selection order, for a good reason: the detour that emptied the bar was opening one of the picks
    to check a number. The cost turned out to be about a second per tick. A param write goes through
    `useSearchParams`, and every memo on the listing keyed off `url.params` recomputes with it — both
    `applyFilters` passes, the sort, and the table view's column set — so one checkbox re-ran the
    whole listing pipeline and re-rendered 12,000 table cells. It is component state again.
    `?compare=` is still READ on mount, so a link carrying one opens with the bar filled and
    `utils/compare.ts` → `parseIdList` stays shared with the compare page's `?ids=`
    (`tests/unit/compareIds.test.ts`); nothing writes it. Both clears still keep it and it still
    clears on a gear-type switch — the latter needs an effect now that the nav's empty query string
    isn't doing it for free. `url_state.cy.ts` asserts the URL does not change while you pick, which
    is the guard against this regressing.

    Surviving the detour is still worth having. The way to get it is somewhere that is not a render
    input — the entry's `history.state`, or a context above the listing — not by paying for it on
    every click.

- **Table view — the listing's third mode.** `?view=table`, a peer of Cards and Detailed, built to
  the spec that was in this section: columns are the FULL spec set from `config/specRows.ts` in its
  declared order (which is the relevance order — the file now says so, because a column's position
  is the only thing that decides whether anyone scrolls to it), minus the ones no item populates;
  header clicks write the same single-field `?sort=` the dropdown writes; one frozen identity column;
  a compare checkbox per row; and the whole row a real link through to the item, as the whole card is
  — one anchor filling each cell, since a `<tr>` cannot host the card's stretched overlay and a bare
  click handler gives no context menu, no new-tab and no middle click. Headers carry the label alone — the unit is already on every line.
  The identity header carries two sorts, `Name · Manufacturer`, since the cell stacks both — which
  needed an alphabetical branch in `sortItems`, as the numeric path Number()s every brand to NaN and
  would have left the rows in name order under a header claiming otherwise.
  **Webbing stretch is one column per kN**, expanded in place where specRows puts the curve: a
  series in one cell can be read but not ranked, and ranking the catalogue at a given load is the
  question the mode exists for. The columns are headed by the load alone under one spanning
  `STRETCH @ KN` heading, and the block's ceiling follows the FILTER rather than the catalogue —
  only 29 of 230 curves pass 20 kN, so an unfiltered block is empty at the top. Readings recorded off-integer (14
  of 230 curves) round into the nearest column; an exact reading always beats a rounded one; display
  and sort share the one accessor so the column can't rank on a number it didn't print. The
  sidebar's kN pills stay exact-match — a pill saying 10 kN must mean measured at 10 kN. Below `lg` the button is absent and a deep-linked `?view=table` renders
  Cards without rewriting the URL. DESIGN.md § Table View, `table.cy.ts` (42 tests), and
  `tests/unit/table.test.ts` for the column/sort-state arithmetic.

  Three things worth knowing, none of them in the plan above:

  - **The listing mode moved into the URL** — for all three modes, not just the table. It was
    `useState`, so it could not be shared and did not survive Back — the first of the fields the
    Back entry below moved into the URL.
  - **The sticky header forces an inner scroll region.** A wrapper that scrolls only horizontally
    becomes the sticky containing block, so a header pinned inside it scrolls away with the page —
    `overflow-x: auto` cannot be paired with `overflow-y: visible`, the spec computes that to `auto`.
    So the table scrolls in both axes inside a `max-h` region under the nav.
  - **Two rapid header clicks did not flip the direction**, because `sort` arrives through
    `useSearchParams` and lags a render: the second click read the pre-click sort and re-applied
    ascending. Fixed with a local `pendingSort` held until the echo lands — the same trap
    `SortDropdown` documents for its stretch row. `table.cy.ts` caught it.

  **Not done, and deliberately:** multi-column sort (the moment `?sort=` is a list, the dropdown
  can't represent it), and any table at all below `lg`.

  Adding it also **repacked `cypress/shards.json`**: every shard was already ~6:00, so a 2:00 spec
  had nowhere to land without making one runner 7:51.

- **Listing toolbar: fixed-size search, and the accuracy note moved out.** The search input was
  `min-w-0 flex-1 max-w-64` — sized from whatever the flex-wrap row had left over, which made it a
  residue of everything else on the row rather than a control with a size. At ~1200px it resolved to
  about 130px, too narrow to show the word "Search" in its own placeholder. It is now `w-64
  shrink-0`. Two things left the row to make that fit: the inline "Community-sourced — may be
  incomplete." note (it is a standing notice and the footer already carries it on every page —
  SAFETY_AND_ACCURACY.md §B1 was updated, and `safety_notices.cy.ts` now asserts its ABSENCE from the
  toolbar so it is not quietly reinstated), and "Missing something?", which moved into the
  right-hand group beside the view toggle and Sort.

- **Card content no longer paints over the sticky filter bar.** Reported as a Firefox-on-Mac bug at
  narrow widths; it reproduces in Chromium too, ~2000 times in a single scroll sweep. Width was only
  the trigger — `MobileFilterBar` mounts below `lg`, so the bug can only appear there. The cause was
  a z-index tie: `GearCard`'s root was `relative` with **no** z-index, so it opened no stacking
  context and its `relative z-10` title link and action buttons landed in the ROOT stacking context,
  tying with the bar's own `z-10` and winning on DOM order because the cards come after it. Fixed
  with `isolate` on the card — not by giving the bar a bigger number, which would only move the
  collision. `mobile.cy.ts` guards it with `elementFromPoint` across a sweep of scroll offsets,
  because overlap is the question "what is painted here?" and rectangles cannot answer it.

- **"Sort by Sort by".** `labelFor()` returned the literal string `'Sort by'` when no sort was set,
  and both triggers print their own eyebrow above it — so the desktop button read "Sort by Sort by"
  and the mobile one "Sort Sort by". No sort is not "unsorted": `sortItems()` falls through to
  alphabetical, so the default now labels itself **Name: A→Z**, which is what it actually does.

- **Scroll restoration on back/forward.** Every navigation used to land at the top, so opening the
  180th webbing and pressing Back dropped you at webbing #1. `hooks/useScrollRestoration.ts`, mounted
  once on `AppLayout`. It is a hook rather than react-router's `<ScrollRestoration>` because that
  component requires a data router and `main.tsx` mounts a plain `<BrowserRouter>` — adopting
  `createBrowserRouter` to get it would rewrite App.tsx's route table for one behaviour. Three things
  make it work rather than nearly work: `history.scrollRestoration = 'manual'` (the browser's own
  runs before React has rendered the list and clamps to 0 against a page one spinner tall); keyed by
  `location.key` rather than pathname (two visits to /webbings with different filters are different
  entries and must not inherit each other's offset); and re-applied every animation frame until the
  offset sticks or a 1.5s budget runs out, because the listing is still fetching and still growing at
  restore time. PUSH/REPLACE still go to the top. Filters, sort and search come back on their own —
  they live in the query string — with two exceptions recorded above.

- **Compare draws the stretch curve, and holds ten items** (#76). Four columns of
  "5.9% @ 10 kN · 7.1% @ 15 kN · …" is the reading compare exists to spare you, so on compare
  webbing stretch leaves the table and becomes a multi-series line chart — load across, elongation
  up, one line per column in the column's own colour — suppressed back to a table row when there
  are fewer than two curves to plot. Inline SVG built here (`utils/chart.ts` +
  `components/charts/LineChart.tsx`), not a charting dependency: the arithmetic that decides whether
  it is readable (nice-numbered ticks, a domain that ignores one outlying curve, the eight-series
  cap) is unit-testable in a way a picture is not — `chart.test.ts`. **`COMPARE_MAX` went 4 → 10**;
  the chart is the binding constraint, so it plots the first eight curves and names the rest.
  DESIGN.md § Stretch is a chart, not a table. Landing it on main also fixed a **range-domain race**
  that reddened the spec: the slider domain and the drawn domain were computed from two different
  snapshots of the fetch.

- **Manuals & documents on the detail page.** Manufacturers publish PDFs about their gear and we now
  hold **42** of them — 36 filed against a product, 6 filed against a brand — shown as their own card
  below the spec sheet, first document embedded inline with an "Open ↗" fallback that *is* the
  feature on mobile. Stored exactly like images: a curated folder tree under
  `frontend/public/gear-manuals/` plus a manifest generated by `scripts/build_gear_manifest.py`
  (`--check` fails on drift), with the document's title carried in the filename and a non-English
  document saying so in its own title. **Range-wide manuals are filed once under the brand**
  (`brandManuals.json`) — BC, Spider/Slack Inov, Bera and Raed each publish one webbing manual for
  everything they make, and copying it onto forty product keys is forty chances to leave one on the
  old version. Absent, not empty, when we hold nothing. DESIGN.md § Manuals & documents. What we
  know exists and still do not hold is recorded under Backend / data above.

- **Catalogue data: two manufacturers, six webbings, the YogaSlackers range** (#78). Wall Ace
  (`catalog_id` 98, AU) and Sterling Rope (99, US) — Sterling the first entry here that is not
  slackline-oriented — plus webbings 253–258 (Wall Ace Steel Cable, BC Spider Silk MK1, Landcruising
  Aeon, Sterling Type 9800, Slacktivity 2FACES, Slackstar Line Long Way), starterkits 65/66 and
  treepro 26 for YogaSlackers. Each row is transcribed from the maker's own page or the only capture
  of it, with the provenance in `notes`: a stated percentage with no load is **not** recorded as a
  stretch point, an unstated breaking strength stays null rather than being inferred, and prices are
  per metre off the longest length's regular price, never a sale price. "Yoga Slackers" became
  **YogaSlackers**, the old spelling kept as an alias so seeds, scraped image filenames and anything
  already recorded still resolve. Corrections to rows already held: webbing 38 gains a price and a
  stretch point, Slack.fr Dark Blue's `priceMeter` drops 1.96 → 1.45 (1.96 was the 25 m tier),
  weblock 95 becomes "Slackibloc Jump", starterkits 25/26 lose their scraper-shouted names.

- **The e2e job went from ~37 minutes to ~7, without dropping a test** (#77). Cypress runs sharded
  across six runners packed by measured spec duration from `frontend/cypress/shards.json`. The cost
  is a manifest that has to be kept in step with the spec directory — a spec absent from it silently
  never runs — so `npm run shards` verifies every spec is in exactly one shard, and is run by
  `test:unit` and by CI before the matrix is built.

- **Slacklife BC `HighTech` #137 deleted — it was the `Lion Line` #144** (2026-10-08). SlackDB held
  Slacklife BC's Lion Line twice: once by name, once under its page subtitle ("Lion Line – Hightech
  Webbing"), with different figures (48 g/m, 39.2 kN, 4.6% @ 10 kN). Confirmed with the Mayor of
  Squamish. #137 is gone, not merged — its figures were discarded — and #144 now carries the specs
  from Slacklife BC's own 2017 page (Wayback): 35.6 kN MBS, 7.12 kN WLL, 35 g/m, 8.99 CAD/m, red and
  white, with that page's description; its stated stretch ("1-4%", no load) is in `notes` only. Id
  137 is not reused and `/webbings/137` now 404s. The SlackDB capture in `slackdb_archive/` is
  left as captured.

- **SlackX and Radrigs merged into one brand, `SlackX (formerly RadRigs)`** (2026-10-07). SlackX
  continues the RadRigs line, so it is the maker of the `Orange` and the `Slackfriend`, not a seller
  of them. One `manufacturers.json` entry now (Radrigs' `catalog_id` 45, so `/brand/45` and the
  weblock rows are unchanged; 97 is retired), with SlackX's site, Instagram and address; `Radrigs`,
  `RadRigs` and `SlackX` alias to it in `brand_aliases.py`, the same way `Slack Pro!` reaches
  lineGrip. The two `gear_sellers: ["SlackX"]` entries are gone (a maker cannot sell its own gear),
  the ISA Orange match names the new brand, and image keys stay `radrigs_*`. That closes the
  "0 items" case below for SlackX.

- **SlackX onboarded as a seller-only manufacturer** (2026-09-02). `local_slackx`, `catalog_id` 97,
  `info@slackx.eu`, named through `gear_sellers` as the seller of both Radrigs weblocks — the
  `Orange` and the `Slackfriend`. It continues the Radrigs line and makes nothing else we hold, so
  the recorded blocker (nowhere to put the address, since `load_manufacturers.py` only enriches rows
  a gear seed already created) was closed by letting `load_seller_brands.py` create a seller-only
  brand from its `catalog_id`, ahead of the enrichment pass. Two consequences are still open and
  tracked where they belong: SlackX reads **0 items** on the directory (co-listings, § B) and
  **SlackX Orange** is still an unmatched ISA approval (§ Auto-sync ISA certification).

- **Co-listings — one product, several sellers** (#75). `gear_sellers`, a JSON column of seller brand
  NAMES on every gear model, written in each gear seed beside the item it belongs to and resolved at
  load time by `load_data/load_seller_brands.py` — which also creates a *seller-only* brand from its
  `catalog_id`, the one place a `Brand` is born outside a gear loader. **64 co-listings** load with
  zero drops: SlackX → Radrigs `Orange`/`Slackfriend`, and the 62 Slack Inov ↔ Spider listings across
  all eight gear types. It replaced a `GearSeller` side table of `(gear_type, gear_id, …)`
  cross-references, which would have been a second file of hand-typed ids to keep in step with the
  seeds for data that is one name per listing. On the frontend the sellers arrive with the item —
  [utils/sellers.ts](frontend/src/utils/sellers.ts) is one function over one field — feeding the
  sidebar's **Brand** filter (which matches an item's maker *plus* every brand co-listing it,
  [config/brandGroup.ts](frontend/src/config/brandGroup.ts)) and **"Also sold by"** on the detail page
  ([AlsoSoldBy.tsx](frontend/src/components/gear/AlsoSoldBy.tsx)), a name per row because a name is
  all we hold. `co_listings.cy.ts` and `brand_filter.cy.ts` cover both, sharded and green in CI.
  Nobody may edit it through an API — `gear_sellers` is in `_EXCLUDED` in `submissions/fields.py` —
  and deploy needed nothing: the sellers ride in the root `*.json` the Lambda image already bakes.
  CLAUDE.md § Co-listings. **What is still open is above**: per-seller prices/URLs, who actually
  makes what, inventory counts that read a seller as 0 items, and the rebadge half.
