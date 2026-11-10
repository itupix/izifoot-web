import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TeamAttendance from './TeamAttendance'
import { apiRoutes } from '../apiRoutes'

describe('current season attendance scope', () => {
  it('requests the server current season without historical season parameters', () => {
    expect(apiRoutes.teams.attendanceReport('team / one')).toBe('/teams/team%20%2F%20one/attendance-report')
    expect(apiRoutes.teams.attendanceReport('team')).not.toContain('seasonId')
  })
  it('does not offer a season selector while loading', () => {
    const html = renderToStaticMarkup(<TeamAttendance teamId="team" />)
    expect(html).toContain('Chargement des présences')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('Saison<select')
  })
  it('requires a selected team before showing a report', () => {
    const html = renderToStaticMarkup(<TeamAttendance teamId={null} />)
    expect(html).toContain('Sélectionnez une équipe')
    expect(html).not.toContain('attendance-player-detail')
  })
})
