import { apiRoutes } from '../apiRoutes'
import type { AttendanceRow } from '../types/api'

export type AttendanceSessionType = 'TRAINING' | 'PLATEAU'

export type AttendancePayload = {
  session_type: AttendanceSessionType
  session_id: string
  playerId: string
  present: boolean
}

type AttendanceToggleInput = {
  sessionType: AttendanceSessionType
  sessionId: string
  playerId: string
  present: boolean
}

type ApiPost = <T>(path: string, body: unknown) => Promise<T>

export function buildAttendancePayload(input: AttendanceToggleInput): AttendancePayload {
  return {
    session_type: input.sessionType,
    session_id: input.sessionId,
    playerId: input.playerId,
    present: input.present,
  }
}

export function applyAttendanceValue(current: Set<string>, playerId: string, present: boolean): Set<string> {
  const next = new Set(current)
  if (present) next.add(playerId)
  else next.delete(playerId)
  return next
}

export function extractPresentPlayerIds(rows: AttendanceRow[]): Set<string> {
  return new Set(rows.filter((row) => row.present === true).map((row) => row.playerId))
}

export async function persistAttendanceToggle(
  apiPost: ApiPost,
  input: AttendanceToggleInput,
): Promise<AttendancePayload> {
  const payload = buildAttendancePayload(input)
  await apiPost(apiRoutes.attendance.list, payload)
  return payload
}
