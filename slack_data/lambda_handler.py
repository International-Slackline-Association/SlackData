"""AWS Lambda entrypoint.

The Lambda image's CMD is ``slack_data.lambda_handler.handler``. Mangum adapts
the FastAPI ASGI app to the API Gateway (HTTP API) event/response model.

Mangum runs the ASGI *lifespan* around every invocation, but our lifespan calls
``create_db_and_tables()`` — which is single-shot and raises if the engine
already exists. So we initialise the read-only engine ONCE here at cold start and
run Mangum with ``lifespan="off"``. (There is nothing to start up per request:
the catalog is a pre-built read-only SQLite baked into the image.)
"""

from mangum import Mangum

from slack_data.database import create_db_and_tables
from slack_data.main import app

create_db_and_tables()
handler = Mangum(app, lifespan="off")
