"""
Building the catalogue the site reads, and comparing two of them.

`build_engine(sources)` is today's seed — `slack_data.seed.seed_catalog`, every
loader and derivation pass, unchanged — run into an in-memory SQLite (§ 5.2,
D25). The sources are either the root seed files or the store's documents
assembled into the same shape, so a catalogue built from the store and one
built from the files go through identical code.

`compare(a, b)` is the shadow check: every row of every table, field by field.
Two catalogues that agree here serve identical API responses, because the read
code over them is the same.
"""

import sqlite3
import uuid
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool
from sqlmodel import Session, SQLModel, create_engine

from slack_data.catalogue.documents import COLLECTIONS, Document, assemble_all
from slack_data.load_data._seed_io import read_seed_json, seed_sources


def sources_from_files() -> dict[str, Any]:
    """{filename: content} straight from the root seed files."""
    return {spec.filename: read_seed_json(spec.filename) for spec in COLLECTIONS.values()}


def sources_from_documents(documents: list[Document]) -> dict[str, Any]:
    return assemble_all(documents)


def build_engine(sources: dict[str, Any]) -> Engine:
    """A complete, read-only-by-convention catalogue in memory.

    A named in-memory database in SQLite's shared cache, so every thread FastAPI
    serves a request on gets a connection of its own to the same data. One
    connection shared by every thread (`StaticPool`, as it was) is not safe:
    concurrent requests interleave on it, fail with "bad parameter or other API
    misuse", and then crash the process.

    An in-memory database lasts only while some connection to it is open, and a
    pool may close its connections, so the engine holds one more for its whole
    life (`_keepalive`). It closes when the engine is collected.
    """
    # Imported here: `slack_data.seed` imports every model and loader, which is
    # what makes SQLModel.metadata complete for create_all.
    from slack_data.seed import seed_catalog

    uri = f"file:catalogue-{uuid.uuid4().hex}?mode=memory&cache=shared"
    engine = create_engine(
        f"sqlite:///{uri}&uri=true",
        connect_args={"check_same_thread": False},
        poolclass=QueuePool,
    )
    engine._keepalive = sqlite3.connect(uri, uri=True, check_same_thread=False)
    SQLModel.metadata.create_all(engine)
    with seed_sources(sources), Session(engine) as session:
        seed_catalog(session)
    return engine


def dump(engine: Engine) -> dict[str, dict[Any, dict[str, Any]]]:
    """{table: {primary key: row}} — every row of every table."""
    from slack_data import seed  # noqa: F401 - registers every model

    out: dict[str, dict[Any, dict[str, Any]]] = {}
    with engine.connect() as connection:
        for table in SQLModel.metadata.sorted_tables:
            primary = [column.name for column in table.primary_key.columns]
            rows: dict[Any, dict[str, Any]] = {}
            for row in connection.execute(table.select()).mappings():
                key = tuple(row[name] for name in primary)
                rows[key] = dict(row)
            out[table.name] = rows
    return out


def compare(a: Engine, b: Engine, limit: int = 50) -> list[str]:
    """Human-readable differences between two catalogues; empty when identical."""
    left, right = dump(a), dump(b)
    differences: list[str] = []
    for table in sorted(set(left) | set(right)):
        rows_a, rows_b = left.get(table, {}), right.get(table, {})
        for key in sorted(set(rows_a) - set(rows_b), key=str):
            differences.append(f"{table} {key}: only in the first")
        for key in sorted(set(rows_b) - set(rows_a), key=str):
            differences.append(f"{table} {key}: only in the second")
        for key in sorted(set(rows_a) & set(rows_b), key=str):
            for column in rows_a[key]:
                if rows_a[key][column] != rows_b[key].get(column):
                    differences.append(
                        f"{table} {key} {column}: {rows_a[key][column]!r} != {rows_b[key].get(column)!r}"
                    )
        if len(differences) >= limit:
            differences.append("… (stopped)")
            break
    return differences


def table_names(engine: Engine) -> list[str]:
    return inspect(engine).get_table_names()
