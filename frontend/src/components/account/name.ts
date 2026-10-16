// The name a person types in — shown publicly with their changes. The limit
// mirrors MAX_DISPLAY_NAME_LENGTH in slack_data/models/people.py.

import type { Me } from '@/types'

export const MAX_NAME_LENGTH = 100

/** What the name field starts with: the name they gave, else one the token
 *  carried — never the ISA id the API falls back to. */
export function suggestedName(me: Me): string {
  return me.name_set || me.name !== me.isa_id ? me.name : ''
}
