from slack_data.api.routers._crud import crud_router
from slack_data.models.tricklinekits import TricklineKit, TricklineKitCreate, TricklineKitPublic, TricklineKitUpdate

tricklinekit_router = crud_router(
    prefix="tricklinekit",
    model=TricklineKit,
    create_model=TricklineKitCreate,
    public_model=TricklineKitPublic,
    update_model=TricklineKitUpdate,
)
