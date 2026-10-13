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
  notice_seen_at: string | null
  dev: boolean
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
  target_type: 'person'
  target_id: string
  action: 'role.grant' | 'role.revoke'
  actor_isa_id: string
  actor_name: string
  actor_role: string
  channel: 'web' | 'bootstrap' | 'manufacturer-api' | 'import'
  changes: Record<string, FieldChange>
  why: string | null
  flags: string[]
  created_at: string
}
