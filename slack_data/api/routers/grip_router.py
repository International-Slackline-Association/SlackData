from slack_data.api.routers._crud import crud_router
from slack_data.models.grips import Grip, GripCreate, GripPublic, GripUpdate

grip_router = crud_router(
    prefix="grip",
    model=Grip,
    create_model=GripCreate,
    public_model=GripPublic,
    update_model=GripUpdate,
)
