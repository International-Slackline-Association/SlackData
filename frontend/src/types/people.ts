// Mirrors slack_data/models/people.py (Me, Role) and slack_data/models/changes.py
// (ChangeRecordPublic). Read those files before changing anything here.

export type Role = 'admin'

/** `GET /me` — the signed-in person's own view of themselves. */
export interface Me {
  sub: string
  isa_id: string
  name: string
  email: string | null
  email_verified: boolean
  roles: Role[]
  /** The brands this person represents (phase 5), by name as items carry it. */
  brands: { catalog_id: number; name: string }[]
  notice_seen_at: string | null
  /** False until the person has typed in the name shown with their changes. */
  name_set: boolean
  /** True until they have used their one lifetime change of that name. */
  name_change_available: boolean
  /** Set while an admin has blocked this account from editing (D22): why. */
  blocked_reason: string | null
  blocked_at: string | null
  dev: boolean
}

/** `GET /admin/people/blocked`, and the answer to a block or unblock. */
export interface BlockedSummary {
  isa_id: string
  name: string
  blocked_at: string | null
  blocked_reason: string | null
  blocked_by: string | null
}

/** `GET /admin/admins` and `POST /admin/roles`. */
export interface AdminSummary {
  isa_id: string
  name: string
  email: string | null
}

export interface RoleChange {
  email?: string
  isa_id?: string
  role?: Role
  grant?: boolean
  why?: string
}

export interface FieldChange {
  before: unknown
  after: unknown
}

/** `GET /changes` — one public change log record. */
export interface ChangeRecordPublic {
  id: string
  target_type: 'person' | 'item' | 'brand' | 'isa_warning' | 'isa_certificate'
  /** For an item: "<collection>#<id>", e.g. "webbings#12". */
  target_id: string
  /** What the target is called now, looked up when the log is read; null when unknown. */
  target_name: string | null
  action:
    | 'role.grant'
    | 'role.revoke'
    | 'item.create'
    | 'item.edit'
    | 'item.hide'
    | 'item.unhide'
    | 'item.merge'
    | 'item.revert'
    | 'brand.create'
    | 'brand.edit'
    | 'match.repoint'
    | 'brand.link'
    | 'brand.unlink'
    | 'key.create'
    | 'key.regenerate'
    | 'key.revoke'
    | 'person.block'
    | 'person.unblock'
    | 'isa.create'
    | 'isa.edit'
    | 'isa.retire'
  actor_isa_id: string
  actor_name: string
  actor_role: string
  channel: 'web' | 'bootstrap' | 'manufacturer-api' | 'import' | 'revert' | 'merge'
  changes: Record<string, FieldChange>
  why: string | null
  /** 'safety' when a breaking strength changed. */
  flags: string[]
  /** On a revert: the record whose change it undoes. */
  reverts: string | null
  created_at: string
}
