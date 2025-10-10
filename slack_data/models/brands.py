from pydantic import computed_field
from sqlmodel import Field, Relationship, SQLModel

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
    webbing: list["Webbing"] = Relationship(back_populates="brand")
    weblock: list["Weblock"] = Relationship(back_populates="brand")
    roller: list["Roller"] = Relationship(back_populates="brand")
    
    @computed_field
    def webbings(self) -> list[str]:
        """
        Computed field to get the names of all webbings associated with this brand.
        """
        return [webbing.name for webbing in self.webbing]
    
    @computed_field
    def weblocks(self) -> list[str]:
        """
        Computed field to get the names of all weblocks associated with this brand.
        """
        return [weblock.name for weblock in self.weblock]
    
    @computed_field
    def rollers(self) -> list[str]:
        """
        Computed field to get the names of all rollers associated with this brand.
        """
        return [roller.name for roller in self.roller]
    

    
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