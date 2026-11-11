import { useLayoutEffect, useRef, useState } from 'react'
import { downloadAttendancePdf } from '../features/attendancePdf'

export default function AttendancePdfButton({ teamId, month }: { teamId: string; month: string }) {
  const active = useRef(false)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  async function download() {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError(false)
    try {
      await downloadAttendancePdf(teamId, month, () => active.current)
    } catch {
      if (active.current) setError(true)
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  return <div className="attendance-pdf-action">
    <button type="button" className="players-secondary-btn" disabled={busy || !month} onClick={() => { void download() }}>{busy ? 'Préparation…' : error ? 'Réessayer le PDF' : 'Rapport PDF'}</button>
    {busy && <span role="status" className="attendance-sr-only">Préparation du rapport PDF</span>}
    {error && <p role="alert">Impossible de préparer le rapport PDF. Veuillez réessayer.</p>}
  </div>
}
