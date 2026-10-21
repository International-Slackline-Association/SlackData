"""
Seed files -> the catalogue store, and the shadow check between them.

    # what would change (writes nothing)
    python -m slack_data.catalogue.importer

    # write it, then bump the version so every reader rebuilds
    python -m slack_data.catalogue.importer --apply

    # the shadow check: the store and the seeds, document by document AND as
    # built catalogues. Exit 1 on any difference.
    python -m slack_data.catalogue.importer --check

Which store: `CATALOG_TABLE` (hosted DynamoDB, run with the operator's SSO
profile) or `CATALOG_STORE_PATH` (a local SQLite file) — `store.py`.

**While phase 2 runs in shadow**, the seeds are still where data is edited, so
the importer is re-run before each deploy and `--check` must come back clean:
that is "compared on every deploy" (§ 13). **After the switch-over** the store
is the truth and the seeds stop being edited (D4); the importer is then only
how a fresh local store is filled from a data snapshot (D34). What a pull
request still adds to the seeds goes in with `seed_import.py`, which never
overwrites a field changed on the site.

An entry that has left the seeds is **retired**, never deleted (documents.py).
Nothing is written to the change log: an import is not an edit anyone made.
"""

import argparse
import contextlib
import io
import sys
from collections import Counter

from slack_data.catalogue.build import (
    build_engine,
    compare,
    sources_from_documents,
    sources_from_files,
)
from slack_data.catalogue.documents import COLLECTIONS, Document, explode
from slack_data.catalogue.repository import CatalogueRepository


def documents_from_files() -> list[Document]:
    sources = sources_from_files()
    return [d for name, spec in COLLECTIONS.items() for d in explode(name, sources[spec.filename])]


def plan(repository: CatalogueRepository, wanted: list[Document]) -> list[Document]:
    """The puts that make the store hold exactly `wanted`."""
    stored = {(d.collection, d.key): d for d in repository.load(include_retired=True)}
    wanted_keys = {(d.collection, d.key) for d in wanted}
    changes: list[Document] = []
    for document in wanted:
        current = stored.get((document.collection, document.key))
        if (
            current is None
            or current.retired
            or current.seq != document.seq
            or current.data != document.data
        ):
            # A rewrite moves the rev on, so an edit opened before it is
            # refused rather than silently undoing the import (D27).
            changes.append(document.model_copy(update={"rev": current.rev + 1 if current else 1}))
    for key, current in stored.items():
        if key not in wanted_keys and not current.retired:
            changes.append(current.model_copy(update={"retired": True, "rev": current.rev + 1}))
    return changes


def describe(changes: list[Document]) -> str:
    counts = Counter(
        (d.collection, "retire" if d.retired else "write") for d in changes
    )
    return ", ".join(f"{collection}: {n} {action}" for (collection, action), n in sorted(counts.items()))


def shadow_differences(repository: CatalogueRepository) -> list[str]:
    """Build the catalogue from the store and from the seeds; compare every row."""
    with contextlib.redirect_stdout(io.StringIO()):  # the loaders narrate every row
        from_store = build_engine(sources_from_documents(repository.load()))
        from_files = build_engine(sources_from_files())
    return compare(from_files, from_store)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--apply", action="store_true", help="write the changes and bump the version")
    parser.add_argument("--check", action="store_true", help="exit 1 if the store differs from the seeds")
    parser.add_argument(
        "--overwrite-live-edits",
        action="store_true",
        help="apply even though the store holds edits made on the site (they are lost)",
    )
    args = parser.parse_args(argv)

    from slack_data.catalogue.store import build_repository

    repository = build_repository()
    changes = plan(repository, documents_from_files())

    if args.check:
        if changes:
            print(f"✗ the store differs from the seeds: {describe(changes)}")
            return 1
        differences = shadow_differences(repository)
        if differences:
            print("✗ the catalogue built from the store differs from the seeds':")
            for line in differences:
                print(f"    {line}")
            return 1
        print(f"✓ the store matches the seeds (version {repository.version()})")
        return 0

    if not changes:
        print(f"nothing to import — the store already matches the seeds (version {repository.version()})")
        return 0

    print(describe(changes))
    if not args.apply:
        print("dry run — nothing written. Re-run with --apply.")
        return 0
    edits = repository.edits()
    if edits and not args.overwrite_live_edits:
        # Phase 3: from the first edit on the site, the store is the truth (D4)
        # and the seeds are a stale copy. Importing them would silently undo
        # every edit since — with no record of it in the change log.
        print(
            f"✗ refused: the store holds {edits} edit(s) made on the site, which these seeds do not.\n"
            "  Importing would undo them with no record in the change log. The store is the\n"
            "  truth now; take the seeds from the data repo's export instead. To bring in what\n"
            "  a pull request added to the seeds, use python -m slack_data.catalogue.seed_import.\n"
            "  If you really mean to discard the edits, re-run with --overwrite-live-edits."
        )
        return 1

    repository.put_many(changes)
    version = repository.bump_version()
    print(f"✓ {len(changes)} document(s) written; catalogue version is now {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
