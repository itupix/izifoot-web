export const GAME_FORMAT_VALUES = ['3v3', '5v5', '8v8', '11v11'] as const

export type GameFormat = (typeof GAME_FORMAT_VALUES)[number]

const PLAYERS_ON_FIELD_BY_FORMAT: Record<GameFormat, number> = {
  '3v3': 3,
  '5v5': 5,
  '8v8': 8,
  '11v11': 11,
}

export function normalizeGameFormat(value: unknown): GameFormat | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase() as GameFormat
  return GAME_FORMAT_VALUES.includes(normalized) ? normalized : null
}

export function playersOnFieldFromGameFormat(value: unknown, fallback = 5): number {
  const normalized = normalizeGameFormat(value)
  return normalized ? PLAYERS_ON_FIELD_BY_FORMAT[normalized] : fallback
}
