from slack_data.api.routers._crud import crud_router
from slack_data.models.leashes import Leash, LeashCreate, LeashPublic, LeashUpdate

leash_router = crud_router(
    prefix="leash",
    model=Leash,
    create_model=LeashCreate,
    public_model=LeashPublic,
    update_model=LeashUpdate,
    collection="leashes",
)
