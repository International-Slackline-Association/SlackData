// Base API client. Talks to the FastAPI backend (default http://localhost:8000).
// Override with VITE_API_URL at build/dev time.

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// --- Writes (Phase 2 — submissions) ----------------------------------------
//
// Everything above is a plain GET against the catalogue, which is read-only.
// These reach the *other* store; see slack_data/api/routing.py.

/** FastAPI's error body: `detail` is a string, or a list of validation errors. */
interface ErrorBody {
  detail?: string | { loc?: (string | number)[]; msg?: string }[]
}

/**
 * A readable message out of a FastAPI error response.
 *
 * Worth the trouble: a 422 from pydantic is a list of {loc, msg} objects, and
 * rendering that raw gives the submitter "[object Object]" where the reason
 * their correction was refused should be. The reasons are genuinely useful
 * ("source_url must be an http(s) URL"), so they are unpacked rather than
 * replaced with a generic apology.
 */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  let body: ErrorBody
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    return fallback
  }
  const { detail } = body
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map(e => {
        // Drop the leading "body" segment — it names the request envelope,
        // which means nothing to the person reading the message.
        const field = (e.loc ?? []).filter(p => p !== 'body').join('.')
        return field ? `${field}: ${e.msg ?? ''}` : (e.msg ?? '')
      })
      .filter(Boolean)
    if (messages.length) return messages.join('; ')
  }
  return fallback
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function send<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res, `${method} ${path} failed: ${res.status}`))
  }
  return res.json() as Promise<T>
}

export function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  return send<T>('POST', path, body, token)
}

export function patchJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  return send<T>('PATCH', path, body, token)
}

/** An authenticated GET. Separate from `request` so reads stay header-free. */
export async function getAuthed<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) })
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res, `GET ${path} failed: ${res.status}`))
  }
  return res.json() as Promise<T>
}

// Fetch a single page. `apiPath` is the router prefix (e.g. "webbing").
export function getPage<T>(apiPath: string, offset = 0, limit = 100): Promise<T[]> {
  return request<T[]>(`/${apiPath}/?limit=${limit}&offset=${offset}`)
}

// Fetch a single item by id.
export function getItem<T>(apiPath: string, id: number | string): Promise<T> {
  return request<T>(`/${apiPath}/${id}`)
}

// The backend caps `limit` at 100, so page until a short page comes back.
export async function getAll<T>(apiPath: string): Promise<T[]> {
  const PAGE = 100
  const all: T[] = []
  let offset = 0
  for (;;) {
    const page = await getPage<T>(apiPath, offset, PAGE)
    all.push(...page)
    if (page.length < PAGE) break
    offset += PAGE
  }
  return all
}
