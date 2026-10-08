"""Snapshot everything SlackDB (slackdb.com) serves.

Run once, before the site goes dark (`python3 fetch.py`, `python3 fetch.py images`, then
`python3 fetch.py site`).
Writes into this directory:

    raw/api/*.json         every read endpoint, byte-for-byte as served
    raw/pages/*.json       JSON the server embeds in its HTML pages (not on any endpoint)
    raw/gear_details/      one embedded `gearDetailSet` per gear item
    raw/manufacturer_details/  one embedded `manufacturerDetailSet` per manufacturer
    raw/images/            one /api/images/<id> record per image (metadata)
    raw/gear_covers.json   gear id → the image id the site showed as its cover
    image_files/gear/      every original photo, as uploaded
    image_files/manufacturers/  manufacturer logos
    image_files/site/      the site's own graphics under /img/ (favicons, icons, markers)
    raw/site_assets.json   every /img/ path tried, and whether the site had it

`build.py` then turns raw/ into the readable files at the top level.
Resumable: anything already on disk is skipped.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE = "https://slackdb.com"
HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
UA = {"User-Agent": "Mozilla/5.0 (SlackData archive; one-off backup before shutdown)"}
DELAY = 0.25
WORKERS = 4

# Every endpoint the site's own JS calls with GET (loadResources lists in /js/*_app.js).
API_ENDPOINTS = [
    "gear", "gear_basic", "manufacturers", "communities", "knowledge", "knowledge_sites",
    "images", "countries", "item_types_def", "edit_suggestions", "dictionaries",
    "dictionaries/gear", "dictionaries/communities", "dictionaries/images",
    "dictionaries/knowledge", "dictionaries/manufacturers",
]

# Page → embedded `var <name> = {...};` blocks worth keeping.
# (/edit_suggestions embeds editSuggestionsData too, but it is identical to /api/edit_suggestions.)
PAGE_VARS = {
    "/": ["overviewData"],
    "/gear": ["currencyRates"],
}


def get(path: str) -> bytes:
    for attempt in range(4):
        try:
            req = urllib.request.Request(BASE + path, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            time.sleep(DELAY)
            return body
        except Exception as e:  # noqa: BLE001 — retry anything, report the last
            err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{path}: {err}")


def embedded_var(html: str, name: str):
    """Pull `var <name> = <json>;` out of an inline <script>, via a real JSON decoder."""
    m = re.search(rf"var {name}\s*=\s*", html)
    if not m:
        raise KeyError(name)
    obj, _ = json.JSONDecoder().raw_decode(html, m.end())
    return obj


def save(path: Path, obj) -> None:
    write_bytes(path, (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))


FILES = HERE / "image_files"


def each(label, items, fn, failures) -> None:
    """Run fn(item) over items, WORKERS at a time; collect failures instead of stopping.

    The server spends ~2-3 s before its first byte on every request, so throughput is
    latency-bound and a handful of parallel requests (fewer than a browser opens to
    render one SlackDB page) cuts the run time almost proportionally.
    """
    done = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = {pool.submit(fn, it): it for it in items}
        for fut in as_completed(futures):
            done += 1
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001
                it = futures[fut]
                failures.append((label, it.get("_id"), it.get("slug") or it.get("filename"), str(e)))
            if done % 100 == 0:
                print(f"{label} {done}/{len(items)}", flush=True)
    print(f"{label} done", flush=True)


def write_bytes(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(body)
    tmp.replace(path)


def fetch_images() -> int:
    """Original photos + manufacturer logos, and which photo each gear item used as its cover.

    The cover (/api/gear/image_thumb/<gearId>) is served as bytes, not as an id, but it is
    byte-identical to that photo's own /user_content/img/gear/<imageId>_thm.jpg — so the
    mapping is recovered exactly by hash, and the thumbnails themselves are not kept.
    """
    import hashlib

    failures = []
    md5 = lambda b: hashlib.md5(b).hexdigest()

    images = json.loads((RAW / "api" / "images.json").read_bytes())

    def photo(im):
        out = FILES / "gear" / im["filename"]
        if not out.exists():
            write_bytes(out, get("/user_content/img/gear/" + im["filename"]))

    each("photos", images, photo, failures)

    def logo(m):
        out = FILES / "manufacturers" / m["imageFilename"]
        if not out.exists():
            write_bytes(out, get("/user_content/img/manufacturers/" + urllib.parse.quote(m["imageFilename"])))

    mfrs = json.loads((RAW / "api" / "manufacturers.json").read_bytes())
    each("logos", [m for m in mfrs if m.get("imageFilename")], logo, failures)

    covers_file = RAW / "gear_covers.json"
    if not covers_file.exists():
        thumb_hash, cover_hash = {}, {}

        def thumb(im):
            # A list: a photo uploaded twice gives two image ids one thumbnail.
            thumb_hash.setdefault(md5(get(f"/user_content/img/gear/{im['_id']}_thm.jpg")), []).append(im["_id"])

        def cover(g):
            cover_hash[g["_id"]] = md5(get(f"/api/gear/image_thumb/{g['_id']}"))

        each("thumbs", images, thumb, failures)
        gear = json.loads((RAW / "api" / "gear.json").read_bytes())
        each("covers", gear, cover, failures)
        tagged = {}
        for im in images:
            for gid in im["gearId"] if isinstance(im["gearId"], list) else [im["gearId"]]:
                tagged.setdefault(gid, set()).add(im["_id"])

        def resolve(g):
            h = cover_hash[g["_id"]]
            if h == placeholder:
                return None
            ids = sorted(thumb_hash.get(h, []))
            if not ids:
                return "UNMATCHED"
            # Of byte-identical twins, the one tagged with this item; else the only candidate.
            own = [i for i in ids if i in tagged.get(g["_id"], ())]
            return (own or ids)[0]

        if not failures:  # a partial map would be silently wrong; leave it for a re-run
            placeholder = md5(get("/img/no_image_thumb.png"))
            save(covers_file, {g["_id"]: resolve(g) for g in gear})

    for f in failures:
        print("FAILED", *f, file=sys.stderr)
    return 1 if failures else 0


# The site's own graphics: every /img/ path in its HTML, JS and CSS, except the country
# flags (not wanted). Templated paths are expanded below; a guess the site doesn't have
# (an icon for every type) is a 404.
SITE_IMG = [
    "icons/sdb32x32.ico", "icons/sdb32x32.png", "icons/sdb48x48.png", "icons/sdb96x96.png",
    "icons/sdb144x144.png", "logo.png", "isa_logo.png", "bg.jpg", "no_image_thumb.png",
    "add_item_overlay.png", "add_item_overlay_bg.png", "fb_login_large.png",
    "gallery_controlls.png", "stars_rate.png", "stars_rate_s.png",
    "new_item.png", "inactive_item.png", "discontinued_item.png",
    "charts/bar.jpg", "charts/pie.jpg", "charts/scatter_2axis.jpg", "charts/scatter_3axis.jpg",
    *(f"markers/{m}.png" for m in (
        "camp", "gear", "red-gear", "rope", "red-rope", "team",
        "l-association", "l-community", "l-market", "w-association", "w-community", "w-market")),
]


def fetch_site_assets() -> int:
    types = json.loads((RAW / "api" / "item_types_def.json").read_bytes())
    paths = SITE_IMG + [f"gear_types/{t}.png" for t in sorted(types) if t != "BASE"] \
        + [f"items_types/{t}.png" for t in sorted(types) if t != "BASE"]
    status, failures = {}, []

    def one(item):
        path = item["path"]
        out = FILES / "site" / path
        if out.exists():
            status[path] = "saved"
            return
        req = urllib.request.Request(f"{BASE}/img/{path}", headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body, ctype = r.read(), r.headers.get_content_type()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                status[path] = "not on the site"
                return
            raise
        time.sleep(DELAY)
        if ctype == "text/html":  # an error page served as 200 is not an image
            status[path] = "not on the site"
            return
        write_bytes(out, body)
        status[path] = "saved"

    each("site", [{"path": p, "_id": p} for p in paths], one, failures)
    save(RAW / "site_assets.json", dict(sorted(status.items())))
    for f in failures:
        print("FAILED", *f, file=sys.stderr)
    return 1 if failures else 0


def main() -> int:
    if sys.argv[1:] == ["images"]:
        return fetch_images()
    if sys.argv[1:] == ["site"]:
        return fetch_site_assets()
    failures = []

    for ep in API_ENDPOINTS:
        out = RAW / "api" / (ep.replace("/", "_") + ".json")
        if not out.exists():
            body = get("/api/" + ep)
            json.loads(body)  # must parse; refuse to store an HTML error page
            write_bytes(out, body)
            print("api", ep, len(body))

    for page, names in PAGE_VARS.items():
        html = None
        for name in names:
            out = RAW / "pages" / f"{name}.json"
            if out.exists():
                continue
            html = html or get(page).decode("utf-8")
            save(out, embedded_var(html, name))
            print("page", page, name)

    def gear_detail(g):
        out = RAW / "gear_details" / f"{g['_id']}.json"
        if not out.exists():
            html = get("/gear_details/" + urllib.parse.quote(g["slug"])).decode("utf-8")
            save(out, embedded_var(html, "gearDetailSet"))

    def manufacturer_detail(m):
        out = RAW / "manufacturer_details" / f"{m['_id']}.json"
        if not out.exists():
            html = get("/manufacturer_details/" + urllib.parse.quote(m["slug"])).decode("utf-8")
            save(out, embedded_var(html, "manufacturerDetailSet"))

    def image_record(im):
        out = RAW / "images" / f"{im['_id']}.json"
        if not out.exists():
            save(out, json.loads(get(f"/api/images/{im['_id']}")))

    each("gear", json.loads((RAW / "api" / "gear.json").read_bytes()), gear_detail, failures)
    each("manufacturers", json.loads((RAW / "api" / "manufacturers.json").read_bytes()),
         manufacturer_detail, failures)
    each("images", json.loads((RAW / "api" / "images.json").read_bytes()), image_record, failures)

    if not failures:
        slim()

    for f in failures:
        print("FAILED", *f, file=sys.stderr)
    return 1 if failures else 0


# Per detail page, the keys that describe THIS item. Everything else on the page
# is either site-wide config repeated on every page, or a lookup subset of a list
# endpoint (gearBasic, images, manufacturers, …).
KEEP = {
    "gear_details": {"gearDetail", "similarGear"},
    "manufacturer_details": {"manufacturerDetail"},
}
# Site-wide blocks: stored once under raw/pages/, after checking every page agrees.
# "itemTypeDef"/"itemTypeTxt" are per gear type, so they are keyed by it.
SHARED = {"dic", "baseItemTypeDef", "reviewsProsCons", "itemTypeDef", "itemTypeTxt"}


def slim() -> None:
    """Strip each saved detail page down to KEEP, proving the rest is redundant first."""
    shared: dict[str, object] = {}
    for kind, keep in KEEP.items():
        for f in sorted((RAW / kind).glob("*.json")):
            page = json.loads(f.read_text(encoding="utf-8"))
            if set(page) <= keep:
                continue  # already slimmed
            item = page.get("gearDetail") or page.get("manufacturerDetail")
            for key in set(page) & SHARED:
                tag = f"{key}_{item['itemTypeId']}" if kind == "gear_details" and key.startswith("itemType") \
                    else f"{key}_{kind}" if key == "itemTypeDef" else key
                if tag in shared and shared[tag] != page[key]:
                    raise SystemExit(f"{f}: {key} differs from other pages — not slimming")
                shared[tag] = page[key]
            if kind == "gear_details" and page.get("images"):
                known = {im["_id"] for im in json.loads((RAW / "api" / "images.json").read_bytes())}
                missing = {im["_id"] for im in page["images"]} - known
                if missing:
                    raise SystemExit(f"{f}: images {missing} are not in /api/images")
            save(f, {k: v for k, v in page.items() if k in keep})
    # Every page's copy of the type definitions and dictionaries is the API's own, so
    # prove that and keep only the API copy. The singular type names are new — keep those.
    types = json.loads((RAW / "api" / "item_types_def.json").read_bytes())
    dicts = json.loads((RAW / "api" / "dictionaries.json").read_bytes())
    names = {}
    for tag, value in shared.items():
        if tag.startswith("itemTypeTxt_"):
            names[tag.split("_", 1)[1]] = value
            continue
        expected = {
            "dic": dicts, "baseItemTypeDef": types["BASE"],
            "itemTypeDef_manufacturer_details": types["MNF"],
        }.get(tag, types.get(tag.removeprefix("itemTypeDef_")) if tag.startswith("itemTypeDef_") else None)
        if expected is None:
            save(RAW / "pages" / f"{tag}.json", value)  # not on any endpoint: keep it
        elif value != expected:
            raise SystemExit(f"{tag} on the detail pages differs from the API's copy")
    if names:
        save(RAW / "pages" / "itemTypeNames.json", dict(sorted(names.items())))


if __name__ == "__main__":
    sys.exit(main())
