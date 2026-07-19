// Gear item types — one interface per gear type, mirroring the `*Public`
// response models in slack_data/models/*.py exactly.
//
// NOTE on `id`: the `*Public` models currently omit `id`, so the live API does
// not return it yet (Phase 0 adds it). The types below declare it because the
// whole app — detail routes, card links, compare — is built against that
// contract. Until Phase 0 lands, detail/compare features will not resolve.

import type {
  AttachmentPoint, BearingMaterial, Classification, ConnectionType, Currency,
  FiberMaterial, FrontPin, ISAWarning, LockType, MetalMaterial, PriceUnit,
  RollerMaterial, SliderType, StarterKitTensioningType, TricklineKitTensioningType,
  WebbingConstruction,
} from './enums'

// Fields shared by every gear type (from each Base* class + the brand_name
// computed field, plus the id we add in Phase 0).
export interface GearBase {
  id: number
  name: string
  release_date: number | null
  product_url: string | null
  weight: number | null
  price: number | null
  currency: Currency | null
  description: string | null
  version: string | null
  notes: string | null
  brand_name: string
}

export interface Webbing extends GearBase {
  // multi-select: one entry per fiber, e.g. ["Polyester", "Dyneema/HMPE"]
  material: FiberMaterial[]
  webbing_construction: WebbingConstruction | null
  width: number
  thickness: number | null
  breaking_strength: number | null
  stretch: string | null // JSON array: [{"kn": 0, "percent": 0.0}, ...]
  isa_certified: boolean
  classification: Classification | null
  isa_warning: ISAWarning | null
  colors: string | null
}

export interface Weblock extends GearBase {
  material: MetalMaterial
  width_min: number
  width_max: number | null
  breaking_strength: number | null
  front_pin: FrontPin | null
  attachment_point: AttachmentPoint | null
  isa_certified: boolean
  isa_warning: ISAWarning | null
  colors: string | null
}

export interface LeashRing extends GearBase {
  material: MetalMaterial
  inner_diameter: number | null
  outer_diameter: number | null
  breaking_strength: number | null
  isa_certified: boolean
  isa_warning: ISAWarning | null
}

export interface Grip extends GearBase {
  material: MetalMaterial
  width_min: number
  width_max: number | null
  wll: number | null
  mbs: number | null
  common_slipping_threshold: number | null
  connection_type: ConnectionType | null
  isa_certified: boolean
  isa_warning: ISAWarning | null
}

export interface Roller extends GearBase {
  material: MetalMaterial[] // JSON column: frame can be multiple materials
  roller_material: RollerMaterial
  slider_type: SliderType
  lock_type: LockType
  bearing_material: BearingMaterial
  width: string | null // raw range text e.g. "25–35mm" — not numeric
  breaking_strength: number | null
  isa_certified: boolean
  isa_warning: ISAWarning | null
  colors: string | null
}

export interface TreePro extends GearBase {
  width: number | null
  length: number | null
  thickness: number | null
  has_sling_attachment: boolean
  price_unit: PriceUnit | null
  // NOTE: no isa_certified, no isa_warning on this model.
}

export interface StarterKit extends GearBase {
  webbing_length: number
  webbing_width: number
  tensioning_type: StarterKitTensioningType
  includes_treepro: boolean
  isa_certified: boolean
  // NOTE: no isa_warning on this model.
}

export interface TricklineKit extends GearBase {
  webbing_length: number
  webbing_width: number
  tensioning_type: TricklineKitTensioningType
  includes_treepro: boolean
  isa_certified: boolean
  // NOTE: no isa_warning on this model.
}

// Union of every concrete gear item.
export type GearItem =
  | Webbing | Weblock | LeashRing | Grip | Roller | TreePro | StarterKit | TricklineKit

// URL slugs (mirror config/gearTypes.ts). The first eight are data-backed and
// covered by the test suite; the last two are upcoming categories with no data
// yet (shown in the nav, listing renders a "coming soon" state).
export type GearSlug =
  | 'webbings' | 'weblocks' | 'leashrings' | 'grips'
  | 'rollers' | 'treepros' | 'starterkits' | 'tricklinekits'
  | 'bungees' | 'leashringpro'
