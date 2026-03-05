import { API_BASE, HttpError } from './api'

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function withCacheBust(url: string): string {
  const u = new URL(url, window.location.origin)
  u.searchParams.set('_', Date.now().toString())
  return u.toString()
}

function buildUrl(path: string, cacheBust: boolean): string {
  const raw = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_BASE}${path}`
  return cacheBust ? withCacheBust(raw) : raw
}

async function parseError(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const json = await res.json().catch(() => null)
    const msg = (json && typeof json === 'object' ? (json as { error?: unknown; message?: unknown }) : null)
    if (typeof msg?.error === 'string' && msg.error.trim()) return msg.error
    if (typeof msg?.message === 'string' && msg.message.trim()) return msg.message
  }

  const text = await res.text().catch(() => '')
  if (text.trim()) return text

  if (res.status === 403) return 'Accès non autorisé pour ce rôle'
  if (res.status === 401) return 'Session expirée. Veuillez vous reconnecter.'
  return `HTTP ${res.status}`
}

export function apiUrl(path: string): string {
  return buildUrl(path, false)
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: { cacheBust?: boolean } = {}
): Promise<T> {
  const res = await fetch(buildUrl(path, Boolean(options.cacheBust)), {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers || {}) },
    ...init,
  })

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('izifoot:unauthorized'))
    }
    throw new HttpError(res.status, await parseError(res))
  }

  return res.json()
}

export function apiGet<T>(path: string): Promise<T> {
  return requestJson<T>(path, {}, { cacheBust: true })
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'DELETE' })
}
