// The one alphabetical comparator, shared.
//
// `sortItems` (utils/sort.ts) uses it as the listing's default sort AND as the
// universal tie-break; `buildBrandSections` (utils/brandSections.ts) uses it to
// order a brand's inventory. Those were two identical copies, which is one copy
// too many for a rule the design spec states once: gear reads A→Z by name
// wherever it is listed.
//
// Deliberately dependency-free (only erased `import type`s), because
// brandSections.ts is loaded by `npm run test:unit` under
// `node --experimental-strip-types` — no `@/` alias, no bundler. Keep it that
// way: anything imported here has to clear the same bar.

export interface NamedItem {
  name?: unknown
  brand_name?: unknown
}

/** Alphabetical by name, ascending. Null/absent names sort as empty strings. */
export function compareByName(a: NamedItem, b: NamedItem): number {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

/**
 * Alphabetical by MANUFACTURER only, ascending — the table view's Manufacturer
 * column sort. Brand only, so the caller can flip its direction while leaving
 * the within-brand name tie-break ascending, which is the listing's standing
 * rule for every other sort (see utils/sort.ts).
 */
export function compareByBrand(a: NamedItem, b: NamedItem): number {
  return String(a.brand_name ?? '').localeCompare(String(b.brand_name ?? ''))
}

export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort(compareByName)
}

/**
 * The compare selection as it travels in a URL: `"3,1,9"` → `[3, 1, 9]`.
 *
 * Order is the selection order and is preserved — it decides the column order
 * downstream — but an id is never repeated, because two identical columns
 * compare nothing. Anything that isn't a finite number is dropped rather than
 * failing the parse: this string arrives from a URL, so it is whatever someone
 * pasted, and a listing that renders with one bad id ignored beats a blank page.
 *
 * Shared by the listing's `?compare=` (the selection) and the compare page's
 * `?ids=` (the comparison), which are the same list at two moments of its life.
 */
export function parseIdList(raw: string | null | undefined): number[] {
  if (!raw) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const part of raw.split(',')) {
    const n = Number(part)
    // Number('') is 0 and Number(' ') is 0, so an empty field would parse as a
    // real id — hence the explicit trim-and-test rather than Number.isFinite
    // alone.
    if (part.trim() === '' || !Number.isFinite(n)) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}
