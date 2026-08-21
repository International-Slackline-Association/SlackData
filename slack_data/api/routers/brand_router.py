from slack_data.api.routers._crud import crud_router
from slack_data.models.brands import Brand, BrandCreate, BrandPublic, BrandUpdate

brand_router = crud_router(
    prefix="brand",
    model=Brand,
    create_model=BrandCreate,
    public_model=BrandPublic,
    update_model=BrandUpdate,
)
