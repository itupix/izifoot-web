// src/api.ts
const rawApiBase =
  import.meta.env?.VITE_API_URL ??
  import.meta.env?.VITE_API_BASE ??
  import.meta.env?.VITE_API_BASE_URL

function resolveApiBase(): string {
  if (rawApiBase) return String(rawApiBase).replace(/\/+$/, '')
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000'
  }
  return window.location.origin
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
    request<Me>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/api/me'),

  // Plannings
  listPlannings: () => request<Planning[]>('/api/plannings'),
  getPlanning: (id: string) => request<Planning>(`/api/plannings/${id}`),
  createPlanning: (dateISO: string, data: unknown) =>
    request<Planning>('/api/plannings', { method: 'POST', body: JSON.stringify({ date: dateISO, data }) }),
  updatePlanning: (id: string, data: unknown) =>
    request<Planning>(`/api/plannings/${id}`, { method: 'PUT', body: JSON.stringify({ data }) }),
  deletePlanning: (id: string) =>
    request<{ ok: true }>(`/api/plannings/${id}`, { method: 'DELETE' }),

  // Share (si tu veux plus tard)
  sharePlanning: (id: string, email?: string, expiresInDays?: number) =>
    request<{ token: string; url: string; expiresAt: string | null }>(`/api/plannings/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ email, expiresInDays }),
    }),
};
