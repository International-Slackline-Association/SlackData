// Between a stored value and what a form input holds — pure, so
// tests/unit/fieldDraft.test.ts can run it under bare node.
//
// Inputs hold strings (and lists of strings for multi-choice) so a half-typed
// number is not lost; a draft becomes a value only on save. An empty draft
// means "unset", which the API stores by leaving the field out.

import type { FieldKind } from '@/types'

export type Draft = string | string[]

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

/** Equal as stored values: arrays and objects compared by content. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** "breaking_strength" -> "Breaking strength". */
export function humanize(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A value as one line of text, for previews and the change log. */
export function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === 'object') {
      return value.map(p => `${(p as { kn: unknown }).kn}→${(p as { percent: unknown }).percent}%`).join(', ')
    }
    return value.join(', ')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
