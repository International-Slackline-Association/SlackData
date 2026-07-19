// Turns a raw product name into a URL/file-safe slug.
// MUST stay in sync with the Python `slugify` in scripts/build_gear_manifest.py —
// the manifest keys are generated there and looked up here at runtime.
//   "Mantra MK2"  -> "mantra-mk2"
//   "7/8\" Spider" -> "7-8-spider"
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')                 // split accents off base letters
    .replace(/[̀-ͯ]/g, '')   // drop the accents
    .replace(/[^a-z0-9]+/g, '-')       // any run of non-alphanumerics -> single dash
    .replace(/^-+|-+$/g, '')           // trim leading/trailing dashes
}
