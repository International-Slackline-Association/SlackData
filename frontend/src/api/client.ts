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
