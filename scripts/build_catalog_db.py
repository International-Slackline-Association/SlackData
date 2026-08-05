"""Bake the read-only catalog SQLite that ships inside the Lambda package.

Runs the same load sequence the local server runs on first boot
(``slack_data.seed.seed_catalog``), but as a one-off build step, producing a
self-contained ``database.db`` the hosted app then opens read-only. Re-run
whenever the root ``*.json`` seed data changes.

Usage:
    python scripts/build_catalog_db.py [output_path]   # default: database.db
"""

import sys
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

# Importing seed pulls in every table model + loader, so SQLModel.metadata is
# complete before create_all().
from slack_data.seed import seed_catalog


def build(out_path: str) -> None:
    Path(out_path).unlink(missing_ok=True)
    engine = create_engine(
        f"sqlite:///{out_path}", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_catalog(session)
    print(f"Built catalog DB -> {out_path}")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "database.db")
