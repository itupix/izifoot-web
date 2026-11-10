import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AttendanceMonthTable from './AttendanceMonthTable'
import type { AttendancePlayer, AttendanceStatus, AttendanceTraining } from '../features/teamAttendance'
const summary = { presentCount: 1, absentCount: 1, unrecordedCount: 0, recordedCount: 2, attendanceRate: 50 }
const statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'NOT_APPLICABLE', 'UNRECORDED', 'UPCOMING', 'CANCELLED']
const trainings: AttendanceTraining[] = statuses.map((_, index) => ({ id: String(index), date: `2026-11-10T${String(index + 10).padStart(2, '0')}:00:00Z`, endTime: null, status: 'PLANNED', month: '2026-11', includedInRate: true }))
const player = (id: string, name: string): AttendancePlayer => ({ id, name, first_name: null, last_name: null, is_active: true, summary, months: [{ month: '2026-11', summary }], attendances: statuses.map((status, index) => ({ trainingId: String(index), status })) })
describe('monthly attendance table', () => {
  it('sorts names with French collation, dates chronologically and keeps server percentages', () => {
    const html = renderToStaticMarkup(<AttendanceMonthTable month="2026-11" players={[player('z', 'Zoé'), player('e', 'Émile'), player('a', 'Alice')]} trainings={[...trainings].reverse()} />)
    expect(html.indexOf('>Alice</th>')).toBeLessThan(html.indexOf('>Émile</th>'))
    expect(html.indexOf('>Émile</th>')).toBeLessThan(html.indexOf('>Zoé</th>'))
    expect(html.indexOf('11:00')).toBeLessThan(html.indexOf('16:00'))
    expect(html).toContain('50 %')
    expect(html).toContain('scope="row"')
    expect(html).toContain('tabindex="0"')
  })
  it('renders every distinct server status accessibly without treating unknown as absent', () => {
    const html = renderToStaticMarkup(<AttendanceMonthTable month="2026-11" players={[player('e', 'Émile')]} trainings={trainings} />)
    for (const status of statuses) expect(html).toContain(`attendance-indicator--${status}`)
    expect(html).toContain('Émile, mardi 10 novembre 2026 à 14:00 : ? Non renseigné')
    expect(html).toContain('Hors effectif à cette date')
    expect(html).toContain('Annulé')
  })
})
