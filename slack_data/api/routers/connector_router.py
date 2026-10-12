from slack_data.api.routers._crud import crud_router
from slack_data.models.connectors import (
    Connector,
    ConnectorCreate,
    ConnectorPublic,
    ConnectorUpdate,
)

connector_router = crud_router(
    prefix="connector",
    model=Connector,
    create_model=ConnectorCreate,
    public_model=ConnectorPublic,
    update_model=ConnectorUpdate,
)
