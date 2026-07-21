#!/usr/bin/env python3
"""Correct `slackline_oriented` in manufacturers.json.

SlackDB marks essentially every manufacturer `isSlacklineOriented: true`, including
general climbing, rope-access and industrial-rigging companies that happen to make
one part slackliners use. Imported as-is, the flag was true for all 56 brands we
hold gear for, so the UI badge it drives rendered on every card and discriminated
nothing.

The default stays **true** — the overwhelming majority of this dataset really are
slackline companies — so only the exceptions are listed here, each with the reason
it is not a slackline brand. A name is NOT sufficient evidence either way; two
brands that read as general rigging companies turned out to be slackline firms:

  * "Rigging Ventures" — a slackline supply company (riggingventures.com sold
    slackline and trickline kits; the domain has since lapsed).
  * "ZERGE outdoor"    — "slackline & longline equipment"; its ZERO rings are
    purpose-built slackline hardware.

Both were verified before being left as slackline-focused, as were Balanceur
("primul producător românesc de ecHIPament Slackline"), Bera Adventure ("tudo para
slackline, trickline, highline"), Radrigs ("a slackline manufacturer based in the
United Kingdom") and Krok (whose own site describes mountaineering, rope-access and
rock-climbing gear — hence its inclusion below).

    python3 scripts/apply_slackline_focus.py            # apply
    python3 scripts/apply_slackline_focus.py --dry-run  # report only
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from slack_data.utilities.brand_aliases import canonical_brand  # noqa: E402

MFR_JSON = ROOT / "manufacturers.json"

# Brand -> why it is not slackline-focused. These are general-purpose climbing,
# mountaineering, rope-access, rescue or industrial-rigging manufacturers: they
# appear in a slackline database because one of their products (a ring, a
# connector, a length of webbing) is used in slacklining, not because slacklining
# is their business.
GENERAL_PURPOSE: dict[str, str] = {
    # — with gear in our DB, so these actually change what renders —
    "Camp": "Italian mountaineering/climbing manufacturer",
    "Climbing Technology (CT)": "Italian climbing hardware manufacturer",
    "Edelrid": "German climbing and mountaineering manufacturer",
    "Fusion Climb": "climbing harness and hardware manufacturer",
    "Kong": "Italian climbing and industrial safety hardware",
    "Krok": "mountaineering, rope-access and rock-climbing gear (per their own site)",
    "Mammut": "Swiss alpine and climbing manufacturer",
    "Singing rock": "Czech climbing and work-at-height manufacturer",
    # — no gear in our DB today, so cosmetic for now, but kept correct so the
    #   flag doesn't go stale the moment one of them gains an item —
    "CMC Rescue": "US rope-rescue equipment manufacturer",
    "Episwiss Rigging": "Swiss rigging company",
    "ISC": "Welsh rope-access and industrial safety components",
    "Omega Pacific": "US climbing hardware manufacturer",
    "Petzl": "French climbing, caving and work-at-height manufacturer",
    "Rock Exotica": "US rope-access and rigging hardware",
    "SMC": "US rescue and rope hardware manufacturer",
    "Tendon": "Czech climbing rope manufacturer",
    "Trango": "US climbing equipment manufacturer",
    "Van Beest": "Dutch industrial rigging/shackle manufacturer",
}


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    general = {canonical_brand(name): reason for name, reason in GENERAL_PURPOSE.items()}

    data = json.loads(MFR_JSON.read_text(encoding="utf-8"))
    entries = data.get("manufacturers", {})

    changed, seen = [], set()
    for entry in entries.values():
        name = canonical_brand((entry.get("name") or "").strip())
        if not name:
            continue
        seen.add(name)
        want = name not in general
        if entry.get("slackline_oriented") != want:
            changed.append((name, entry.get("slackline_oriented"), want, general.get(name, "")))
            if not dry_run:
                entry["slackline_oriented"] = want

    unmatched = sorted(set(general) - seen)

    print(f"{len(entries)} manufacturers; {len(general)} flagged general-purpose")
    print(f"Changing {len(changed)}:")
    for name, before, after, reason in sorted(changed):
        print(f"  {name:28s} {before!r} -> {after!r}  {reason}")
    if unmatched:
        print(f"\nWARNING: {len(unmatched)} name(s) in GENERAL_PURPOSE matched no entry:")
        for name in unmatched:
            print(f"  {name}  (typo, or the brand was renamed)")

    if dry_run:
        print("\n(dry run — nothing written)")
        return 0

    MFR_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {MFR_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
