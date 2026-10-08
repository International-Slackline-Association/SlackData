# SlackDB archive

A full snapshot of [slackdb.com](https://slackdb.com), the community slackline-gear
database that SlackData replaces, taken on **2026-10-04/05** shortly before the site was shut
down. It holds everything the site served publicly: every record from every API endpoint,
the reviews and comments that only appeared on the detail pages, the homepage stats and
activity feed, and every uploaded photo and manufacturer logo.

It is a **reference, not a seed**. Nothing in the app reads it. For what we already
imported from SlackDB, and what was deliberately left out, see [`../slackdb.md`](../slackdb.md).

## What is where

Start with the CSVs to browse, and the JSON when you need everything a record held.

| Path | What it holds | Count |
|------|---------------|------:|
| `gear/<type>.csv` | One row per item, codes decoded, units in the headers | 533 |
| `gear/<type>.json` | Full records: specs, pricing tiers, **reviews**, comments, contributors | 533 |
| `manufacturers.csv` / `.json` | Location, year founded, status, links, gear counts, reviews, Facebook rating | 74 |
| `reviews.csv` / `.json` | Every review on gear **and** manufacturers, flattened: ratings per criterion, pros, cons, text | 48 |
| `comments.json` | Every comment, with replies nested: one real (on an image), one spam | 2 |
| `images.json` | Photo metadata: which gear, scope, source, condition, tags, gear-tag boxes | 632 |
| `image_files/gear/<id>.jpg` | Every photo, original upload size | 632 |
| `image_files/manufacturers/` | Manufacturer logos | 67 |
| `image_files/site/` | The site's own graphics: favicons, logo, gear-type and section icons, map markers, rating stars, badges (country flags were left out) | 47 |
| `communities.csv` / `.json` | Slackline groups, teams and associations worldwide, with map coordinates | 562 |
| `knowledge.csv` / `.json` | Curated articles and videos, tagged to gear | 386 |
| `knowledge_sites.json` | The sites those entries come from | 27 |
| `site_stats.json` | The homepage counters | — |
| `activity_feed.json` | The homepage "latest activity" feed, as it stood | 30 |
| `edit_suggestions.json` | SlackDB's auto-generated "this field is missing" to-do list | 703 |
| `reference/` | Dictionaries (every code → its label), field/type definitions, countries, currency rates, the site-wide pros/cons vocabulary | — |
| `raw/` | Exactly what was captured, before any processing (see below) | — |
| `fetch.py`, `build.py` | The scripts that produced all of the above | — |

### Gear types

SlackDB had eleven gear categories, three of which SlackData does not model.

| File | SlackDB `itemTypeId` | Items | In SlackData as |
|------|----------------------|------:|-----------------|
| `webbings` | `WEB` | 204 | `webbings.json` |
| `weblocks` | `WLCK` | 109 | `weblocks.json` |
| `starter_kits` | `SKT` | 64 | `starterkits.json` |
| `leash_rings` | `LRNG` | 31 | `leashrings.json` |
| `connectors` | `CON` | 28 | — |
| `rope_brakes` | `BRK` | 24 | — |
| `tree_protectors` | `TRP` | 24 | `treepros.json` |
| `general` | `GEN` | 15 | — |
| `line_sliders` | `SLD` | 13 | `rollers.json` |
| `webbing_grips` | `WGP` | 12 | `grips.json` |
| `trickline_kits` | `TLK` | 9 | `tricklinekits.json` |

## Reading the files

**JSON keeps SlackDB's own shape.** Field names and codes are exactly as the site stored them
(`material: ["PL"]`, `productionStatus: "DC"`). Keys starting with `_` were **added by
`build.py`** for convenience, and are never SlackDB's:

| Added key | On | Meaning |
|-----------|----|---------|
| `_manufacturerName` | gear, knowledge sites | The name behind `manufacturerId` |
| `_slackdbUrl` | gear, manufacturers | The record's page on the (now dead) site |
| `_imageIds` | gear | Every photo tagged with this item |
| `_coverImageId`, `_coverFile` | gear | The photo the site showed as the item's thumbnail (see below) |
| `_logoFile` | manufacturers | Local path of the logo |
| `_file`, `_originalUrl`, `_gearNames` | images | Local path, original URL, names of the gear in the photo |
| `_siteName`, `_gearNames` | knowledge | Names behind `siteId` / `gearId` |

**CSVs are the decoded, human view.** Codes are replaced by their labels
(`PL` → Polyester, `DC` → Discontinued), units go in the column header (`MBS (kN)`,
`Weight (grams)`), dates are ISO, and multi-value cells are joined with `; `.

**Text is HTML-unescaped.** The site stored `Can&#x27;t` for `Can't`. The top-level files
unescape it; `raw/` keeps it as served.

### Units and codes worth knowing

- **Webbing `weight` is per metre** (`Weight per meter`), and webbing pricing is **per metre**.
  Other gear is priced per unit.
- **Elongation** is a single point: `{"percent": 7, "force": 10}` means 7% stretch at 10 kN.
- **Pricing** is `{"currency": "EUR", "lst": [{"q": 25, "qt": "EX", "price": 1.19}]}`.
  `qt` is `AA` ("and above") or `EX` ("exactly") for quantity `q`, so a multi-row list is a
  price-per-length table. In the CSV, `43 EUR` is a single price; `1.19 (×25); 1.1 (×100) EUR`
  is one price per listed quantity.
- **Ratings** are out of 10. All gear is rated on value for money, quality, versatility and
  ease of use; webbing and tree protectors add softness, weblocks and grips add pre-tension. Manufacturers are rated on ordering, shipping, product
  quality and customer service. `reference/dictionaries.json` → `RTD` has every criterion.
- **Every code** used anywhere is in `reference/dictionaries.json`, keyed by the
  `dictionaryId` that `reference/item_types_def.json` gives each field. `flags` has no field
  definition; its codes are in the per-type flag dictionaries (`WBF`, `WLFLG`, `LRF`, `SLF`).

### Cover images

The site never stored which photo was an item's thumbnail: it served the bytes at
`/api/gear/image_thumb/<gearId>`. Those bytes are identical to one photo's own thumbnail, so
`fetch.py` recovered the mapping exactly, by hash, into `raw/gear_covers.json`. `null` means
the site showed its "no image" placeholder (121 items, 7 of them despite having photos).

A few photos were uploaded twice, so two image ids share one thumbnail. Where that happens,
the cover is the twin tagged with that item.

## Known quirks in the source

These are faithful to SlackDB, not archive errors:

- **Banana** (weblock, gear id 526) has one review, but SlackDB's `reviewsCount` says 0, so
  the review total here is 48 against the counters' 47. The review is real: its rating is
  counted in the item's own average.
- The gear detail records omit `reviewsCount`/`commentsCount`, so `build.py` takes those from
  the list record.
- Manufacturer detail records list `contributors` as bare ids; the list endpoint has names,
  so the top-level files use those.
- `reviews` bodies are under `txt` on some reviews and `text` on others. `reviews.json`
  normalises them to `text`; `raw/` does not.
- The one manufacturer comment (on Slackliner.de) is link spam, kept because it is what the
  site held.
- The `GR` item type in `edit_suggestions.json` means gear (`ITT` dictionary).
- **People are named by Facebook account.** SlackDB's only login was Facebook, so
  `creatorId` and contributor `id`s are Facebook user ids, beside the person's display name.

## `raw/` — the capture itself

| Path | Source |
|------|--------|
| `raw/api/*.json` | Every read endpoint, byte-for-byte: `/api/gear`, `/api/gear_basic`, `/api/manufacturers`, `/api/communities`, `/api/knowledge`, `/api/knowledge_sites`, `/api/images`, `/api/edit_suggestions`, `/api/countries`, `/api/item_types_def`, `/api/dictionaries` and its five `/api/dictionaries/<scope>` variants |
| `raw/gear_details/<id>.json` | The JSON embedded in `/gear_details/<slug>`: the full record with reviews and comments, plus the site's "similar gear" list |
| `raw/manufacturer_details/<id>.json` | The JSON embedded in `/manufacturer_details/<slug>` |
| `raw/images/<id>.json` | `/api/images/<id>`, which adds the gear-tag boxes and comments to the list record |
| `raw/pages/` | JSON embedded in pages and served by no endpoint: `overviewData` (homepage stats + activity feed), `currencyRates`, `reviewsProsCons`, `itemTypeNames` |
| `raw/gear_covers.json` | gear id → cover image id (see above) |
| `raw/site_assets.json` | Every `/img/` path tried for `image_files/site/`, and whether the site had it. Type icons are built from templates in the site's code, so every type was tried; the 17 "not on the site" are those guesses, not gaps |

The detail pages also embedded site-wide config (type definitions, dictionaries), repeated
on every page. `fetch.py` checked every copy was identical to the API's own before dropping it,
so nothing was lost. The pages' lookup subsets of the list endpoints (`gearBasic`,
`manufacturers`, `images`) were dropped the same way.

## Rebuilding

```bash
python3 build.py          # raw/ → every top-level file; deterministic, no network
```

`fetch.py` needs the live site, so it can no longer be re-run. It is kept as the record of
how each file was obtained.
