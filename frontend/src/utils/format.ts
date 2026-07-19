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

// Price with its currency code, e.g. "120 EUR". Returns null when no price.
export function formatPrice(price: unknown, currency: unknown): string | null {
  if (price == null) return null
  const amount = typeof price === 'number' ? price : Number(price)
  const cur = currency ? ` ${String(currency)}` : ''
  return `${amount}${cur}`
}

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
