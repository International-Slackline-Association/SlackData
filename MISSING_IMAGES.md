# Gear without images

Every catalogue item that has no photo in `frontend/public/gear-images/`, worked out from the files
on disk with the manifest's own keying (`scripts/build_gear_manifest.py`): an item is listed when its
`<brand-abbrev>_<name-slug>` key matches no image file. Generated 2026-10-08.

**23 items**: 13 webbings, 6 weblocks, 3 leash rings, 1 trickline kit. Grips, rollers, tree
protectors and starter kits are fully covered. 22 of the 23 are historic (`active: false`). None of
them had a photo on SlackDB either (checked against `slackdb_archive/`).

Kits are listed but were searched last.

**Status:** every item has been searched, and the **23** left turned up nothing usable. Items whose
candidates were approved and filed into `public/gear-images/` have been taken off the list (most
recently Pump's Rivera and Xylon, from photos the user supplied, Club S, Neon Light, Skillshot LS, LINK, Mint, SladLock Power, ZERO Black, and the Rigging
Ventures Level 2 and Level 3 kits, and Sat'Elite).

**Dakas:** every image the Wayback Machine holds for `dakas.fr` and its subdomains was listed and
checked: 139 files. Most are site graphics, blog-post art, third-party accessories (shackles,
carabiners, quicklinks) and 2018 shoe spam from after the domain lapsed. The only ones showing Dakas
webbing are two 2016–2017 homepage-slider banners: the red/white one, which is the Sat'Elite (filed as its first photo), and
teal webbing printed "DAKAS SLACKLINE" that matches no Dakas item we hold. No product photo of the
Slack Swan, the Banana or either steel ring survives.

## How candidates were found

1. **Wayback Machine, image files**: each brand's base domain (and any shop subdomain, e.g.
   `laboutique.slack.fr`), searched for a fragment of the product name (e.g. `slack.fr/*` + `neon`),
   keeping image files only. Done with the CDX API, which runs the same search as the Wayback's URL
   box: `url=<domain>/*`, `filter=original:(?i).*<term>.*`, `filter=mimetype:image/.*`.
2. **Wayback Machine, archived pages**: the same search for HTML pages, then each page's
   `<img>`, `og:image` and lightbox links, to catch photos stored under generic names
   (`/media/catalog/product/…/img_0188_1.jpg`, `/366-thickbox_default/…`). A photo a page links to
   is only usable if the Archive saved the file itself; most were not, which is what most "none
   found" rows mean.
3. **Old shop CDNs that still serve files**: photos from dead Shopify shops are often still on
   `cdn.shopify.com`, and Wix photos on `static.wixstatic.com` (Pure Slacklines, slack.fr's 2011
   shop, Rigging Ventures).
4. **Live sites and web search** for the brands still trading, and for brands with no known site.
5. **Facebook**: not searchable without a login, so not done (it matters most for Pump Slackline,
   whose only web presence is a Facebook page; its Rivera and Xylon photos came from the user).
6. **Chocoslack** (`chocoslack.com`, a French slackline news and gear-review blog, 2014–2015):
   all 369 archived pages, French and English, searched for every item still on this list. None is
   named in any post. Its one useful find is a ring comparison table (the March 2015 leash-fall
   post, `anneaux-bis.jpg` / `anneaux-EN.jpg`) with a row each for the Line Spirit and both Dakas
   steel rings, but only the 266×300 and 212×300 thumbnails were archived, where each ring is a
   few pixels across. Not usable as a photo.

Candidates are **not** filed into `public/gear-images/`. Anything downloaded sits in
`image_candidates/<type>/` for review, named with the item's image key and numbered in the
suggested photo order (official photos first), and is filed by moving it into
`public/gear-images/<type>/` and running `python3 scripts/build_gear_manifest.py`.

In the **Candidates** column, "none found" means searched with no usable result; the note says how
far the trail went.

## The list

### webbings (13)

| id | Brand | Name | Active | Image key | Candidates |
|---|---|---|---|---|---|
| 34 | Equilibrium | Flash | historic | `eqb_flash` | none found. Product pages archived (eqb.cz `flash.html`, slackshop.cz `162-eqb-flash`) but none of their photos were, and slackshop.cz no longer serves them. |
| 79 | Equilibrium Slacklines (EQB) | Nitro | historic | `eqb_nitro` | none found. Product pages archived (eqb.cz `nitro.html`, slackshop.cz `172-eqb-nitro`, a 2011 set page) but none of their photos were, and slackshop.cz no longer serves them. |
| 85 | Line Spirit | Fuji | historic | `linespirit_fuji` | none found. The product page (`66-fuji.html`, 2015) was archived but none of its photos were. |
| 89 | Line Spirit | Vercors | historic | `linespirit_vercors` | none found. Seven product pages were archived (2013–2015) but none of their photos were. |
| 92 | Dakas | Red Zebra | historic | `dakas_red-zebra` | none found. Four dakas.fr product pages were archived (25/50/100 m, 2015–2017) but none of their photos were. (The red/white homepage banner first offered here turned out to be the Sat'Elite and is filed there.) |
| 93 | Dakas | Slack Swan | historic | `dakas_slack-swan` | none found. Three dakas.fr product pages were archived (2015) but none of their photos were. Every image the Archive holds for dakas.fr was checked (139; see the Dakas note below). |
| 94 | Slack Inov | Flamme II | historic | `slackinov_flamme-ii` | none found. Its slack-inov.com page (`46-sangle-flamme` / `46-flamme2-webbing`, 2016) was archived, but its own photos (`123-*`) were not. The one archived `sangle-flamme.jpg` is the Flamme III. |
| 102 | Slack.fr | Supertube Norway | historic | `slackfr_supertube-norway` | none confirmed. laboutique.slack.fr had a 2011 `supertube-50m` page photographed with `norges_1.jpg` ("Norges" = Norway), but neither the Archive nor the Shopify CDN still has it. What survives is the plain Supertube (orange/black/pink, 480×480: `743-tm_home_default/supertube-15m-tubulaire.jpg`, `2383-…`), whose spec graphic says 48 g/m against Norway's 54 g/m, so not saved. |
| 103 | Slack.fr | Jumpline | historic | `slackfr_jumpline` | none found. laboutique.slack.fr had 3 cm Jumpline pages from 2009–2016 (`products/jumpline`, photos `sangle_jumpline.jpg` and `Jumpline_480.jpg`), but neither the Archive nor the Shopify CDN still has those photos. The archived "jumpline" images are the 4 cm, AntiPop and Banger models, and discipline banners. |
| 108 | Elephant | Wing 3.5 | historic | `elephant_wing-3-5` | none found. elephant-slackline.com listed its webbings on one JavaScript-driven products page ("Wing", "blueWing" appear in it), and the only images archived from the site are gallery photos and site graphics. |
| 172 | Slack Mountain | Spice | historic | `slackmtn_spice` | none found. Nothing named "spice"/"épice" on slack-mountain.com, slack-mountain.fr or slackmountain.com in the Wayback; the live shop no longer lists it. |
| 251 | Slack Inov | Donkey 20 | yes | `slackinov_donkey-20` | none found. Every archived "donkey" page and image on slack-inov.com (2019–2023) is the 25 mm Donkey (already photographed). slack-inov.com blocks direct fetches (403), and Spider does not list the Donkey 20. |
| 258 | Slackstar | Line Long Way | historic | `slackstar_line-long-way` | none found. The slackstar.de product page (`Line-Long-Way-SL80240-25-A.htm`, 2013) was archived but its photo (`LineLongway_SL8024025-A.jpg`) was not. slackstar.de now redirects to sicherungsprofi.de, which sells other Slackstar lines but not this one. |

### weblocks (6)

| id | Brand | Name | Active | Image key | Candidates |
|---|---|---|---|---|---|
| 8 | Dakas | Banana | historic | `dakas_banana` | none found. dakas.fr product page `76-banana.html` (2015) was archived but its three photos were not. Every image the Archive holds for dakas.fr was checked (139). |
| 76 | Souz Slackline | Rowan 1.0 Captive Pin Light | historic | `souz_rowan-1-0-captive-pin-light` | none found. Every archived Rowan page on souzslackline.com (2020–2023) is version 3.x or 4.x; nothing for 1.0. |
| 85 | Slacktivity | SeaHorse Sling 1 | historic | `slacktvty_seahorse-sling-1` | none found. Only the standard SeaHorse is archived on slacktivity.com (2017–2026: `seahorse`, `seahorse-dp`); nothing named "Sling". |
| 88 | Slacktivity | SlackDuck | historic | `slacktvty_slackduck` | none found. One archived slacktivity.com page (`slackduck-2p`, 2016) but its photos (`slackduck-2-pins*.jpg`) were not. |
| 89 | Slacktivity | SlackDuck-DP | historic | `slacktvty_slackduck-dp` | none found. One archived slacktivity.com page (`slackduck-2p`, 2016, "2 pins", probably the DP) but its photos were not. |
| 104 | Slackliner.de | Yang | historic | `slackde_yang` | none found. The product page was archived (slackliner.de `Yang.html`, 2016) but its photo `yang.jpg` never was. |

### leashrings (3)

| id | Brand | Name | Active | Image key | Candidates |
|---|---|---|---|---|---|
| 4 | Line Spirit | Forged steel ring | historic | `linespirit_forged-steel-ring` | none found. Line Spirit sold its rings as "Line-Lock"; the steel one ("Line-Lock acier", `125-line-lock-acier.html`, 2016) was archived as a page but its photo was not. Chocoslack's 2015 ring table lists it ("Linespirit", forged steel, 66 kN, 80 mm), but only as a tiny thumbnail. |
| 8 | Dakas | Steel Ring 200kN | historic | `dakas_steel-ring-200kn` | none found. dakas.fr `27-anneaux-acier-200-kn.html` (2015) was archived but its photo was not. Every image the Archive holds for dakas.fr was checked (139). Chocoslack's 2015 ring table has a row for it, but only as a tiny thumbnail. |
| 9 | Dakas | Steel Ring 150kN | historic | `dakas_steel-ring-150kn` | none found. dakas.fr `26-anneaux-acier-150-kn.html` (2015) was archived but its photo was not. Every image the Archive holds for dakas.fr was checked (139). Chocoslack's 2015 ring table has a row for it, but only as a tiny thumbnail. |

### tricklinekits (1)

| id | Brand | Name | Active | Image key | Candidates |
|---|---|---|---|---|---|
| 2 | Rigging Ventures | Level 1 Kit | historic | `rigvent_level-1-kit` | none found. Its page (`level-1-trickline-kit`) was never archived, and riggingventures.com is down. |
