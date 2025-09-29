from sqlmodel import select

from slack_data.database import SessionDep
from slack_data.models.brands import Brand, BrandCreate


def get_brand(session: SessionDep, brand_cache: dict[str, int] | None, item: dict) -> tuple[int,dict]:
    brand_name = str(item.get("brand"))
    if brand_name not in brand_cache:
        # get brand_id from the database or create it if it doesn't exist
        statement = select(Brand.id).where(Brand.name == brand_name)
        result = session.exec(statement).first()
        if result is None:
            # Create a new brand entry if it doesn't exist
            brand_create = BrandCreate(name=brand_name)
            db_brand = Brand.model_validate(brand_create)
            print(f"Adding brand: {db_brand.name}")
            session.add(db_brand)
            session.commit()
            session.refresh(db_brand)
            brand_id = db_brand.id
        else:
            brand_id = result

        if brand_id is None:
            raise ValueError(f"Brand ID for '{brand_name}' could not be determined.")
        
        brand_cache[brand_name] = brand_id
    brand_id = brand_cache[brand_name]
    return brand_id, brand_cache