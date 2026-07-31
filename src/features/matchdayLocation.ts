import type { Matchday } from '../types/api'

type MatchdayLocationLike = Pick<Matchday, 'competitionType' | 'matchVenue' | 'lieu' | 'address'>

export function normalizeCompetitionType(value?: string | null) {
  return (value || 'PLATEAU').toUpperCase()
}

function isHomeMatch(matchday: MatchdayLocationLike) {
  const location = matchday.lieu?.trim() || ''
  return normalizeCompetitionType(matchday.competitionType) === 'MATCH'
    && (matchday.matchVenue === 'HOME' || location.length === 0)
}

export function formatMatchdayLocationLabel(matchday: MatchdayLocationLike, fallback = 'À définir') {
  const location = matchday.lieu?.trim() || ''

  if (isHomeMatch(matchday)) {
    return 'À domicile'
  }

  return location || fallback
}

export function getMatchdayMapQuery(matchday: MatchdayLocationLike) {
  const address = matchday.address?.trim() || ''
  if (address) return address
  if (isHomeMatch(matchday)) {
    return null
  }
  const location = matchday.lieu?.trim() || ''
  return location || null
}
