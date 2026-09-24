// Which official ISA stamp PNG (frontend/public/isa-labels/) a certified item
// shows. One file per standard, and per class on ISA:41 webbing.
//
// The letter comes from the certificate itself (`ISA:41:A+`) and, failing
// that, from the gear row's `isa_class` — the loader derives it from breaking
// strength for a letterless ISA:41 certificate, so every certified webbing has
// a stamp. Anything that maps to no file returns null, and the badge falls back
// to its drawn version: a missing image must never blank the certification.

// `+` is spelled `plus` in the filename rather than URL-encoded — a literal `+`
// in a path is read as a space by some servers and CDNs.
export const ISA_STAMP_FILES = [
  'ISA21', 'ISA22', 'ISA37',
  'ISA41Aplus', 'ISA41A', 'ISA41B', 'ISA41C',
  'ISA51', 'ISA52', 'ISA53', 'ISA61',
] as const

const KNOWN = new Set<string>(ISA_STAMP_FILES)

export function isaStampPath(
  certificate: string | null | undefined,
  isaClass?: string | null,
): string | null {
  const match = /^ISA:(\d+)(?::([A-C]\+?))?$/.exec(certificate?.trim() ?? '')
  if (!match) return null
  const [, standard, certLetter] = match
  const letter = standard === '41' ? (certLetter ?? isaClass ?? '') : ''
  const file = `ISA${standard}${letter.replace('+', 'plus')}`
  return KNOWN.has(file) ? `/isa-labels/${file}.png` : null
}
