# SlackData

SlackData is a database of slackline gear, inspired by [SlackDB](https://slackdb.com/).

SlackData is open source, with an open API to allow other tools to use the database.

The project is still in it's early stages, so currently the only option is to run the backend locally.

## Backend

### Installation

1. Create and activate a new python environment:
- with uv: 
    1. `uv venv`
    2. `source venv/bin/activate`

- with standard python
    1. `python3 -m venv venv`
    2. `source venv/bin/activate`

2. Install dependencies
- for uv: `uv sync`
- for python: `pip install '-e.[dev]'`

### Running

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