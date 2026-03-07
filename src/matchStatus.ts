import type { MatchLite } from './types/api'

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

export function isMatchNotPlayed(
  match: MatchLite,
  options?: { referenceDate?: string | null; now?: Date }
): boolean {
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
