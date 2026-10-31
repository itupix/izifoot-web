import { describe, expect, it } from 'vitest'
import { reorderUndated, type Fixture } from './championship'
const fixture = (id: string, order: number, kickoffAt: string | null = null): Fixture => ({id, order, kickoffAt, round: order+1, leg:1, homeTeamId:'a',awayTeamId:'b',homeScore:null,awayScore:null,matchId:null})
describe('championship order',()=>{
  it('moves only undated slots and keeps scheduled fixtures fixed',()=>{
    const fixtures=[fixture('a',0),fixture('dated',1,'2026-11-01T10:00:00Z'),fixture('b',2),fixture('c',3)]
    expect(reorderUndated(fixtures,'c','a')).toEqual(['c','dated','a','b'])
    expect(fixtures[0].round).toBe(1)
  })
  it('ignores attempts to move dated fixtures',()=>{
    const fixtures=[fixture('a',0),fixture('dated',1,'2026-11-01T10:00:00Z')]
    expect(reorderUndated(fixtures,'dated','a')).toEqual(['a','dated'])
  })
})
