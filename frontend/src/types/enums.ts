// Enum values mirrored from slack_data/models/*.py and slack_data/utilities/*.py.
// The backend uses Python Enums; the tsconfig has `erasableSyntaxOnly`, so we
// model them as string-literal unions plus `as const` arrays (usable at runtime
// for labels/ordering) instead of TS enums.

// utilities/materials.py — MetalMaterial
export const METAL_MATERIALS = [
  'Aluminum', 'Steel', 'Stainless Steel', 'Titanium', 'Other',
] as const
export type MetalMaterial = (typeof METAL_MATERIALS)[number]

// utilities/materials.py — RollerMaterial
export const ROLLER_MATERIALS = [
  'Aluminum', 'Steel', 'Stainless Steel', 'Plastic', 'Other',
] as const
export type RollerMaterial = (typeof ROLLER_MATERIALS)[number]

// utilities/isa_warnings.py — ISAWarning
export const ISA_WARNINGS = ['Recall', 'Warning', 'Notice', 'No Warning'] as const
export type ISAWarning = (typeof ISA_WARNINGS)[number]

// models/webbing.py — FiberMaterial
export const FIBER_MATERIALS = [
  'Nylon', 'Polyester', 'Dyneema/HMPE', 'Vectran', 'Other',
] as const
export type FiberMaterial = (typeof FIBER_MATERIALS)[number]

// models/webbing.py — Classification
export const CLASSIFICATIONS = ['A+', 'A', 'B', 'C', 'Not for Highline'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

// models/webbing.py — WebbingConstruction
export const WEBBING_CONSTRUCTIONS = ['Flat', 'Tubular', 'Core/Sheath', 'Other'] as const
export type WebbingConstruction = (typeof WEBBING_CONSTRUCTIONS)[number]

// models/weblocks.py — FrontPin
export const FRONT_PINS = [
  'Push Pin', 'Pull Pin', 'Captive Pin', 'Fixed Bolt', 'Other',
] as const
export type FrontPin = (typeof FRONT_PINS)[number]

// models/weblocks.py — AttachmentPoint
export const ATTACHMENT_POINTS = [
  'Universal', 'Hole', 'Pin', 'Bolt', 'Bent Plate', 'Sling', 'Other',
] as const
export type AttachmentPoint = (typeof ATTACHMENT_POINTS)[number]

// models/grips.py — ConnectionType
export const CONNECTION_TYPES = [
  'Dyneema Sling Loop', 'Sling Loop', 'Mounting Hole', 'Other',
] as const
export type ConnectionType = (typeof CONNECTION_TYPES)[number]

// models/rollers.py — SliderType
export const SLIDER_TYPES = [
  'Moving plates', 'Carabiner', 'Locking Carabiner', 'Other',
] as const
export type SliderType = (typeof SLIDER_TYPES)[number]

// models/rollers.py — LockType
export const LOCK_TYPES = [
  'Non-locking', 'Screw Lock', 'Auto Lock', 'Twist Lock', 'Magnetic Lock', 'Other',
] as const
export type LockType = (typeof LOCK_TYPES)[number]

// models/rollers.py — BearingMaterial
export const BEARING_MATERIALS = ['Stainless Steel', 'Steel', 'Other'] as const
export type BearingMaterial = (typeof BEARING_MATERIALS)[number]

// models/starterkits.py — TensioningType (includes Primitive)
export const STARTERKIT_TENSIONING_TYPES = [
  'Single Ratchet', 'Double Ratchet', 'Primitive', 'Other',
] as const
export type StarterKitTensioningType = (typeof STARTERKIT_TENSIONING_TYPES)[number]

// models/tricklinekits.py — TensioningType (no Primitive)
export const TRICKLINEKIT_TENSIONING_TYPES = [
  'Single Ratchet', 'Double Ratchet', 'Other',
] as const
export type TricklineKitTensioningType = (typeof TRICKLINEKIT_TENSIONING_TYPES)[number]

// models/treepro.py — PriceUnit
export const PRICE_UNITS = ['single', 'pair'] as const
export type PriceUnit = (typeof PRICE_UNITS)[number]

// utilities/currencies.py — Currency (ISO 4217). Kept as a plain string union
// alias; the full list is rarely needed on the client, so we don't enumerate it.
export type Currency = string

// utilities/countries.py — Country. Aliased to string: the client never needs to
// enumerate the members, only to display one and map it to a flag (see
// utils/countryFlags.ts). Values are full display names ("Germany"), not ISO
// codes — the manufacturers.json enrichment pass resolves codes to enum members
// server-side, so every brand carries a country today.
export type Country = string
