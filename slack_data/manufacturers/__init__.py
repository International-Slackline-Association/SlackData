"""
The manufacturer API — brands updating their own gear.

Phase 4. Structured exactly like `slack_data/submissions/`, and for the same
reason: a writable store that is **not** the catalogue, reached through a
Protocol, with boto3 imported lazily so the test suite runs with no AWS
credentials and boto3 not installed at all.

- `clients.py` — the brand-client repository (Protocol + in-memory + SQLite)
- `dynamo.py`  — the hosted implementation
- `store.py`   — which one this process talks to, chosen by env var
- `matching.py`— resolving "the product they mean" to a row we hold

See MANUFACTURER_API_PLAN.md.
"""
