from slack_data.api.routers._crud import crud_router
from slack_data.models.starterkits import StarterKit, StarterKitCreate, StarterKitPublic, StarterKitUpdate

starterkit_router = crud_router(
    prefix="starterkit",
    model=StarterKit,
    create_model=StarterKitCreate,
    public_model=StarterKitPublic,
    update_model=StarterKitUpdate,
)
