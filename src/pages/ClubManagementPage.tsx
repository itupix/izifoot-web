import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { type AccountRole } from '../authz'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { uiAlert } from '../ui'
import type { AccountInvitation, ClubMe, Team } from '../types/api'

interface InviteAccountPayload {
  email: string
  role: AccountRole
  teamId?: string
  managedTeamIds?: string[]
  linkedPlayerUserId?: string
  expiresInDays?: number
}

const ACCOUNT_CREATION_ROLES: AccountRole[] = ['DIRECTION', 'COACH', 'PLAYER', 'PARENT']

function extractStatusCode(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err && typeof (err as Error & { status?: unknown }).status === 'number') {
    return (err as Error & { status: number }).status
  }
  return undefined
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR')
}

function getSentAt(invitation: AccountInvitation): string | undefined {
  return invitation.sentAt || invitation.createdAt
}

export default function ClubManagementPage() {
  const { me } = useAuth()
  const navigate = useNavigate()

  const [club, setClub] = useState<ClubMe | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [invitations, setInvitations] = useState<AccountInvitation[]>([])

  const [clubName, setClubName] = useState('')
  const [renamingClub, setRenamingClub] = useState(false)

  const [teamName, setTeamName] = useState('')
  const [teamCategory, setTeamCategory] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AccountRole>('COACH')
  const [teamId, setTeamId] = useState('')
  const [managedTeamIds, setManagedTeamIds] = useState<string[]>([])
  const [linkedPlayerUserId, setLinkedPlayerUserId] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [creatingInvitation, setCreatingInvitation] = useState(false)
  const [lastInviteUrl, setLastInviteUrl] = useState('')

  const isDirection = me?.role === 'DIRECTION'

  const loadClubData = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [clubData, teamData, invitationData] = await Promise.all([
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Team[]>(apiRoutes.teams.list).catch(() => []),
      apiGet<AccountInvitation[]>(apiRoutes.accounts.invitations).catch(() => []),
    ])

    if (isCancelled()) return

    setClub(clubData)
    setClubName(clubData?.name ?? '')
    setTeams(Array.isArray(teamData) ? teamData : [])
    setInvitations(Array.isArray(invitationData) ? invitationData : [])
  }, [])

  const { loading, error } = useAsyncLoader(loadClubData)

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr-FR')),
    [teams],
  )

  const sortedInvitations = useMemo(
    () => [...invitations].sort((a, b) => +new Date(getSentAt(b) || 0) - +new Date(getSentAt(a) || 0)),
    [invitations],
  )

  function handleProtectedRouteErrors(err: unknown, forbiddenMessage = 'Action réservée à la direction'): boolean {
    const status = extractStatusCode(err)
    if (status === 401) {
      navigate('/', { replace: true })
      return true
    }
    if (status === 403) {
      uiAlert(forbiddenMessage)
      return true
    }
    return false
  }

  async function renameClub(e: React.FormEvent) {
    e.preventDefault()
    const nextName = clubName.trim()
    if (!nextName || !club) return

    setRenamingClub(true)
    try {
      const updated = await apiPut<ClubMe>(apiRoutes.clubs.me, { name: nextName })
      setClub(updated)
      setClubName(updated.name ?? nextName)
      uiAlert('Nom du club mis à jour.')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      const status = extractStatusCode(err)
      if (status === 400) {
        uiAlert(toErrorMessage(err, 'Nom invalide'))
        return
      }
      uiAlert(toErrorMessage(err, 'Erreur lors du renommage du club'))
    } finally {
      setRenamingClub(false)
    }
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!teamName.trim()) return

    setCreatingTeam(true)
    try {
      const created = await apiPost<Team>(apiRoutes.teams.list, {
        name: teamName.trim(),
        category: teamCategory.trim() || undefined,
      })
      setTeams((prev) => [...prev, created])
      setTeamName('')
      setTeamCategory('')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      uiAlert(toErrorMessage(err, 'Erreur création équipe'))
    } finally {
      setCreatingTeam(false)
    }
  }

  async function createInvitation(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    const payload: InviteAccountPayload = {
      email: email.trim(),
      role,
      expiresInDays,
    }

    if ((role === 'COACH' || role === 'PLAYER') && teamId) payload.teamId = teamId
    if (role === 'COACH' && managedTeamIds.length > 0) payload.managedTeamIds = managedTeamIds
    if (role === 'PARENT' && linkedPlayerUserId.trim()) payload.linkedPlayerUserId = linkedPlayerUserId.trim()

    setCreatingInvitation(true)
    try {
      const created = await apiPost<AccountInvitation>(apiRoutes.accounts.list, payload)
      setInvitations((prev) => [created, ...prev])
      setLastInviteUrl(created.inviteUrl || '')
      setEmail('')
      setRole('COACH')
      setTeamId('')
      setManagedTeamIds([])
      setLinkedPlayerUserId('')
      setExpiresInDays(7)
      uiAlert('Invitation envoyée')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      const status = extractStatusCode(err)
      if (status === 400) {
        uiAlert(toErrorMessage(err, 'Données invitation invalides'))
        return
      }
      uiAlert(toErrorMessage(err, 'Erreur envoi invitation'))
    } finally {
      setCreatingInvitation(false)
    }
  }

  function toggleManagedTeam(teamValue: string) {
    setManagedTeamIds((prev) => (prev.includes(teamValue) ? prev.filter((id) => id !== teamValue) : [...prev, teamValue]))
  }

  async function copyInviteUrl() {
    if (!lastInviteUrl) return
    try {
      await navigator.clipboard.writeText(lastInviteUrl)
      uiAlert('Lien d’invitation copié')
    } catch {
      uiAlert('Impossible de copier le lien')
    }
  }

  return (
    <div className="page-shell">
      <header className="page-head">
        <h2 className="page-title">Gestion du club</h2>
        <p className="page-subtitle">Structure du club, équipes, comptes et invitations.</p>
      </header>

      {loading && <div>Chargement…</div>}
      {error && <div className="inline-alert error">{error}</div>}

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Club</h3>
        </div>
        {club ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div><strong>Nom:</strong> {club.name || '—'}</div>
            <div><strong>ID:</strong> {club.id || '—'}</div>
            {isDirection && (
              <form onSubmit={renameClub} style={{ ...formStyle, marginTop: 8 }}>
                <label style={{ fontSize: 12, color: '#6b7280' }}>Renommer le club</label>
                <input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="Nouveau nom du club"
                  style={inputStyle}
                  minLength={2}
                  maxLength={120}
                  required
                />
                <button
                  type="submit"
                  disabled={renamingClub || clubName.trim().length < 2 || clubName.trim().length > 120}
                  style={buttonStyle}
                >
                  {renamingClub ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>Données club indisponibles pour le moment.</div>
        )}
      </section>

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Équipes</h3>
          <p className="panel-note">{sortedTeams.length} équipe(s)</p>
        </div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {sortedTeams.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Aucune équipe.</div>
          ) : (
            sortedTeams.map((team) => (
              <div key={team.id} style={rowStyle}>
                <div>
                  <strong>{team.name || 'Équipe'}</strong>
                  {team.category ? <span style={{ color: '#6b7280' }}> · {team.category}</span> : null}
                </div>
                <small style={{ color: '#6b7280' }}>{team.id}</small>
              </div>
            ))
          )}
        </div>
        <form onSubmit={createTeam} style={formStyle}>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Nom équipe *"
            style={inputStyle}
            required
          />
          <input
            value={teamCategory}
            onChange={(e) => setTeamCategory(e.target.value)}
            placeholder="Catégorie (optionnel)"
            style={inputStyle}
          />
          <button type="submit" disabled={creatingTeam} style={buttonStyle}>
            {creatingTeam ? 'Création…' : 'Créer équipe'}
          </button>
        </form>
      </section>

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Créer un compte</h3>
          <p className="panel-note">Invitation par email avec rôle et périmètre.</p>
        </div>
        <form onSubmit={createInvitation} style={formStyle}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email *" required style={inputStyle} />
          <select
            value={role}
            onChange={(e) => {
              const nextRole = e.target.value as AccountRole
              setRole(nextRole)
              if (nextRole !== 'COACH') setManagedTeamIds([])
              if (nextRole !== 'PARENT') setLinkedPlayerUserId('')
              if (nextRole !== 'PLAYER' && nextRole !== 'COACH') setTeamId('')
            }}
            style={inputStyle}
          >
            {ACCOUNT_CREATION_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {(role === 'COACH' || role === 'PLAYER') && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={inputStyle}>
              <option value="">Aucune équipe</option>
              {sortedTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name || team.id}</option>
              ))}
            </select>
          )}

          {role === 'COACH' && (
            <div style={{ display: 'grid', gap: 6, border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Équipes gérées</span>
              {sortedTeams.length === 0 ? (
                <span style={{ fontSize: 12, color: '#6b7280' }}>Aucune équipe disponible</span>
              ) : (
                sortedTeams.map((team) => (
                  <label key={`managed-${team.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={managedTeamIds.includes(team.id)}
                      onChange={() => toggleManagedTeam(team.id)}
                    />
                    <span>{team.name || team.id}</span>
                  </label>
                ))
              )}
            </div>
          )}

          {role === 'PARENT' && (
            <input
              value={linkedPlayerUserId}
              onChange={(e) => setLinkedPlayerUserId(e.target.value)}
              placeholder="linkedPlayerUserId"
              style={inputStyle}
            />
          )}

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Expiration invitation (jours)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
              style={inputStyle}
            />
          </label>

          <button type="submit" disabled={creatingInvitation} style={buttonStyle}>
            {creatingInvitation ? 'Envoi…' : 'Envoyer invitation'}
          </button>

          {lastInviteUrl && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, color: '#6b7280' }}>Lien d’invitation</label>
              <input value={lastInviteUrl} readOnly style={inputStyle} />
              <button type="button" onClick={copyInviteUrl} style={secondaryButtonStyle}>Copier le lien</button>
            </div>
          )}
        </form>
      </section>

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Invitations</h3>
          <p className="panel-note">{sortedInvitations.length} invitation(s)</p>
        </div>
        {sortedInvitations.length === 0 ? (
          <div style={{ color: '#6b7280' }}>Aucune invitation.</div>
        ) : (
          <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Rôle</th>
                  <th style={thStyle}>Statut</th>
                  <th style={thStyle}>Date d’envoi</th>
                  <th style={thStyle}>Expiration</th>
                  <th style={thStyle}>Accepté le</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td style={tdStyle}>{invitation.email}</td>
                    <td style={tdStyle}>{invitation.role}</td>
                    <td style={tdStyle}><StatusBadge status={invitation.status} /></td>
                    <td style={tdStyle}>{formatDate(getSentAt(invitation))}</td>
                    <td style={tdStyle}>{formatDate(invitation.expiresAt)}</td>
                    <td style={tdStyle}>{formatDate(invitation.acceptedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: AccountInvitation['status'] }) {
  const map: Record<AccountInvitation['status'], { background: string; color: string }> = {
    PENDING: { background: '#dbeafe', color: '#1d4ed8' },
    ACCEPTED: { background: '#dcfce7', color: '#166534' },
    CANCELLED: { background: '#fee2e2', color: '#b91c1c' },
    EXPIRED: { background: '#f1f5f9', color: '#334155' },
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: map[status].background,
        color: map[status].color,
      }}
    >
      {status}
    </span>
  )
}

const cardStyle: CSSProperties = {
  padding: 14,
}

const formStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 8,
  border: '1px solid #d1d5db',
  borderRadius: 8,
}

const buttonStyle: CSSProperties = {
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#1f2937',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '8px 10px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 12,
  color: '#475569',
}

const tdStyle: CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
}
