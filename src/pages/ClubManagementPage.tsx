import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert } from '../ui'
import type { ClubMe, Team } from '../types/api'
import type { AccountRole } from '../authz'

interface AccountPayload {
  email: string
  password: string
  role: AccountRole
  teamId?: string
  linkedPlayerUserId?: string
}

const ACCOUNT_CREATION_ROLES: AccountRole[] = ['DIRECTION', 'COACH', 'PLAYER', 'PARENT']

export default function ClubManagementPage() {
  const [club, setClub] = useState<ClubMe | null>(null)
  const [teams, setTeams] = useState<Team[]>([])

  const [teamName, setTeamName] = useState('')
  const [teamCategory, setTeamCategory] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AccountRole>('COACH')
  const [teamId, setTeamId] = useState('')
  const [linkedPlayerUserId, setLinkedPlayerUserId] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)

  const loadClubData = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [clubData, teamData] = await Promise.all([
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Team[]>(apiRoutes.teams.list).catch(() => []),
    ])

    if (isCancelled()) return

    setClub(clubData)
    setTeams(Array.isArray(teamData) ? teamData : [])
  }, [])

  const { loading, error } = useAsyncLoader(loadClubData)

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr-FR')),
    [teams],
  )

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
      uiAlert(toErrorMessage(err, 'Erreur création équipe'))
    } finally {
      setCreatingTeam(false)
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    const payload: AccountPayload = {
      email: email.trim(),
      password,
      role,
    }

    if ((role === 'COACH' || role === 'PLAYER') && teamId) payload.teamId = teamId
    if (role === 'PARENT' && linkedPlayerUserId.trim()) payload.linkedPlayerUserId = linkedPlayerUserId.trim()

    setCreatingAccount(true)
    try {
      await apiPost(apiRoutes.accounts.list, payload)
      setEmail('')
      setPassword('')
      setRole('COACH')
      setTeamId('')
      setLinkedPlayerUserId('')
      uiAlert('Compte créé avec succès.')
    } catch (err: unknown) {
      uiAlert(toErrorMessage(err, 'Erreur création compte'))
    } finally {
      setCreatingAccount(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ marginTop: 0 }}>Gestion du club</h2>

      {loading && <div>Chargement…</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={titleStyle}>Club</h3>
        {club ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div><strong>Nom:</strong> {club.name || '—'}</div>
            <div><strong>ID:</strong> {club.id || '—'}</div>
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>Données club indisponibles pour le moment.</div>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={titleStyle}>Équipes</h3>
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

      <section style={cardStyle}>
        <h3 style={titleStyle}>Créer un compte</h3>
        <form onSubmit={createAccount} style={formStyle}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email *" required style={inputStyle} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mot de passe *" required style={inputStyle} />
          <select value={role} onChange={(e) => setRole(e.target.value as AccountRole)} style={inputStyle}>
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
          {role === 'PARENT' && (
            <input
              value={linkedPlayerUserId}
              onChange={(e) => setLinkedPlayerUserId(e.target.value)}
              placeholder="linkedPlayerUserId"
              style={inputStyle}
            />
          )}
          <button type="submit" disabled={creatingAccount} style={buttonStyle}>
            {creatingAccount ? 'Création…' : 'Créer compte'}
          </button>
        </form>
      </section>
    </div>
  )
}

const cardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  background: '#fff',
  padding: 14,
}

const titleStyle: CSSProperties = {
  margin: '0 0 12px',
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
  border: '1px solid #16a34a',
  background: '#16a34a',
  color: '#fff',
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
