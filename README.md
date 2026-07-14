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
