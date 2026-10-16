"""
The catalogue as data — what the daily export copies (LIVE_EDITING_PLAN.md § 6.6).

| route | |
|---|---|
| `GET /catalogue` | the version, where it is read from, and the collections |
| `GET /catalogue/{collection}` | one seed file, rebuilt from the stored documents, byte for byte in the seed's own format |

Public and read-only, like every other catalogue read: the data is the same data
the gear pages show. Never the brand-clients table (D64) or the people store.

Where the documents come from:

| mode | source |
|---|---|
| `CATALOG_SOURCE=store` | the documents the live catalogue was built from — so the export never disagrees with the pages |
| a store configured, not yet switched over (shadow) | the store, read on each call |
| neither, local | the root seed files |
| neither, hosted | nothing to serve: 503 |
"""

from fastapi import APIRouter, HTTPException, Response, status

from slack_data.catalogue.documents import (
    COLLECTIONS,
    Document,
    assemble,
    explode,
    render,
)

catalogue_router = APIRouter(prefix="/catalogue", tags=["catalogue"])


def _documents() -> tuple[list[Document], int | None, str]:
    from slack_data import database
    from slack_data.catalogue.store import get_catalogue_repository, store_configured
    from slack_data.deployment import is_hosted

    live = database.LIVE_CATALOGUE
    if live is not None:
        live.engine()  # pick up a newer version first, as a page would
        return live.documents, live.version, "store"
    if store_configured():
        repository = get_catalogue_repository()
        return repository.load(), repository.version(), "store (shadow)"
    if is_hosted():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "the catalogue store is not configured")

    from slack_data.catalogue.build import sources_from_files

    sources = sources_from_files()
    documents = [d for name, spec in COLLECTIONS.items() for d in explode(name, sources[spec.filename])]
    return documents, None, "seed files"


@catalogue_router.get("")
def catalogue_index() -> dict:
    _, version, source = _documents()
    return {
        "version": version,
        "source": source,
        "collections": [{"name": name, "file": spec.filename} for name, spec in COLLECTIONS.items()],
    }


@catalogue_router.get("/{collection}")
def catalogue_collection(collection: str) -> Response:
    if collection not in COLLECTIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no collection {collection!r}")
    documents, version, _ = _documents()
    return Response(
        content=render(collection, assemble(collection, documents)),
        media_type="application/json",
        headers={"X-Catalogue-Version": str(version) if version is not None else "files"},
    )
