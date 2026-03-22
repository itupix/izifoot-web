import { describe, expect, it } from 'vitest'
import { detectMatchdayMode } from './matchdayMode'
import type { MatchLite } from '../types/api'

function makeMatch(rotationGameKey?: string | null): MatchLite {
  return {
    id: 'm-1',
    createdAt: new Date().toISOString(),
    type: 'PLATEAU',
    matchdayId: 'md-1',
    teams: [],
    scorers: [],
    rotationGameKey: rotationGameKey ?? undefined,
  }
}

describe('detectMatchdayMode', () => {
  it('returns ROTATION when summary mode is ROTATION even with legacy keys', () => {
    const mode = detectMatchdayMode('ROTATION', [makeMatch('legacy:slot-1')])
    expect(mode).toBe('ROTATION')
  })

  it('falls back to ROTATION when summary mode is absent and at least one rotationGameKey is present', () => {
    const mode = detectMatchdayMode(undefined, [makeMatch('legacy:abc'), makeMatch('')])
    expect(mode).toBe('ROTATION')
  })

  it('falls back to MANUAL when summary mode is absent and no rotationGameKey exists', () => {
    const mode = detectMatchdayMode(undefined, [makeMatch(''), makeMatch(undefined), makeMatch(null)])
    expect(mode).toBe('MANUAL')
  })
})
