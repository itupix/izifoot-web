export type Fixture = { id: string; round: number; leg: 1 | 2; order: number; homeTeamId: string; awayTeamId: string; kickoffAt: string | null; homeScore: number | null; awayScore: number | null; matchId: string | null }
export type Championship = { id: string; teamId: string; seasonId: string; name: string; doubleRoundRobin: boolean; status: 'DRAFT' | 'VALIDATED'; revision: number; teams: {id: string; name: string; isOwnTeam: boolean}[]; fixtures: Fixture[]; byeRounds: { round: number; teamId: string }[]; standings: {teamId: string; position: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number}[] }
export type ChampionshipResponse = { championship: Championship | null; canManage: boolean }
export const championshipPath = (id: string) => `/championship/${encodeURIComponent(id)}`
export function reorderUndated(fixtures: Fixture[], source: string, target: string): string[] {
  const ordered = [...fixtures].sort((a,b) => a.order-b.order)
  const movable = ordered.filter(f => !f.kickoffAt)
  const from = movable.findIndex(f => f.id === source), to = movable.findIndex(f => f.id === target)
  if (from < 0 || to < 0) return ordered.map(f => f.id)
  movable.splice(to, 0, movable.splice(from, 1)[0])
  let index = 0
  return ordered.map(f => f.kickoffAt ? f.id : movable[index++].id)
}
export function localInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
}
