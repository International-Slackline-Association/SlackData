// Mirrors slack_data/api/routers/brand_requests_router.py and
// brand_keys_router.py (phase 5). Read those first.

export type RequestStatus = 'pending' | 'approved' | 'declined'

/** A request to represent a brand, as its asker sees it. */
export interface BrandRequest {
  request_id: string
  catalog_id: number
  brand_name: string
  note: string | null
  email_domain_matches: boolean
  status: RequestStatus
  created_at: string
  decided_at: string | null
  decision_note: string | null
}

/** As the admin queue shows it: who asked, and the domain signal (D5). */
export interface BrandRequestAdmin extends BrandRequest {
  isa_id: string
  person_name: string
  email_domain: string | null
  email_verified: boolean
  brand_website: string | null
}

/** A brand's machine API key. `key` is what the brand sends (D65). */
export interface BrandKey {
  client_id: string
  key: string | null
  active: boolean
  created_at: string
  note: string | null
}
