from enum import Enum


class MetalMaterial(str, Enum):
    ALUMINUM = "Aluminum"
    STEEL = "Steel"
    STAINLESS_STEEL = "Stainless Steel"
    TITANIUM = "Titanium"
    OTHER = "Other"

class RollerMaterial(str, Enum):
    ALUMINUM = "Aluminum"
    STEEL = "Steel"
    STAINLESS_STEEL = "Stainless Steel"
    PLASTIC = "Plastic"
    OTHER = "Other"
    
def get_metal_material(material: str | list[str] | None) -> MetalMaterial:
    """
    Convert the material string or list to a MetalMaterial enum.
    If material is a list, uses the first item.
    """
    if not material:
        return MetalMaterial.OTHER
    
    # Handle list input by taking the first item
    if isinstance(material, list):
        if not material:  # Empty list
            return MetalMaterial.OTHER
        material_str = material[0]
    else:
        material_str = material
    
    material_str = material_str.lower()
    if "aluminum" in material_str:
        return MetalMaterial.ALUMINUM
    elif "stainless" in material_str:
        return MetalMaterial.STAINLESS_STEEL
    elif "steel" in material_str:
        return MetalMaterial.STEEL
    elif "titanium" in material_str:
        return MetalMaterial.TITANIUM
    else:
        return MetalMaterial.OTHER
