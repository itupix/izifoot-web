import { apiGetPdf } from '../apiClient'
import { apiRoutes } from '../apiRoutes'

export async function downloadAttendancePdf(teamId: string, month: string, isCurrent: () => boolean): Promise<void> {
  const pdf = await apiGetPdf(apiRoutes.teams.attendancePdf(teamId, month))
  if (!isCurrent()) return
  const url = URL.createObjectURL(pdf)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = `presences-${month}.pdf`
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
