// src/api.ts
import { apiRoutes } from './apiRoutes'
import { normalizeManagedTeamIds, normalizeRole, normalizeString, type AccountRole } from './authz'

const rawApiBase =
  import.meta.env?.VITE_API_URL ??
  import.meta.env?.VITE_API_BASE ??
  import.meta.env?.VITE_API_BASE_URL

const DEFAULT_API_BASE = 'https://api.izifoot.fr'

export class HttpError extends Error {
  status: number
  details?: unknown
  url?: string
  method?: string

  constructor(status: number, message: string, options?: { details?: unknown; url?: string; method?: string }) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = options?.details
    this.url = options?.url
    this.method = options?.method
  }
}

function resolveApiBase(): string {
  if (rawApiBase) return String(rawApiBase).replace(/\/+$/, '')
  return DEFAULT_API_BASE
}

export const API_BASE = resolveApiBase()

export type Me = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  isPremium: boolean
  planningCount?: number
  role: AccountRole
  clubId: string | null
  teamId: string | null
  managedTeamIds: string[]
  linkedPlayerUserId: string | null
}

export type Planning = {
  id: string
  date: string // ISO
  data: unknown // ton JSON de planning
  createdAt: string
  updatedAt: string
}

function normalizeMe(input: unknown): Me {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    firstName: normalizeString(raw.firstName),
    lastName: normalizeString(raw.lastName),
    phone: normalizeString(raw.phone),
    isPremium: Boolean(raw.isPremium),
    planningCount: typeof raw.planningCount === 'number' ? raw.planningCount : undefined,
    role: normalizeRole(raw.role),
    clubId: normalizeString(raw.clubId),
    teamId: normalizeString(raw.teamId),
    managedTeamIds: normalizeManagedTeamIds(raw.managedTeamIds),
    linkedPlayerUserId: normalizeString(raw.linkedPlayerUserId),
  }
}

async function parseError(res: Response): Promise<{ message: string; raw: unknown }> {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const json = await res.json().catch(() => null)
    const msg = (json && typeof json === 'object' ? (json as { error?: unknown; message?: unknown }) : null)
    if (typeof msg?.error === 'string' && msg.error.trim()) return { message: msg.error, raw: json }
    if (typeof msg?.message === 'string' && msg.message.trim()) return { message: msg.message, raw: json }
    return { message: `HTTP ${res.status}`, raw: json }
  }

  const text = await res.text().catch(() => '')
  if (text.trim()) return { message: text, raw: text }

  if (res.status === 403) return { message: 'Accès non autorisé pour ce rôle', raw: null }
  if (res.status === 401) return { message: 'Session expirée. Veuillez vous reconnecter.', raw: null }
  return { message: `HTTP ${res.status}`, raw: null }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const method = typeof options.method === 'string' ? options.method.toUpperCase() : 'GET'
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('izifoot:unauthorized'))
    }
    const parsed = await parseError(res)
    if (typeof window !== 'undefined') {
      console.error('[API] HTTP error', { url, method, status: res.status, response: parsed.raw })
    }
    throw new HttpError(res.status, parsed.message, { details: parsed.raw, url, method })
  }

  return res.json()
}

export const api = {
  register: async (email: string, password: string, clubName: string) => {
    const normalizedClubName = clubName.trim()
    const payload = { email, password, clubName: normalizedClubName, club: normalizedClubName }
    try {
      return normalizeMe(await request<unknown>(apiRoutes.auth.register, { method: 'POST', body: JSON.stringify(payload) }))
    } catch (error) {
      if (error instanceof HttpError) {
        console.error('[AUTH_REGISTER] Failed request', {
          url: `${API_BASE}${apiRoutes.auth.register}`,
          method: 'POST',
          payload: { email, clubName: normalizedClubName, club: normalizedClubName, password: '***' },
          status: error.status,
          response: error.details ?? error.message,
        })
      }
      throw error
    }
  },
  login: async (email: string, password: string) =>
    normalizeMe(await request<unknown>(apiRoutes.auth.login, { method: 'POST', body: JSON.stringify({ email, password }) })),
  logout: () => request<{ ok: true }>(apiRoutes.auth.logout, { method: 'POST' }),
  me: async () => normalizeMe(await request<unknown>(apiRoutes.me)),

  listPlannings: () => request<Planning[]>(apiRoutes.plannings.list),
  getPlanning: (id: string) => request<Planning>(apiRoutes.plannings.byId(id)),
  createPlanning: (dateISO: string, data: unknown) =>
    request<Planning>(apiRoutes.plannings.list, { method: 'POST', body: JSON.stringify({ date: dateISO, data }) }),
  updatePlanning: (id: string, data: unknown) =>
    request<Planning>(apiRoutes.plannings.byId(id), { method: 'PUT', body: JSON.stringify({ data }) }),
  deletePlanning: (id: string) =>
    request<{ ok: true }>(apiRoutes.plannings.byId(id), { method: 'DELETE' }),

  sharePlanning: (id: string, email?: string, expiresInDays?: number) =>
    request<{ token: string; url: string; expiresAt: string | null }>(apiRoutes.plannings.share(id), {
      method: 'POST',
      body: JSON.stringify({ email, expiresInDays }),
    }),
}
