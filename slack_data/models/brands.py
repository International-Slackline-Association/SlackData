from pydantic import computed_field
from sqlmodel import select, Field, Relationship, SQLModel

from slack_data.database import SessionDep
from slack_data.utilities.countries import Country

class BaseBrands(SQLModel):
    """
    Base class for brands/manufacturers.
    """
    name: str = Field(index=True)
    country: Country | None = None
    year_founded: int | None = None
    active: bool = True
    slackline_focused: bool = True
    website: str | None = None
    socials: str | None = None
    description: str | None = None
    notes: str | None = None

class Brand(BaseBrands, table=True):
    id: int | None = Field(default=None, primary_key=True)
    _webbings: list["Webbing"] = Relationship(back_populates="brand")
    _weblocks: list["Weblock"] = Relationship(back_populates="brand")
    _rollers: list["Roller"] = Relationship(back_populates="brand")
    _leashrings: list["LeashRing"] = Relationship(back_populates="brand")
    _grips: list["Grip"] = Relationship(back_populates="brand")
    _treepros: list["TreePro"] = Relationship(back_populates="brand")
    _starterkits: list["StarterKit"] = Relationship(back_populates="brand")
    _tricklinekits: list["TricklineKit"] = Relationship(back_populates="brand")

    
    @computed_field
    def webbings(self) -> list[str]:
        """
        Computed field to get the names of all webbings associated with this brand.
        """
        return [webbing.name for webbing in self._webbings]
    
    @computed_field
    def weblocks(self) -> list[str]:
        """
        Computed field to get the names of all weblocks associated with this brand.
        """
        return [weblock.name for weblock in self._weblocks]
    
    @computed_field
    def rollers(self) -> list[str]:
        """
        Computed field to get the names of all rollers associated with this brand.
        """
        return [roller.name for roller in self._rollers]
    
    @computed_field
    def leashrings(self) -> list[str]:
        """
        Computed field to get the names of all leash rings associated with this brand.
        """
        return [leashring.name for leashring in self._leashrings]

    @computed_field
    def grips(self) -> list[str]:
        """
        Computed field to get the names of all grips associated with this brand.
        """
        return [grip.name for grip in self._grips]

    @computed_field
    def treepros(self) -> list[str]:
        """
        Computed field to get the names of all tree protectors associated with this brand.
        """
        return [treepro.name for treepro in self._treepros]

    @computed_field
    def starterkits(self) -> list[str]:
        """
        Computed field to get the names of all starter kits associated with this brand.
        """
        return [starterkit.name for starterkit in self._starterkits]
    
    @computed_field
    def tricklinekits(self) -> list[str]:
        """
        Computed field to get the names of all trickline kits associated with this brand.
        """
        return [tricklinekit.name for tricklinekit in self._tricklinekits]
    
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
    
class BrandPublic(BaseBrands):
    """
    Model for public brand data.
    """

    webbings: list[str]


class BrandCreate(BaseBrands):
    """
    Model for creating a new brand entry.
    """
    
    class Config:
        exclude = ["id"]
        validate_assignment = True

class BrandUpdate(BaseBrands):
    """
    Model for updating an existing brand entry.
    """
    
    class Config:
        exclude = ["id"]
        validate_assignment = True
        extra = "forbid"