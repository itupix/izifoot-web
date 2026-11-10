import { describe, expect, it } from 'vitest'
import { defaultMonth, rateLabel, statusLabels, normalizePlayerSearch } from './teamAttendance'
const summary = { presentCount: 0, absentCount: 0, unrecordedCount: 0, recordedCount: 0, attendanceRate: null }
describe('attendance reporting presentation', () => {
  it('finds accented names with an unaccented search', () => { expect(normalizePlayerSearch('Émile')).toBe(normalizePlayerSearch('emile')) })
  it('keeps unknown distinct from zero attendance', () => {
    expect(rateLabel(null)).toBe('—')
    expect(rateLabel(0)).toBe('0 %')
    expect(rateLabel(66.7)).toBe('66,7 %')
    expect(statusLabels.UNRECORDED).not.toBe(statusLabels.ABSENT)
  })
  it('selects the Paris calendar month at UTC boundaries', () => {
    expect(defaultMonth([{ month: '2026-10', summary }, { month: '2026-11', summary }], new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
  })
  it('falls back to latest month having training, independently of ordering', () => {
    expect(defaultMonth([{ month: '2025-12', summary }, { month: '2026-02', summary }], new Date('2026-11-10T12:00:00Z'))).toBe('2026-02')
    expect(defaultMonth([])).toBe('')
  })
})
