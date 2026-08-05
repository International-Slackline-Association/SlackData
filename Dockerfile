# SlackData — single-container image.
#
# One FastAPI process serves BOTH the JSON API and the built React SPA on the
# same origin, backed by a SQLite database that seeds itself from the bundled
# root *.json files on first startup. No external database, no CORS, nothing
# else to run. Hand this image to a host, point a domain at it, terminate TLS
# in front of it — that's the whole deployment.
#
#   docker build -t slackdata .
#   docker run --rm -p 8000:8000 slackdata   # → http://localhost:8000

# ---- Stage 1: build the frontend (Vite → static assets) --------------------
FROM node:22-slim AS web
WORKDIR /app/frontend

# Install deps against the lockfile first for better layer caching.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build. frontend/.env.production sets VITE_API_URL="" → same-origin API calls.
COPY frontend/ ./
RUN npm run build          # → /app/frontend/dist

# ---- Stage 2: the FastAPI runtime -----------------------------------------
FROM python:3.12-slim AS runtime
WORKDIR /app

# slack_data uses absolute imports (`from slack_data....`); PYTHONPATH=/app lets
# uvicorn import the package straight from the copied source (no pip-install of
# the app itself, so the loaders' __file__-relative paths to the root *.json
# resolve correctly at /app/*.json).
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1

# fastapi[standard] pulls in uvicorn; mirror the pyproject.toml floors.
RUN pip install --no-cache-dir "fastapi[standard]>=0.115.12" "sqlmodel>=0.0.24"

# Backend source + the seed data it reads on boot.
COPY slack_data/ ./slack_data/
COPY *.json ./

# The built SPA, at the path main.py looks for by default (/app/frontend/dist).
COPY --from=web /app/frontend/dist ./frontend/dist

EXPOSE 8000

# Single worker on purpose: each worker would otherwise race to seed the same
# SQLite file on cold start. One process is ample for a read-only browse site;
# scale later by baking a pre-seeded DB into the image (see GOING_LIVE.md).
CMD ["uvicorn", "slack_data.main:app", "--host", "0.0.0.0", "--port", "8000"]
