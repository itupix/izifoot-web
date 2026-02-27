// src/api.ts
import { apiRoutes } from './apiRoutes'

const rawApiBase =
  import.meta.env?.VITE_API_URL ??
  import.meta.env?.VITE_API_BASE ??
  import.meta.env?.VITE_API_BASE_URL

const DEFAULT_API_BASE = 'https://api.izifoot.fr'

function resolveApiBase(): string {
  if (rawApiBase) return String(rawApiBase).replace(/\/+$/, '')
  return DEFAULT_API_BASE
}

export const API_BASE = resolveApiBase()

export type Me = {
  id: string;
  email: string;
  isPremium: boolean;
  planningCount?: number;
};

export type Planning = {
  id: string;
  date: string;        // ISO
  data: unknown;       // ton JSON de planning
  createdAt: string;
  updatedAt: string;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  register: (email: string, password: string) =>
    request<Me>(apiRoutes.auth.register, { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<Me>(apiRoutes.auth.login, { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>(apiRoutes.auth.logout, { method: 'POST' }),
  me: () => request<Me>(apiRoutes.me),

  // Plannings
  listPlannings: () => request<Planning[]>(apiRoutes.plannings.list),
  getPlanning: (id: string) => request<Planning>(apiRoutes.plannings.byId(id)),
  createPlanning: (dateISO: string, data: unknown) =>
    request<Planning>(apiRoutes.plannings.list, { method: 'POST', body: JSON.stringify({ date: dateISO, data }) }),
  updatePlanning: (id: string, data: unknown) =>
    request<Planning>(apiRoutes.plannings.byId(id), { method: 'PUT', body: JSON.stringify({ data }) }),
  deletePlanning: (id: string) =>
    request<{ ok: true }>(apiRoutes.plannings.byId(id), { method: 'DELETE' }),

  // Share (si tu veux plus tard)
  sharePlanning: (id: string, email?: string, expiresInDays?: number) =>
    request<{ token: string; url: string; expiresAt: string | null }>(apiRoutes.plannings.share(id), {
      method: 'POST',
      body: JSON.stringify({ email, expiresInDays }),
    }),
};
