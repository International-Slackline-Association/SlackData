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

from slack_data.api.routers.submissions_router import warn_if_captcha_is_unconfigured
from slack_data.database import create_db_and_tables
from slack_data.main import app

create_db_and_tables()

# Called here and not only from main.py's lifespan, because `lifespan="off"`
# below means the lifespan never runs in Lambda — so a startup check placed
# there fires locally, passes its test, and is silent in the one environment it
# exists for. This module IS the hosted cold-start path.
warn_if_captcha_is_unconfigured()

handler = Mangum(app, lifespan="off")
