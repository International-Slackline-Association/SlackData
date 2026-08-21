from slack_data.api.routers._crud import crud_router
from slack_data.models.weblocks import Weblock, WeblockCreate, WeblockPublic, WeblockUpdate

weblock_router = crud_router(
    prefix="weblock",
    model=Weblock,
    create_model=WeblockCreate,
    public_model=WeblockPublic,
    update_model=WeblockUpdate,
)
