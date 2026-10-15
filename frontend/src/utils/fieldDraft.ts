// Between a stored value and what a form input holds — pure, so
// tests/unit/fieldDraft.test.ts can run it under bare node.
//
// Inputs hold strings (and lists of strings for multi-choice) so a half-typed
// number is not lost; a draft becomes a value only on save. An empty draft
// means "unset", which the API stores by leaving the field out.

import type { FieldKind } from '@/types'

export type Draft = string | string[]

// Fields stored as Unix milliseconds and edited as a calendar date. Mirrors
// DATE_FIELDS in slack_data/catalogue/edits.py, which gives them the kind
// 'date' in the form; this copy lets the change log show them as dates too
// (tests/test_edits.py checks the two agree).
export const DATE_FIELDS = new Set(['release_date'])

const DAY_MS = 86_400_000

/** Unix ms -> "YYYY-MM-DD". The day is the NEAREST UTC midnight: most stored
 *  dates are a local midnight somewhere (SlackDB's 22:00 UTC is midnight in
 *  UTC+2), and rounding recovers the intended day from any timezone. */
export function msToDate(ms: number): string {
  return new Date(Math.round(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" -> Unix ms at midnight UTC, or null if it is not a real date. */
export function dateToMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return msToDate(ms) === date ? ms : null
}

export interface Parsed {
  value: unknown
  error?: string
}

export function toDraft(kind: FieldKind, value: unknown): Draft {
  if (value === undefined || value === null) return kind === 'choices' ? [] : ''
  switch (kind) {
    case 'choices':
      return Array.isArray(value) ? value.map(String) : [String(value)]
    case 'list':
      return Array.isArray(value) ? value.join('\n') : String(value)
    case 'curve':
      return Array.isArray(value)
        ? value
            .map(point => {
              const p = point as { kn?: unknown; percent?: unknown }
              return `${p.kn} ${p.percent}`
            })
            .join('\n')
        : ''
    case 'boolean':
      return value ? 'true' : 'false'
    case 'date':
      return typeof value === 'number' ? msToDate(value) : String(value)
    default:
      return String(value)
  }
}

export function fromDraft(kind: FieldKind, draft: Draft): Parsed {
  if (kind === 'choices') {
    const list = draft as string[]
    return { value: list.length ? list : null }
  }
  const text = (draft as string).trim()
  if (text === '') return { value: null }
  switch (kind) {
    case 'number': {
      const n = Number(text.replace(',', '.'))
      return Number.isFinite(n) ? { value: n } : { value: null, error: 'a number' }
    }
    case 'integer': {
      const n = Number(text)
      return Number.isInteger(n) ? { value: n } : { value: null, error: 'a whole number' }
    }
    case 'date': {
      const ms = dateToMs(text)
      return ms === null ? { value: null, error: 'a date' } : { value: ms }
    }
    case 'boolean':
      return { value: text === 'true' }
    case 'list':
      return {
        value: text
          .split(/[\n,]/)
          .map(s => s.trim())
          .filter(Boolean),
      }
    case 'curve': {
      const points = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        const tokens = line.trim().split(/[\s;:]+/)
        const [kn, percent] = tokens.map(Number)
        if (tokens.length !== 2 || !Number.isFinite(kn) || !Number.isFinite(percent)) {
          return { value: null, error: 'one "kN percent" pair per line, e.g. 4 1.1' }
        }
        points.push({ kn, percent })
      }
      return { value: points.length ? points : null }
    }
    default:
      return { value: text }
  }
}

/** A stored value as the form would save it unchanged. A date the input shows
 *  as one day must not count as edited because it was stored at 22:00. */
export function asDrafted(kind: FieldKind, value: unknown): unknown {
  if (kind !== 'date' || value === undefined || value === null) return value
  return fromDraft(kind, toDraft(kind, value)).value
}

/** Equal as stored values: arrays and objects compared by content. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** "breaking_strength" -> "Breaking strength". */
export function humanize(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A value as one line of text, for previews and the change log. `field`
 *  names the field, so a stored date reads as one. */
export function display(value: unknown, field?: string): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field && DATE_FIELDS.has(field) && typeof value === 'number') return msToDate(value)
  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === 'object') {
      return value.map(p => `${(p as { kn: unknown }).kn}→${(p as { percent: unknown }).percent}%`).join(', ')
    }
    return value.join(', ')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
