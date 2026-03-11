import { describe, expect, it, vi } from 'vitest'
import { apiRoutes } from '../apiRoutes'
import { applyAttendanceValue, buildAttendancePayload, extractPresentPlayerIds, persistAttendanceToggle } from './attendance'

describe('buildAttendancePayload', () => {
  it('builds payload for check with present true', () => {
    expect(buildAttendancePayload({
      sessionType: 'PLATEAU',
      sessionId: 'plateau-1',
      playerId: 'player-1',
      present: true,
    })).toEqual({
      session_type: 'PLATEAU',
      session_id: 'plateau-1',
      playerId: 'player-1',
      present: true,
    })
  })

  it('builds payload for uncheck with present false', () => {
    expect(buildAttendancePayload({
      sessionType: 'TRAINING',
      sessionId: 'training-1',
      playerId: 'player-2',
      present: false,
    })).toEqual({
      session_type: 'TRAINING',
      session_id: 'training-1',
      playerId: 'player-2',
      present: false,
    })
  })
})

describe('persistAttendanceToggle', () => {
  it('posts attendance with present true on check', async () => {
    const apiPost = vi.fn().mockResolvedValue({})
    await persistAttendanceToggle(apiPost, {
      sessionType: 'PLATEAU',
      sessionId: 'plateau-42',
      playerId: 'player-42',
      present: true,
    })
    expect(apiPost).toHaveBeenCalledWith(apiRoutes.attendance.list, {
      session_type: 'PLATEAU',
      session_id: 'plateau-42',
      playerId: 'player-42',
      present: true,
    })
  })

  it('posts attendance with present false on uncheck', async () => {
    const apiPost = vi.fn().mockResolvedValue({})
    await persistAttendanceToggle(apiPost, {
      sessionType: 'TRAINING',
      sessionId: 'training-13',
      playerId: 'player-13',
      present: false,
    })
    expect(apiPost).toHaveBeenCalledWith(apiRoutes.attendance.list, {
      session_type: 'TRAINING',
      session_id: 'training-13',
      playerId: 'player-13',
      present: false,
    })
  })
})

describe('applyAttendanceValue', () => {
  it('adds player when present true and removes when present false', () => {
    const start = new Set(['player-1'])
    const afterCheck = applyAttendanceValue(start, 'player-2', true)
    expect(Array.from(afterCheck.values()).sort()).toEqual(['player-1', 'player-2'])
    const afterUncheck = applyAttendanceValue(afterCheck, 'player-1', false)
    expect(Array.from(afterUncheck.values()).sort()).toEqual(['player-2'])
  })
})

describe('extractPresentPlayerIds', () => {
  it('returns only playerIds with present=true', () => {
    const presentIds = extractPresentPlayerIds([
      { session_type: 'TRAINING', session_id: 's1', playerId: 'p1', present: false },
      { session_type: 'TRAINING', session_id: 's1', playerId: 'p2', present: true },
    ])
    expect(Array.from(presentIds.values())).toEqual(['p2'])
  })
})
