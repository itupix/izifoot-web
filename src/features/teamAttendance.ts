export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'UNRECORDED' | 'UPCOMING' | 'CANCELLED' | 'NOT_APPLICABLE'
export type AttendanceStats = { presentCount: number; absentCount: number; unrecordedCount: number; recordedCount: number; attendanceRate: number | null }
export type AttendanceMonth = { month: string; summary: AttendanceStats }
export type AttendanceTraining = { id: string; date: string; endTime: string | null; status: string; month: string; includedInRate: boolean }
export type AttendancePlayer = { id: string; name: string; first_name: string | null; last_name: string | null; is_active: boolean; summary: AttendanceStats; months: AttendanceMonth[]; attendances: { trainingId: string; status: AttendanceStatus }[] }
export type AttendanceReport = { teamId: string; season: { id: string; key: string; label: string; startDate: string; endDate: string }; generatedAt: string; summary: AttendanceStats; months: AttendanceMonth[]; trainings: AttendanceTraining[]; players: AttendancePlayer[] }
export const statusLabels: Record<AttendanceStatus, string> = { PRESENT: '✓ Présent', ABSENT: '✕ Absent', UNRECORDED: '? Non renseigné', UPCOMING: '◷ À venir', CANCELLED: '⊘ Annulé', NOT_APPLICABLE: '— Hors effectif à cette date' }
export function rateLabel(value: number | null) { return value === null ? '—' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` }
export function monthLabel(month: string) { return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) }
export function defaultMonth(months: AttendanceMonth[], now = new Date()) {
  const current = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Paris' }).format(now)
  return months.some((item) => item.month === current) ? current : [...months].sort((a, b) => b.month.localeCompare(a.month))[0]?.month ?? ''
}
export function playerName(player: AttendancePlayer) { return [player.first_name, player.last_name].filter(Boolean).join(' ') || player.name }

export function normalizePlayerSearch(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr') }
