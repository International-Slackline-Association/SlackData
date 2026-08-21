from slack_data.api.routers._crud import crud_router
from slack_data.models.treepro import TreePro, TreeProCreate, TreeProPublic, TreeProUpdate

treepro_router = crud_router(
    prefix="treepro",
    model=TreePro,
    create_model=TreeProCreate,
    public_model=TreeProPublic,
    update_model=TreeProUpdate,
)
