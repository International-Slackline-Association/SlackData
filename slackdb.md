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

## Snapshot (last audited 2026-07-17)

Counts (SlackDB / ours): WEB 204/208 · WLCK 109/109 · SKT 64/64 · LRNG 31/31 · TRP 24/23 ·
SLD 13/19 · WGP 12/12 · TLK 9/9. (We exceed SlackDB in a few categories from other sources.)

Genuine gaps found this pass:
- **Webbings** — missing `Unicorn` & `White Magic` (Aki Slacklines, mfr 64), `Neon` (Equilibrium, mfr 9).
- **Tricklinekits** — `Level Two Kit` (mfr unset in SlackDB).
- **Data bugs** (product present but broken): two `treepros` rows have `manufacturer: null`
  (`Treeskin` → should be *Elephant*/mfr 10; `Treewear XL - Edition` → *Gibbon*/mfr 1);
  `ROLLEX` brand disagreement (ours *Spider Slacklines* vs SlackDB *Equilibrium*/mfr 9).
