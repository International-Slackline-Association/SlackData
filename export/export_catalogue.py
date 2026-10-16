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

A run that changes nothing leaves every file byte-identical, so the workflow
commits only on a real change.
"""

import argparse
import json
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--api", default="https://slackdata.org/api")
    parser.add_argument("--out", default=".")
    args = parser.parse_args(argv)
    api = args.api.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    index = json.loads(get(f"{api}/catalogue"))
    for collection in index["collections"]:
        body = get(f"{api}/catalogue/{collection['name']}")
        json.loads(body)  # refuse to write anything that is not JSON
        (out / collection["file"]).write_bytes(body)

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
    print(f"exported {len(index['collections'])} collections and {len(changes)} changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
