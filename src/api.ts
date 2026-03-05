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

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
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
    isPremium: Boolean(raw.isPremium),
    planningCount: typeof raw.planningCount === 'number' ? raw.planningCount : undefined,
    role: normalizeRole(raw.role),
    clubId: normalizeString(raw.clubId),
    teamId: normalizeString(raw.teamId),
    managedTeamIds: normalizeManagedTeamIds(raw.managedTeamIds),
    linkedPlayerUserId: normalizeString(raw.linkedPlayerUserId),
  }
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('izifoot:unauthorized'))
    }
    throw new HttpError(res.status, await parseError(res))
  }

  return res.json()
}

export const api = {
  register: async (email: string, password: string) =>
    normalizeMe(await request<unknown>(apiRoutes.auth.register, { method: 'POST', body: JSON.stringify({ email, password }) })),
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
