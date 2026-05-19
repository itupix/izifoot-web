import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { coachDisplayName, coachInvitationBadge, coachManagedTeamsLabel, normalizeClubCoach } from '../features/clubCoaches'
import type { ClubCoach } from '../types/api'

export default function ClubCoachDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const initialCoach = (location.state as { coach?: ClubCoach } | null)?.coach ?? null
  const [coach, setCoach] = useState<ClubCoach | null>(initialCoach)

  useEffect(() => {
    const coachId = id ?? ''
    if (!coachId) return
    let cancelled = false

    async function loadCoach() {
      try {
        const payload = await apiGet<ClubCoach>(apiRoutes.coaches.byId(coachId))
        if (!cancelled) setCoach(normalizeClubCoach(payload))
      } catch {
        if (!cancelled) setCoach((current) => current ?? null)
      }
    }

    void loadCoach()
    return () => {
      cancelled = true
    }
  }, [id])

  const fullName = useMemo(() => {
    return coach ? coachDisplayName(coach) : 'Coach'
  }, [coach])
  const invitationBadge = coach ? coachInvitationBadge(coach) : null

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
          <div><strong>Équipes:</strong> {coach ? coachManagedTeamsLabel(coach) : '—'}</div>
          <div><strong>Statut:</strong> {invitationBadge || 'Actif'}</div>
        </div>
      </section>
    </div>
  )
}
