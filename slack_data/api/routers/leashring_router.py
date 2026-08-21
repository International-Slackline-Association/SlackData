from slack_data.api.routers._crud import crud_router
from slack_data.models.leashrings import LeashRing, LeashRingCreate, LeashRingPublic, LeashRingUpdate

leashring_router = crud_router(
    prefix="leashring",
    model=LeashRing,
    create_model=LeashRingCreate,
    public_model=LeashRingPublic,
    update_model=LeashRingUpdate,
)
