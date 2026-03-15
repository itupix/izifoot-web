import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

type CoachState = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  teamName: string
  invited: boolean
}

export default function ClubCoachDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const coach = (location.state as { coach?: CoachState } | null)?.coach ?? null

  const fullName = useMemo(() => {
    const first = coach?.firstName?.trim() || ''
    const last = coach?.lastName?.trim() || ''
    return `${first} ${last}`.trim() || 'Coach'
  }, [coach?.firstName, coach?.lastName])

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="page-title">{fullName}</h1>
          <Link to="/club">Retour</Link>
        </div>
      </header>

      <section className="panel">
        <div style={{ display: 'grid', gap: 8 }}>
          <div><strong>ID:</strong> {id || coach?.id || '—'}</div>
          <div><strong>Nom:</strong> {coach?.lastName || '—'}</div>
          <div><strong>Prénom:</strong> {coach?.firstName || '—'}</div>
          <div><strong>Email:</strong> {coach?.email || '—'}</div>
          <div><strong>Téléphone:</strong> {coach?.phone || '—'}</div>
          <div><strong>Équipe:</strong> {coach?.teamName || '—'}</div>
          {coach?.invited ? <div><strong>Statut:</strong> Invité</div> : null}
        </div>
      </section>
    </div>
  )
}
