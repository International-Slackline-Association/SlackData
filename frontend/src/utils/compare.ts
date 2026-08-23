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

export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort(compareByName)
}
