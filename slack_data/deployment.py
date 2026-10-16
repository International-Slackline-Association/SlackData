"""
Is this process the live site? — the one answer every fail-closed guard asks.

Things fail closed when hosted and open up locally: the admin dev token, the
dev person token and the manufacturer dev token (all in `api/auth.py`), and the
local media routes (`api/routers/media_router.py`). The dev tokens are
in this public repository, so "hosted" being answered wrong is the difference
between a locked admin API and one whose password anyone can read.

That answer used to be `database.READ_ONLY`, i.e. "a catalogue file was baked
into the image". Live editing (LIVE_EDITING_PLAN.md, phase 2) stops baking one,
and from that deploy on the old answer would have been *no* — with the Cognito
pool gone too (phase 1, D62), both dev tokens would then have been accepted in
production. So hosted is now any of three independent signals, and losing one
of them does not open anything:

| signal | set by |
|---|---|
| `AWS_LAMBDA_FUNCTION_NAME` | the Lambda runtime itself — nothing in our config can forget it |
| `SLACKDATA_DEPLOYMENT=hosted` | `Dockerfile.lambda` and `infra/serverless.yml`, saying it outright |
| `database.READ_ONLY` | the baked catalogue, while there still is one |

Read at call time, not import time, so tests can set each case.
"""

import os

HOSTED_VALUE = "hosted"


def is_hosted() -> bool:
    from slack_data import database

    if os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        return True
    if (os.getenv("SLACKDATA_DEPLOYMENT") or "").strip().lower() == HOSTED_VALUE:
        return True
    return bool(database.READ_ONLY)
