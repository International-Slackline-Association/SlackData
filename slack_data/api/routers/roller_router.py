from slack_data.api.routers._crud import crud_router
from slack_data.models.rollers import Roller, RollerCreate, RollerPublic, RollerUpdate

roller_router = crud_router(
    prefix="roller",
    model=Roller,
    create_model=RollerCreate,
    public_model=RollerPublic,
    update_model=RollerUpdate,
)
