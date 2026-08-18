// Display helpers for gear values.

// A gear item is a union; card/spec code reads arbitrary fields by name, so we
// treat items as loose records at the display layer.
export type AnyItem = Record<string, unknown>

// Raw numeric value for a data-{field} attribute: the number as a string, or
// "" when null/absent (empty string sorts/filters as "no value" — null-last).
export function rawAttr(item: AnyItem, field: string): string {
  const v = item[field]
  return v == null ? '' : String(v)
}

// Build the set of data-{field} attributes for a card, e.g.
// { "data-weight": "280", "data-breaking-strength": "" }.
export function dataAttrs(item: AnyItem, fields: string[]): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const f of fields) attrs[`data-${f.replace(/_/g, '-')}`] = rawAttr(item, f)
  return attrs
}

// Prices are NOT formatted here. Every price on the site is rendered through
// the display currency (see context/CurrencyContext `priceText`), which needs
// the live rate table — something a pure formatting helper can't reach. The old
// `formatPrice(price, currency)` that printed "120 EUR" is gone: it stated an
// amount without saying it was one of fourteen different currencies.

// A spec value with an optional unit appended, e.g. "25 mm". "" when null.
// Multi-select fields (webbing `material`, roller `material`) arrive as arrays;
// they join with " + " so a composition reads as one spec — "Polyester +
// Dyneema/HMPE" — and stays distinct from the " · " that separates specs.
export function formatValue(value: unknown, unit?: string): string {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) {
    const parts = value.filter(v => v != null && v !== '')
    if (parts.length === 0) return ''
    return formatValue(parts.join(' + '), unit)
  }
  return unit ? `${value} ${unit}` : String(value)
}
