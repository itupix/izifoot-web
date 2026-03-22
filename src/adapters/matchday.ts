import type { Matchday } from '../types/api'

export function normalizeMatchdayPayload<T extends { matchday: Matchday }>(
  payload: unknown,
): T {
  const raw = payload as { matchday?: Matchday | null; plateau?: Matchday | null } & Record<string, unknown>
  const matchday = raw.matchday ?? raw.plateau ?? null
  if (!matchday) throw new Error('Invalid matchday payload: missing "matchday"')
  const { plateau: _legacyPlateau, ...rest } = raw
  return { ...(rest as T), matchday }
}
