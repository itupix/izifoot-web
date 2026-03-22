import type { MatchLite } from '../types/api'

export type MatchdayMode = 'ROTATION' | 'MANUAL'

export function detectMatchdayMode(
  summaryMode: unknown,
  matches: MatchLite[] | null | undefined,
): MatchdayMode {
  if (summaryMode === 'ROTATION') return 'ROTATION'
  if (summaryMode === 'MANUAL') return 'MANUAL'
  const hasRotationLink = (matches || []).some((match) => {
    const value = match?.rotationGameKey
    if (typeof value === 'string') return value.trim().length > 0
    if (value == null) return false
    return String(value).trim().length > 0
  })
  return hasRotationLink ? 'ROTATION' : 'MANUAL'
}
