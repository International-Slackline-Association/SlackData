# SlackDB API — reference & how we compare against it

SlackDB (<https://slackdb.com>) is the legacy community gear database this project is
replacing. Its public JSON API is the source we scraped our seed data + images from, and the
yardstick we diff against to find **missing items** and **data mismatches**. This doc explains
the API surface and the exact comparison method, so a future agent can re-run the audit.

## Endpoints

No auth, no API key. Plain `GET`, JSON responses.

| Endpoint | Returns | Notes |
|----------|---------|-------|
| `GET https://slackdb.com/api/gear` | Array of **all** gear items (~533) | Every gear type in one flat list; distinguished by `itemTypeId`. ~310 KB. |
| `GET https://slackdb.com/api/manufacturers` | Array of **all** manufacturers (74) | Maps `manufacturerId` → brand. Matches our root `manufacturers.json` (also 74). |

Other paths (`/api/manufacturer`, `/api/brand`, `/api/gear/{id}`, `/api/manufacturer/{id}`)
return 404 — only the two list endpoints above exist. Fetch with a browser UA to be safe:

```bash
curl -sSL -A "Mozilla/5.0" https://slackdb.com/api/gear          -o slackdb.json
curl -sSL -A "Mozilla/5.0" https://slackdb.com/api/manufacturers -o slackdb_mfr.json
```

## Gear item shape

```jsonc
{
  "_id": 1,
  "slug": "Ribera",
  "itemTypeId": "WEB",        // gear category — see mapping below
  "name": "Ribera",           // display name — the field we match on
  "manufacturerId": 22,       // FK into /api/manufacturers (_id)
  "productionStatus": "DC",   // AC = active, DC = discontinued
  "webbingType": "FL",        // type-specific spec fields vary by itemTypeId
  "material": ["PL"],
  "dWidth": 26, "weight": 80, "mbs": 42,
  "imagesCount": 0,           // how many images SlackDB hosts for this item
  "commentsCount": 0, "reviewsCount": 0,
  "contributors": [ ... ], "creationDate": 1499896266303, "lastEditDate": 1587241694496
}
```

Manufacturer item: `_id`, `slug` (the brand name we key on), `name`, `location`,
`yearEstablished`, `isSlacklineOriented`, `url`, `gearStats`, …

## `itemTypeId` → our gear type

SlackDB has more categories than we model. Mapping to our seed files:

| itemTypeId | SlackDB meaning     | Our seed file        | Modeled? |
|------------|---------------------|----------------------|----------|
| `WEB`      | Webbings            | `webbings.json`      | yes |
| `WLCK`     | Weblocks            | `weblocks.json`      | yes |
| `SKT`      | Starter kits        | `starterkits.json`   | yes |
| `TLK`      | Trickline kits      | `tricklinekits.json` | yes |
| `LRNG`     | Leash rings         | `leashrings.json`    | yes |
| `TRP`      | Tree protectors     | `treepros.json`      | yes |
| `SLD`      | Line sliders        | `rollers.json`       | yes (we call them rollers) |
| `WGP`      | Webbing grips       | `grips.json`         | yes |
| `CON`      | Connectors          | —                    | no (out of scope) |
| `BRK`      | Rope brakes         | —                    | no (out of scope) |
| `GEN`      | General / misc      | —                    | no (out of scope) |

## How to compare (find missing items)

The goal: for each modeled category, find items SlackDB has that our seed JSON lacks. Match on a
**normalized name** (lowercase, strip accents, collapse non-alphanumerics to spaces) because the
two datasets format names differently (`Aero` vs `Aero 1`, `FLY Line` vs `Fly`,
`Mantra MKIII` vs `Mantra MK3`, `Spider Silk MKII` vs `Spider Silk MK2`).

```python
import json, re, unicodedata
def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

sdb = json.load(open("slackdb.json"))
TYPE_MAP = {"WEB":"webbings.json","WLCK":"weblocks.json","SKT":"starterkits.json",
            "TLK":"tricklinekits.json","LRNG":"leashrings.json","TRP":"treepros.json",
            "SLD":"rollers.json","WGP":"grips.json"}
by_type = {}
for x in sdb: by_type.setdefault(x["itemTypeId"], []).append(x)

for tid, seed in TYPE_MAP.items():
    ours = {norm(o.get("name")) for o in json.load(open(seed))}
    missing = [x for x in by_type.get(tid, []) if norm(x["name"]) not in ours]
    print(seed, "missing:", [x["name"] for x in missing])
```

Resolve `manufacturerId` → brand via `slackdb_mfr.json` (`{_id: slug}`) to see who makes a
missing item.

### Caveats — a "missing" hit is one of three things

Normalized-name diffing over-reports. Triage each hit:

1. **Name-format variant we already have** — same product, different spelling (`Sonic 2.0`↔`Sonic 2`,
   `Tender Line`↔`Tender`). Not missing. This is also why our image manifest had orphan keys — see
   the image pipeline below.
2. **Genuinely missing product** — SlackDB has it, we don't, under any spelling. These are real
   gaps to backfill into the seed JSON.
3. **Brand mismatch** — we have the product but attributed to a different manufacturer than SlackDB
   (e.g. ROLLEX: ours says *Spider Slacklines*, SlackDB says *Equilibrium*). Investigate which is
   correct; a brand mismatch also breaks image linkage.

## Cross-check: the image manifest

`frontend/src/data/gearImages.json` is generated by `scripts/build_gear_manifest.py` from the
curated images in `frontend/public/gear-images/`. Its validation step flags **orphan keys** — manifest keys that resolve to no
product (frontend key = `brandAbbrev[brand] + "_" + slugify(name)`). Orphans are a second lens on
the same divergence: an orphan image almost always corresponds to a SlackDB item whose name or
brand doesn't match our seed. Reconcile orphans against SlackDB the same way — the orphan's
brand-abbrev + name tells you which SlackDB item the scraper pulled it from.

## Snapshot (last audited 2026-09-09)

Counts (SlackDB / ours): WEB 204/256 · WLCK 109/130 · SKT 64/66 · LRNG 31/34 · TRP 24/26 ·
SLD 13/22 · WGP 12/20 · TLK 9/10. We exceed SlackDB everywhere, from the other sweeps.

**Nothing further is to be imported from SlackDB.** The full diff was re-run this pass and every
one of its 466 items in a modeled category has been adjudicated: each either matches a row of ours
outright, or appears in the do-not-import table below. A future audit that re-runs the diff will
still see 23 hits — they are all resolved, and the table is the answer.

The only change made this pass was a fix, not an import: five Slack Mountain webbings were seeded
with lower-cased names (`spectre`, `morpheus`, `rubalise`, `wallaby`, `plum`) — a scrape artifact,
since SlackDB itself title-cases all five. They render as the name now, not as the slug.

### 🚫 Do not import — adjudicated

The normalized-name diff reports these 23 as missing. They are not. **Do not re-surface them, and
do not add them to the seeds.** Anything here has already been looked at and rejected.

Most are name-format variants of a row we already hold. The first three are the ones that look
most like real gaps and are not — they were adjudicated as duplicates or incorrect data by the
maintainer, on 2026-09-09, and reverted after being briefly imported.

| SlackDB name | Type | Verdict |
|--------------|------|---------|
| `Rodeo` | webbing | **Duplicate / incorrect.** Do not import. |
| `Abysses` | webbing | **Duplicate / incorrect.** Do not import — SlackDB's specs are near-identical to our `Abysses Bounce` (Nylon, 25mm, 63 g/m, 32 kN), and slack-inov.com sells only the Bounce. |
| `LIime SR` | weblock | **Duplicate / incorrect.** Do not import. |
| `Flax NY` | webbing | Variant of `Flax` (Slack Mountain) — identical specs |
| `SuperFL Maverick V2` | webbing | Variant of `Maverick` (Slack.fr) — identical specs |
| `Sonic 2.0` | webbing | Variant of `Sonic 2` (Aki) |
| `Sigma X (HeliX)` | webbing | Variant of `Sigma X` (Slackliner.de) — same product URL |
| `FLY Line` / `Tender Line` / `Zao Line` | webbing | Variants of `Fly` / `Tender` / `Zao` (Spider) |
| `Aero` | webbing | Variant of `Aero 1` (BC) — SlackDB's separate `Aero 2` is our `Aero 2` |
| `Mantra MKIII` / `Spider Silk MKII` | webbing | Variants of `Mantra MK3` / `Spider Silk MK2` (BC) |
| `Slackijump` | weblock | Variant of `Slackibloc Jump 1.2` (Slack Inov) — adjudicated in 51ba044 |
| `TiLock 19mm` / `TiLock 25mm` | weblock | We split these by pin type: `… - Steel Pins` / `… - Titanium Pins` (Raed) |
| `Eline SlacklineE Kit` / `ELINE SLACKLINE: LIGHT KIT` | starterkit | Variants of `eLine Full Kit` / `eLine Light Kit` (YogaSlackers) |
| `HighlineRing Green` | leashring | Colour variant of `HighlineRing` (Slacktivity) — collapsed by policy |
| `Space Age Slacklines SATURN ring` | leashring | Our `SATURN ring` — SlackDB prefixes the brand into the name |
| `Adjustable Tree Wear - Bera` | treepro | Variant of `Adjustable Tree Wear` (Bera) |
| `Tree'skin` | treepro | Variant of `Treeskin` (Elephant) — apostrophe |
| `Webbling Pulley` | roller | Our `High-way` (Slack Inov) — **deliberately renamed** in 207b67d, which also corrected its MBS from SlackDB's wrong 15 kN to 21 kN. Importing it re-creates the bug that commit fixed. |

### Out of scope, still

SlackDB's three unmodeled categories are untouched: `BRK` rope brakes (24), `CON` connectors (28),
`GEN` general (15). Rope brakes are the only one of the three the product vision names as a gear
type we intend to have — see CLAUDE.md § Product Vision. Adding them is a full new-gear-type
checklist, not an import.
