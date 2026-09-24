// The ISA's own pages that SlackData points at, plus the /safety anchor that
// explains how we record certification. Shared by SafetyPage and the note under
// the ISA stamp on detail pages, so the two surfaces cannot link to different
// places.

export const ISA_STANDARDS_URL = 'https://www.slacklineinternational.org/isa-gear-standards/'
export const ISA_APPROVED_GEAR_URL =
  'https://data.slacklineinternational.org/safety/isa-approved-gear/'
export const ISA_WARNINGS_URL = 'https://data.slacklineinternational.org/safety/isa-gear-warnings/'

// Section id on SafetyPage. It is the fragment in `/safety#isa-certification`,
// so renaming it breaks every link the detail pages render.
export const ISA_CERTIFICATION_ANCHOR = 'isa-certification'
