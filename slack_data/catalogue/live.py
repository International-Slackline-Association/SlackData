"""
The catalogue the site reads in store mode: built from the store, rebuilt when
the store's version moves (LIVE_EDITING_PLAN.md § 5.2, D25, D30).

Every request asks the store for its version — one small `GetItem` — and only
when it differs from the version this process built from does it read
everything and rebuild. So an edit is visible on the very next request in
every Lambda container, and a quiet catalogue costs one read per request.

A rebuild that fails keeps serving the catalogue it already has, and logs; a
catalogue that cannot be built at all on a cold start is an error, because
there is nothing to serve.

Requests already holding a session keep the engine they started with; the
swap only changes what the next session gets.
"""

import logging
import threading
import time

from sqlalchemy.engine import Engine

from slack_data.catalogue.build import build_engine, sources_from_documents
from slack_data.catalogue.repository import CatalogueRepository

logger = logging.getLogger(__name__)

# How long a version answer is trusted before asking again. Zero: every request
# asks (D30). Kept as a knob for a load test, not for production.
VERSION_TTL_SECONDS = 0.0


class LiveCatalogue:
    def __init__(self, repository: CatalogueRepository) -> None:
        self._repository = repository
        self._lock = threading.Lock()
        self._engine: Engine | None = None
        self._version: int | None = None
        # The documents the current engine was built from — what the public
        # export route serves, so it never disagrees with the pages.
        self.documents: list = []
        self._checked_at = 0.0
        self.builds = 0  # for tests and logs

    @property
    def version(self) -> int | None:
        return self._version

    def engine(self) -> Engine:
        """The current catalogue, refreshed first if the store has moved on."""
        now = time.monotonic()
        if self._engine is not None and now - self._checked_at < VERSION_TTL_SECONDS:
            return self._engine
        try:
            stored = self._repository.version()
        except Exception:
            if self._engine is None:
                raise
            logger.exception("catalogue version check failed; serving version %s", self._version)
            return self._engine
        self._checked_at = now
        if self._engine is not None and stored == self._version:
            return self._engine
        return self._rebuild(stored)

    def _rebuild(self, stored: int) -> Engine:
        with self._lock:
            # Another thread may have rebuilt while this one waited.
            if self._engine is not None and self._version == stored:
                return self._engine
            started = time.monotonic()
            try:
                documents = self._repository.load()
                engine = build_engine(sources_from_documents(documents))
            except Exception:
                if self._engine is None:
                    raise
                logger.exception(
                    "catalogue rebuild for version %s failed; still serving %s", stored, self._version
                )
                return self._engine
            self._engine, self._version, self.documents = engine, stored, documents
            self.builds += 1
            logger.info(
                "catalogue version %s built from %d documents in %.2fs",
                stored, len(documents), time.monotonic() - started,
            )
            return engine
