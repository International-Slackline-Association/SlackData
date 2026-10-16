"""
The daily export: the catalogue and the change log, from the public API, into
files (LIVE_EDITING_PLAN.md § 6.6, D13).

Standard library only, so it runs in the data repo's GitHub Action as a single
copied file, with no install and no AWS credentials — it reads only public
routes:

    python export_catalogue.py --api https://slackdata.org/api --out .

Writes, into --out:

- `<collection>.json` — one per seed file, byte-identical in format to this
  repo's root seeds (`GET /catalogue/{collection}`), so a checkout can use them
  in their place (D34, D49).
- `changes.json` — the whole change log, OLDEST first, with names looked up at
  export time (D43). Oldest first because the log is append-only: a normal day's
  diff is lines added at the end, and anything else — a record altered or
  removed — stands out (§ 6.5).
- `catalogue.json` — the catalogue version it was exported at. No timestamp:
  the commit carries the date, and a timestamp would make every day a change.
- `media/<key>` — every photo, manual and logo the catalogue names (GET
  /media/manifest, live editing phase 4), fetched from the public `/media/`.
  This is the media's backup outside AWS (LIVE_EDITING_PHASE_4.md P4-F). A key
  is never reused for other bytes, so only keys not yet held are fetched, and a
  file the catalogue stops naming stays: the export never deletes.

`--snapshot` writes only the seeds and the media — the shape of this repo's
own dev snapshot (root `*.json` and `media/`), refreshed deliberately in its
own PR:

    python export/export_catalogue.py --api https://slackdata.org/api --out . --snapshot

A run that changes nothing leaves every file byte-identical, so the workflow
commits only on a real change.
"""

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

PAGE = 100


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "slackdata-export"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def all_changes(api: str) -> list[dict]:
    """Every record, paging backwards with `before` until a short page."""
    records: list[dict] = []
    before = None
    while True:
        query = {"limit": PAGE}
        if before:
            query["before"] = before
        page = json.loads(get(f"{api}/changes?{urllib.parse.urlencode(query)}"))
        records.extend(page)
        if len(page) < PAGE:
            break
        before = page[-1]["id"]
    return list(reversed(records))  # oldest first


# A key the media store could have made (slack_data/media/store.py valid_key):
# nothing written outside --out/media.
MEDIA_KEY = re.compile(r"^[a-z0-9]+(/[a-z0-9-]+)*/[a-z0-9-]+\.(jpg|png|webp|pdf|svg)$")


def media_keys(manifest: dict) -> list[str]:
    """Every key the manifest names, sorted."""
    keys = set(manifest.get("logos", {}).values())
    for by_id in manifest.get("photos", {}).values():
        for photos in by_id.values():
            keys |= {size for p in photos for size in (p["small"], p["large"])}
    for section in ("manuals", "brandManuals"):
        for by_owner in manifest.get(section, {}).values():
            for documents in by_owner.values():
                keys |= {d["file"] for d in documents}
    return sorted(keys)


def download_media(base: str, keys: list[str], out: Path) -> int:
    """Each key not yet under `out`, fetched from `base`; how many were."""
    fetched = 0
    for key in keys:
        if not MEDIA_KEY.match(key) or ".." in key:
            raise ValueError(f"not a media key: {key!r}")
        target = out / key
        if target.exists():
            continue
        data = get(f"{base}/{key}")
        if not data:
            raise ValueError(f"{key}: empty")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        fetched += 1
    return fetched


def export_media(api: str, out: Path) -> int:
    manifest = json.loads(get(f"{api}/media/manifest"))
    # "/media" hosted: on the site's own origin, beside /api.
    base = urllib.parse.urljoin(api + "/", manifest["base"]).rstrip("/")
    return download_media(base, media_keys(manifest), out / "media")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--api", default="https://slackdata.org/api")
    parser.add_argument("--out", default=".")
    parser.add_argument("--snapshot", action="store_true", help="the seeds and the media only (this repo's dev snapshot)")
    parser.add_argument("--no-media", action="store_true", help="skip the media")
    args = parser.parse_args(argv)
    api = args.api.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    index = json.loads(get(f"{api}/catalogue"))
    for collection in index["collections"]:
        body = get(f"{api}/catalogue/{collection['name']}")
        json.loads(body)  # refuse to write anything that is not JSON
        (out / collection["file"]).write_bytes(body)

    fetched = 0 if args.no_media else export_media(api, out)
    if args.snapshot:
        print(f"exported {len(index['collections'])} collections and {fetched} new media files")
        return 0

    changes = all_changes(api)
    (out / "changes.json").write_text(
        json.dumps(changes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (out / "catalogue.json").write_text(
        json.dumps(
            {"version": index["version"], "source": index["source"]},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"exported {len(index['collections'])} collections, {len(changes)} changes, {fetched} new media files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
