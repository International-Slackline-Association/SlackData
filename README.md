# SlackData

SlackData is a database of slackline gear, inspired by [SlackDB](https://slackdb.com/).

SlackData is open source, with an open API to allow other tools to use the database.

**Stack:** Python / FastAPI / SQLModel / SQLite backend + React / TypeScript / Vite frontend.

---

## Quick start (full local stack)

The frontend reads its data from the backend API, so **the backend must be running** or the
listing pages come up empty. Start both:

```bash
# 1. Backend — http://127.0.0.1:8000
uv sync                          # creates .venv with all deps
source .venv/bin/activate
cd slack_data
fastapi dev main.py              # seeds database.db on first run

# 2. Frontend — http://localhost:5173 (in a second terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The backend allows CORS from the Vite dev
server (`localhost:5173` / `127.0.0.1:5173`); override the API URL with `VITE_API_URL` if you run
the backend elsewhere.

### Troubleshooting: frontend loads but shows no data

The frontend is almost never the cause — check the backend first:

```bash
curl http://localhost:8000/webbing/?limit=1
```

- **HTTP 500 on every endpoint** — the backend process is unhealthy. The most common cause is a
  broken environment (e.g. a corrupt `sniffio`/`anyio` install breaks every request with a 500).
  Recreate the env cleanly with `uv sync` and run the backend from `.venv`, or reinstall the
  offending package (`pip install --force-reinstall sniffio`) **and restart the server** —
  `fastapi dev` reloads on source edits, not on dependency changes.
- **Connection refused** — the backend isn't running, or not on port 8000.
- **Empty array `[]`** — the DB seeded with no rows; delete `slack_data/database.db` and restart to
  re-seed from the root `*.json` files.

> Note: `uv` creates **`.venv`**; the pip path below creates **`venv`**. Don't mix them — activate
> and run the backend from whichever one you installed into.

---

## Frontend

A React + TypeScript + Vite app, built TDD against a red-first Cypress E2E suite that runs on the
real backend. Nav, gear listing, and cards are in place; filters, detail, compare, and manufacturers
are in progress.

**Build status and the phase-by-phase roadmap live in [PLAN.md](PLAN.md); the visual/UX spec is in [DESIGN.md](DESIGN.md).**

### Setup

```bash
cd frontend
npm install
```

### Run

```bash
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

### Tests (Cypress E2E)

Tests run against the real backend, so the backend must be running on port 8000 before launching Cypress.

```bash
# Open Cypress interactively
npm run cypress:open

# Run headlessly
npm run cypress:run
```

---

## Backend

### Setup

**with uv:**
```bash
uv sync
source .venv/bin/activate
```

**with pip:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install '-e.[dev]'
```

### Run

```bash
cd slack_datacd slack_data
fastapi dev main.py
```

API runs at [http://127.0.0.1:8000](http://127.0.0.1:8000). Append `/docs` for the interactive OpenAPI explorer.

1. Activate environment (if not already activated)
    - `source venv/bin/activate`
2. Navigate to backend folder
    - `cd slack_data`
3. Run server
    - `fastapi dev main.py`
4. Open browser and go to URL printed in terminal
    - Append `/docs` to see the interactive API docs
    - Most likely [http://127.0.0.1:8000/docs]

## Testing

The test suite covers all active gear types with CRUD, pagination, and loader logic tests.

### Setup

```bash
python3 -m venv .venv
source .venv/bin/activate       # Linux/Mac
# .venv\Scripts\activate        # Windows
pip install -e ".[dev]"
```

Or with uv:

```bash
uv sync
```

### Running

```bash
pytest
```
