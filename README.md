# SlackData

SlackData is a database of slackline gear, inspired by [SlackDB](https://slackdb.com/).

SlackData is open source, with an open API to allow other tools to use the database.

**Stack:** Python / FastAPI / SQLModel / SQLite backend + React / TypeScript / Vite frontend.

---

## Frontend

The frontend is scaffolded (React, TypeScript, Vite) with a full Cypress E2E test suite written red-first against the real backend. UI implementation has not started yet.

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
cd slack_data
fastapi dev main.py
```

API runs at [http://127.0.0.1:8000](http://127.0.0.1:8000). Append `/docs` for the interactive OpenAPI explorer.

> The database is seeded automatically on first run. To re-seed after editing JSON files, delete `slack_data/database.db` and restart.
