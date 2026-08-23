from slack_data.api.routers._crud import crud_router
from slack_data.models.webbing import Webbing, WebbingCreate, WebbingPublic, WebbingUpdate

webbing_router = crud_router(
    prefix="webbing",
    model=Webbing,
    create_model=WebbingCreate,
    public_model=WebbingPublic,
    update_model=WebbingUpdate,
)
