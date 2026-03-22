import { describe, expect, it } from 'vitest'
import type { MatchLite } from '../types/api'
import { linkRotationSlotsToMatches } from './rotationLinking'

function match(id: string, rotationGameKey?: string): MatchLite {
  return {
    id,
    createdAt: `2026-01-01T00:00:0${id.length}Z`,
    type: 'PLATEAU',
    matchdayId: 'md-1',
    teams: [],
    scorers: [],
    rotationGameKey: rotationGameKey ?? null,
    opponentName: 'Opp',
  }
}

const slots = [
  {
    time: '10:00',
    games: [{ pitch: 1, A: 'Club', B: 'Opp' }],
  },
]

describe('linkRotationSlotsToMatches', () => {
  it('matches schedule:* keys', () => {
    const linked = linkRotationSlotsToMatches({
      slots,
      matches: [match('m1', 'schedule:10:00:1:club:opp')],
      clubPlanningTeam: 'Club',
    })
    expect(linked.matchedGames).toBe(1)
  })

  it('matches legacy:* keys', () => {
    const linked = linkRotationSlotsToMatches({
      slots,
      matches: [match('m1', 'legacy:10:00:1:club:opp')],
      clubPlanningTeam: 'Club',
    })
    expect(linked.matchedGames).toBe(1)
  })

  it('supports mixed schedule:* and legacy:* keys', () => {
    const linked = linkRotationSlotsToMatches({
      slots: [{
        time: '10:00',
        games: [
          { pitch: 1, A: 'Club', B: 'OppA' },
          { pitch: 2, A: 'Club', B: 'OppB' },
        ],
      }],
      matches: [
        { ...match('m1', 'schedule:10:00:1:club:oppa'), opponentName: 'OppA' },
        { ...match('m2', 'legacy:10:00:2:club:oppb'), opponentName: 'OppB' },
      ],
      clubPlanningTeam: 'Club',
    })
    expect(linked.matchedGames).toBe(2)
  })

  it('falls back by order when key-based join fails and keeps matches visible', () => {
    const linked = linkRotationSlotsToMatches({
      slots: [{
        time: '10:00',
        games: [
          { pitch: 1, A: 'Club', B: 'OppA' },
          { pitch: 2, A: 'Club', B: 'OppB' },
        ],
      }],
      matches: [
        { ...match('m1', 'legacy:unknown-1'), opponentName: '' },
        { ...match('m2', 'schedule:unknown-2'), opponentName: '' },
      ],
      clubPlanningTeam: 'Club',
    })
    expect(linked.matchedGames).toBe(2)
  })
})
