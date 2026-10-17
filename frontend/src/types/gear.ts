// Gear item types — one interface per gear type, mirroring the `*Public`
// response models in slack_data/models/*.py exactly.
//
// NOTE on `id`: the `*Public` models currently omit `id`, so the live API does
// not return it yet (Phase 0 adds it). The types below declare it because the
// whole app — detail routes, card links, compare — is built against that
// contract. Until Phase 0 lands, detail/compare features will not resolve.

import type {
  AttachmentPoint, BearingMaterial, ConnectionType, ConnectorClosure, ConnectorMaterial,
  ConnectorStyle, CoreType, Currency,
  FiberMaterial, FrontPin, ISAWarning, LeashConstruction, LockType, MetalMaterial, PriceUnit,
  RingConnection, RollerMaterial, SleeveMaterial, SliderType, StarterKitTensioningType,
  TricklineKitTensioningType, WebbingConstruction, WeblockStyle,
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
  // For-sale status: true = active (still sold), false = historic (discontinued).
  // null = unknown/not yet verified.
  active: boolean | null
  brand_name: string
  // The brands that SELL this product without making it — `brand_name` is only
  // ever the maker. Names, resolved to the catalogue's own spelling at seed
  // time. null when none are recorded. See CLAUDE.md § Co-listings.
  gear_sellers: string[] | null
  // The maker's own statement that this is not for highlining — researched from
  // their product page, never computed from breaking strength. true = they say
  // so, false = they market it for highlining, null = not yet checked or the
  // page is silent. `_source` is the URL that supports the value.
  manufacturer_not_for_highline: boolean | null
  manufacturer_not_for_highline_source: string | null
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
  isa_certificate: string | null
  // The ISA class letter (A+/A/B/C): the certificate's own, else derived from
  // breaking_strength by the loader. Only ever set on a certified webbing.
  isa_class: string | null
  isa_warning: ISAWarning | null
  colors: string | null
}

export interface Weblock extends GearBase {
  style: WeblockStyle | null
  material: MetalMaterial[] // JSON column: frame and pins can be different metals
  width_min: number
  width_max: number | null
  breaking_strength: number | null
  front_pin: FrontPin | null
  attachment_point: AttachmentPoint | null
  isa_certified: boolean
  isa_certificate: string | null
  isa_warning: ISAWarning | null
  colors: string | null
}

export interface LeashRing extends GearBase {
  material: MetalMaterial
  inner_diameter: number | null
  outer_diameter: number | null
  breaking_strength: number | null
  isa_certified: boolean
  isa_certificate: string | null
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
  isa_certificate: string | null
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
  isa_certificate: string | null
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
  // NOTE: no isa_certified and no isa_warning on this model — a kit is a
  // bundle, not a component the ISA certifies.
}

export interface TricklineKit extends GearBase {
  webbing_length: number
  webbing_width: number
  tensioning_type: TricklineKitTensioningType
  includes_treepro: boolean
  // NOTE: no isa_certified and no isa_warning on this model — a kit is a
  // bundle, not a component the ISA certifies.
}

export interface Connector extends GearBase {
  connector_style: ConnectorStyle
  closure: ConnectorClosure | null
  material: ConnectorMaterial
  alloy: string | null
  // Breaking strengths as the maker states them, kN. Never a WLL.
  mbs_straight_pull: number | null
  mbs_crossload: number | null
  mbs_gate_open: number | null
  // mm: a shackle's jaw width, a carabiner's or quicklink's gate opening, a soft
  // shackle's inner loop size.
  opening: number | null
  pin_diameter: number | null
  // The pin stays in the body once unscrewed. false where the shop doesn't say.
  captive_pin: boolean
  rope_diameter: number | null
  // What the MAKER claims (e.g. "EN362:2005") — not a certification.
  standards: string[] | null
  standards_source: string | null
  isa_certified: boolean
  isa_certificate: string | null
  isa_warning: ISAWarning | null
}

// One leash ring a leash is sold with, as an option (`count` of them).
export interface RingOption {
  leashring_id: number
  count: number
}

// One row per LENGTH a maker sells; the lengths of one leash share
// `product_group` (LEASHES_REVIEW.md § Q4). Leashes carry no
// manufacturer_not_for_highline field (§ Q9).
export interface Leash
  extends Omit<GearBase, 'manufacturer_not_for_highline' | 'manufacturer_not_for_highline_source'> {
  construction: LeashConstruction
  ring_end: RingConnection | null
  core_type: CoreType | null
  core_rope: string | null
  core_diameter: number | null  // mm
  sleeve_material: SleeveMaterial | null
  sleeve_width: number | null   // mm
  diameter: number | null       // mm, overall
  length: number | null         // cm
  // The leash's own stated strength, kN; the lower one where the maker states two.
  breaking_strength: number | null
  // The leash rings it is sold with; null = sold without, or not researched.
  ring_options: RingOption[] | null
  twist_marker: boolean | null
  product_group: string | null
  isa_certified: boolean
  isa_certificate: string | null
  isa_warning: ISAWarning | null
}

// Union of every concrete gear item.
export type GearItem =
  | Webbing | Weblock | LeashRing | Grip | Roller | TreePro | StarterKit | TricklineKit
  | Connector | Leash

// URL slugs (mirror config/gearTypes.ts). The first ten are data-backed and
// covered by the test suite; the last two are upcoming categories with no data
// yet (shown in the nav, listing renders a "coming soon" state).
export type GearSlug =
  | 'webbings' | 'weblocks' | 'leashrings' | 'grips'
  | 'rollers' | 'treepros' | 'starterkits' | 'tricklinekits' | 'connectors'
  | 'leashes'
  | 'bungees' | 'leashringpro'
