import type { TacticalPoint } from './tactical'

type RawRecord = Record<string, unknown>

export type DefaultTacticPayload = {
  name: string
  formation: string
  preset: string
  points: Record<string, TacticalPoint>
  savedAt: string
  playersOnField?: number
}

export function defaultTacticStorageKey(teamId: string | null | undefined) {
  return `izifoot.tactical.default.${teamId || 'all'}`
}

function isPoint(value: unknown): value is TacticalPoint {
  if (!value || typeof value !== 'object') return false
  const raw = value as RawRecord
  return typeof raw.x === 'number' && Number.isFinite(raw.x) && typeof raw.y === 'number' && Number.isFinite(raw.y)
}

function readPoints(value: unknown): Record<string, TacticalPoint> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as RawRecord
  const result: Record<string, TacticalPoint> = {}
  for (const [tokenId, point] of Object.entries(raw)) {
    if (isPoint(point)) result[tokenId] = { x: point.x, y: point.y }
  }
  return result
}

export function readDefaultTactic(teamId: string | null | undefined, playersOnField?: number): DefaultTacticPayload | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(defaultTacticStorageKey(teamId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as RawRecord
    if (!parsed || typeof parsed !== 'object') return null
    const preset = typeof parsed.preset === 'string' ? parsed.preset.trim() : ''
    const formation = typeof parsed.formation === 'string' ? parsed.formation.trim() : ''
    if (!preset || !formation) return null
    const parsedPlayersOnField = typeof parsed.playersOnField === 'number' ? parsed.playersOnField : undefined
    if (typeof playersOnField === 'number' && typeof parsedPlayersOnField === 'number' && playersOnField !== parsedPlayersOnField) {
      return null
    }
    const points = readPoints(parsed.points)
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Tactique',
      formation,
      preset,
      points,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      playersOnField: parsedPlayersOnField,
    }
  } catch {
    return null
  }
}

export function saveDefaultTactic(teamId: string | null | undefined, payload: DefaultTacticPayload) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(defaultTacticStorageKey(teamId), JSON.stringify(payload))
}
