// Punctuation-insensitive search. Strips [.\-()/ ] and lowercases before a
// substring match, so "82" matches "8.2", "twave" matches "T-Wave", etc.
// (see search_sort.cy.ts — "normalized" search).

export function normalize(s: string): string {
  return s.replace(/[.\-()/ ]/g, '').toLowerCase()
}

// Filtering rules:
//   - empty input            → all items (no filtering)
//   - punctuation-only input → nothing (normalizes to "")
//   - otherwise              → name OR brand contains the normalized query
export function filterBySearch<T extends { name: string; brand_name: string }>(
  items: T[],
  rawQuery: string,
): T[] {
  if (rawQuery.trim() === '') return items
  const q = normalize(rawQuery)
  if (q === '') return []
  return items.filter(
    i => normalize(i.name).includes(q) || normalize(i.brand_name).includes(q),
  )
}
