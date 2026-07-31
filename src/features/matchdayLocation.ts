import type { Matchday } from '../types/api'

type MatchdayLocationLike = Pick<Matchday, 'competitionType' | 'matchVenue' | 'lieu' | 'address'>

export function normalizeCompetitionType(value?: string | null) {
  return (value || 'PLATEAU').toUpperCase()
}

export function formatMatchdayLocationLabel(matchday: MatchdayLocationLike, fallback = 'À définir') {
  const normalizedType = normalizeCompetitionType(matchday.competitionType)
  const location = matchday.lieu?.trim() || ''

  if (normalizedType === 'MATCH' && matchday.matchVenue === 'HOME') {
    return 'À domicile'
  }

  return location || fallback
}

export function getMatchdayMapQuery(matchday: MatchdayLocationLike) {
  const address = matchday.address?.trim() || ''
  if (address) return address
  if (normalizeCompetitionType(matchday.competitionType) === 'MATCH' && matchday.matchVenue === 'HOME') {
    return null
  }
  const location = matchday.lieu?.trim() || ''
  return location || null
}
