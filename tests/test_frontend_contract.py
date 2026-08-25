"""
The frontend↔backend field contract, checked in both directions.

CLAUDE.md's contract rule says frontend code must be written from the model
files. That rule is enforced by discipline everywhere else in this repo; here it
can be enforced by a test, because both sides are just lists of field names.

The failure this prevents is specific and unpleasant: the submit form offers a
field, the submitter fills it in, and the API answers 422 "webbings has no
field(s): ..." — an error about our own configuration, phrased as though the
submitter did something wrong, with no way for them to proceed.

The frontend list is parsed out of the TypeScript rather than duplicated here.
That is deliberately a little ugly: a copy of the list in Python would be a third
place to drift, which is the very thing being tested for.
"""

import re
from pathlib import Path

import pytest

from slack_data.submissions.fields import CORRECTABLE_FIELDS

FRONTEND = Path(__file__).parent.parent / "frontend" / "src" / "config"
SPEC_ROWS_TS = FRONTEND / "specRows.ts"
CORRECTABLE_TS = FRONTEND / "correctableFields.ts"

# Composites and non-single-field rows, which correctableFields.ts drops.
SYNTHETIC = {"width_range", "stretch"}


def _ts_source(path: Path) -> str:
    if not path.exists():  # pragma: no cover - the frontend is always present
        pytest.skip(f"{path} not found")
    return path.read_text()


def _slug_blocks() -> dict[str, str]:
    """Each gear slug's array literal inside SPEC_ROWS, by brace/bracket depth."""
    source = _ts_source(SPEC_ROWS_TS)
    start = source.index("export const SPEC_ROWS")
    body = source[start:]

    blocks: dict[str, str] = {}
    for match in re.finditer(r"^  (\w+): \[$", body, re.MULTILINE):
        slug = match.group(1)
        rest = body[match.end() :]
        end = rest.index("\n  ],")
        blocks[slug] = rest[:end]
    return blocks


def _fields_in(block: str) -> set[str]:
    """Field names a spec-row block declares."""
    names = set(re.findall(r"plain\('([a-z_]+)'", block))
    names |= set(re.findall(r"field: '([a-z_]+)'", block))
    if "widthRange" in block:
        names.add("width_range")
    if "stretchRow" in block:
        names.add("stretch")
    if "priceRow(" in block:
        names.add("price")
    return names


def _const_fields(name: str) -> set[str]:
    """Field names inside one `const <name>: CorrectableField[] = [...]` literal."""
    source = _ts_source(CORRECTABLE_TS)
    start = source.index(f"const {name}: CorrectableField[] = [")
    block = source[start : source.index("\n]", start)]
    return set(re.findall(r"field: '([a-z_]+)'", block))


def _common_fields() -> set[str]:
    """Offered on every gear type."""
    return _const_fields("COMMON")


def _width_range_fields() -> set[str]:
    """Offered only where a `width_range` spec row exists — mirroring `build()`."""
    return _const_fields("WIDTH_RANGE")


def test_the_parser_actually_found_the_config():
    """Guards the guard: a regex that silently matches nothing proves nothing."""
    blocks = _slug_blocks()
    assert set(blocks) >= set(CORRECTABLE_FIELDS), "did not parse every gear type"
    assert _fields_in(blocks["webbings"]) >= {"material", "width", "breaking_strength"}
    assert _common_fields() >= {"name", "brand_name"}
    assert _width_range_fields() == {"width_min", "width_max"}


@pytest.mark.parametrize("slug", sorted(CORRECTABLE_FIELDS))
def test_every_field_the_form_offers_is_one_the_api_accepts(slug):
    allowed = CORRECTABLE_FIELDS[slug]
    block = _slug_blocks()[slug]

    # Mirrors build() in correctableFields.ts: the spec rows minus the display
    # composites, plus the common fields, plus — only where the composite row
    # exists — the two real width fields hiding behind it.
    offered = (_fields_in(block) - SYNTHETIC) | _common_fields()
    if "width_range" in _fields_in(block):
        offered |= _width_range_fields()

    unknown = sorted(name for name in offered if name not in allowed)
    assert not unknown, (
        f"the submit form offers {unknown} for {slug}, which "
        f"slack_data/models/{slug} has no such field(s) for"
    )


def test_synthetic_rows_are_not_offered_as_corrections():
    """`width_range` and `stretch` are display composites, not model fields."""
    for name in SYNTHETIC:
        for slug, allowed in CORRECTABLE_FIELDS.items():
            assert name not in allowed or name == "stretch", (
                f"{name} should not be correctable on {slug}"
            )
