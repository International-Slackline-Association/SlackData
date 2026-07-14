// Brand (manufacturer) type — mirrors BrandPublic in slack_data/models/brands.py.
//
// BrandPublic exposes only `webbings` among the gear lists (the other gear-type
// computed fields exist on the ORM model but are not declared in the response
// schema). `id` is added in Phase 0 for routing. Gear counts per type are NOT
// provided by the API — the client computes them by fetching each gear endpoint.

import type { Country } from './enums'

export interface Brand {
  id: number
  name: string
  country: Country | null
  year_founded: number | null
  active: boolean
  slackline_focused: boolean
  website: string | null
  socials: string | null
  description: string | null
  notes: string | null
  webbings: string[]
}
