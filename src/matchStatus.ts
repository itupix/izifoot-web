import type { MatchLite } from './types/api'

const MATCH_CANCELLED_STORAGE_KEY = 'izifoot.cancelledMatchIds'

function toDateKey(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isPast(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed < toDateKey(now)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < now.getTime()
}

function normalizeStatus(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function readCancelledMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MATCH_CANCELLED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

function writeCancelledMap(next: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MATCH_CANCELLED_STORAGE_KEY, JSON.stringify(next))
}

export function setStoredMatchCancelled(matchId: string, cancelled: boolean) {
  if (!matchId) return
  const current = readCancelledMap()
  if (cancelled) {
    writeCancelledMap({ ...current, [matchId]: true })
    return
  }
  if (!current[matchId]) return
  const next = { ...current }
  delete next[matchId]
  writeCancelledMap(next)
}

export function getStoredCancelledMatchIds(): Set<string> {
  return new Set(Object.entries(readCancelledMap()).filter(([, value]) => value).map(([id]) => id))
}

export function isMatchCancelled(match: MatchLite, options?: { localCancelledIds?: Set<string> }): boolean {
  const raw = match as MatchLite & {
    status?: unknown
    state?: unknown
    cancelled?: unknown
    canceled?: unknown
  }
  const status = normalizeStatus(raw.status ?? raw.state)
  if (status === 'CANCELLED' || status === 'CANCELED' || status === 'ANNULE') return true
  if (raw.cancelled === true || raw.canceled === true) return true
  return Boolean(match.id && options?.localCancelledIds?.has(match.id))
}

export function isMatchNotPlayed(
  match: MatchLite,
  options?: { referenceDate?: string | null; now?: Date; localCancelledIds?: Set<string> }
): boolean {
  if (isMatchCancelled(match, { localCancelledIds: options?.localCancelledIds })) return true

  if (typeof match.played === 'boolean') {
    return !match.played
  }

  const home = match.teams.find((t) => t.side === 'home')?.score ?? 0
  const away = match.teams.find((t) => t.side === 'away')?.score ?? 0
  const scorersCount = Array.isArray(match.scorers) ? match.scorers.length : 0

  const hasResultData = home !== 0 || away !== 0 || scorersCount > 0
  if (hasResultData) return false

  const now = options?.now
  if (isPast(options?.referenceDate ?? null, now)) return false
  if (isPast(match.createdAt, now)) return false

  return true
}
