import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { type AccountRole } from '../authz'
import { DotsHorizontalIcon, PlusIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import type { AccountInvitation, ClubMe, Team } from '../types/api'
import './ClubManagementPage.css'

interface InviteAccountPayload {
  email: string
  role: AccountRole
  teamId?: string
  team_id?: string
  managedTeamIds?: string[]
  managed_team_ids?: string[]
  linkedPlayerUserId?: string
  linked_player_user_id?: string
  expiresInDays?: number
  expires_in_days?: number
}

const ACCOUNT_CREATION_ROLES: AccountRole[] = ['DIRECTION', 'COACH', 'PLAYER', 'PARENT']
const AGE_CATEGORY_OPTIONS = [
  { value: 'U6', label: 'U6' },
  { value: 'U7', label: 'U7' },
  { value: 'U8', label: 'U8' },
  { value: 'U9', label: 'U9' },
  { value: 'U10', label: 'U10' },
  { value: 'U11', label: 'U11' },
  { value: 'U12', label: 'U12' },
  { value: 'U13', label: 'U13' },
  { value: 'U14', label: 'U14' },
  { value: 'U15', label: 'U15' },
  { value: 'U16', label: 'U16' },
  { value: 'U17', label: 'U17' },
  { value: 'U18', label: 'U18' },
  { value: 'U19', label: 'U19' },
  { value: 'U20', label: 'U20' },
  { value: 'SENIORS', label: 'Seniors' },
  { value: 'VETERANS', label: 'Vétérans' },
] as const
type AgeCategoryValue = (typeof AGE_CATEGORY_OPTIONS)[number]['value']
const GAME_FORMAT_OPTIONS = [
  { value: '3v3', label: '3v3' },
  { value: '5v5', label: '5v5' },
  { value: '8v8', label: '8v8' },
  { value: '11v11', label: '11v11' },
] as const
type GameFormatValue = (typeof GAME_FORMAT_OPTIONS)[number]['value']

const AGE_CATEGORY_INDEX_BY_VALUE = new Map(AGE_CATEGORY_OPTIONS.map((option, index) => [option.value, index]))
const AGE_CATEGORY_LABEL_BY_VALUE = new Map(AGE_CATEGORY_OPTIONS.map((option) => [option.value, option.label]))

function normalizeCategoryToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parseAgeCategorySelection(rawValue?: string | null): AgeCategoryValue[] {
  if (!rawValue) return []
  const normalizedOptions = new Map(
    AGE_CATEGORY_OPTIONS.map((option) => [normalizeCategoryToken(option.label), option.value]),
  )
  AGE_CATEGORY_OPTIONS.forEach((option) => {
    normalizedOptions.set(normalizeCategoryToken(option.value), option.value)
  })
  const normalized = rawValue.trim()
  if (!normalized) return []

  const rangeParts = normalized.split('-').map((part) => part.trim()).filter(Boolean)
  if (rangeParts.length === 2) {
    const startValue = normalizedOptions.get(normalizeCategoryToken(rangeParts[0]))
    const endValue = normalizedOptions.get(normalizeCategoryToken(rangeParts[1]))
    if (!startValue || !endValue) return []
    const startIdx = AGE_CATEGORY_INDEX_BY_VALUE.get(startValue)
    const endIdx = AGE_CATEGORY_INDEX_BY_VALUE.get(endValue)
    if (startIdx == null || endIdx == null || startIdx > endIdx) return []
    return AGE_CATEGORY_OPTIONS.slice(startIdx, endIdx + 1).map((option) => option.value)
  }

  const singleValue = normalizedOptions.get(normalizeCategoryToken(normalized))
  return singleValue ? [singleValue] : []
}

function buildAgeCategoryLabel(values: AgeCategoryValue[]): string {
  if (!values.length) return ''
  const sorted = [...values].sort(
    (a, b) => (AGE_CATEGORY_INDEX_BY_VALUE.get(a) ?? Number.MAX_SAFE_INTEGER) - (AGE_CATEGORY_INDEX_BY_VALUE.get(b) ?? Number.MAX_SAFE_INTEGER),
  )
  if (!sorted.length) return ''
  const firstLabel = AGE_CATEGORY_LABEL_BY_VALUE.get(sorted[0]) || sorted[0]
  if (sorted.length === 1) return firstLabel
  const lastLabel = AGE_CATEGORY_LABEL_BY_VALUE.get(sorted[sorted.length - 1]) || sorted[sorted.length - 1]
  return `${firstLabel}-${lastLabel}`
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function buildUniqueTeamName(baseName: string, existingNames: string[]): string {
  const base = baseName.trim()
  if (!base) return ''
  const baseNormalized = normalizeForComparison(base)
  let maxSuffix = 0

  for (const name of existingNames) {
    const normalized = normalizeForComparison(name)
    if (!normalized) continue
    if (normalized === baseNormalized) {
      maxSuffix = Math.max(maxSuffix, 1)
      continue
    }
    if (!normalized.startsWith(`${baseNormalized} `)) continue
    const suffix = normalized.slice(baseNormalized.length + 1).trim()
    if (!/^\d+$/.test(suffix)) continue
    maxSuffix = Math.max(maxSuffix, Number(suffix))
  }

  if (maxSuffix === 0) return base
  return `${base} ${maxSuffix + 1}`
}

function suggestGameFormatFromAgeCategories(values: AgeCategoryValue[]): GameFormatValue | '' {
  if (!values.length) return ''
  const first = [...values].sort(
    (a, b) => (AGE_CATEGORY_INDEX_BY_VALUE.get(a) ?? Number.MAX_SAFE_INTEGER) - (AGE_CATEGORY_INDEX_BY_VALUE.get(b) ?? Number.MAX_SAFE_INTEGER),
  )[0]
  if (!first) return ''
  if (first === 'SENIORS' || first === 'VETERANS') return '11v11'
  const age = Number(first.replace('U', ''))
  if (Number.isNaN(age)) return '11v11'
  if (age <= 7) return '3v3'
  if (age <= 9) return '5v5'
  if (age <= 13) return '8v8'
  return '11v11'
}

function normalizeGameFormat(value: unknown): GameFormatValue | '' {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  return GAME_FORMAT_OPTIONS.some((option) => option.value === normalized) ? (normalized as GameFormatValue) : ''
}

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

function normalizeTeam(team: unknown): Team | null {
  const raw = (team && typeof team === 'object' ? team : {}) as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : (typeof raw.teamId === 'string' ? raw.teamId : (typeof raw.team_id === 'string' ? raw.team_id : ''))
  if (!id) return null
  const name = typeof raw.name === 'string'
    ? raw.name
    : (typeof raw.teamName === 'string' ? raw.teamName : (typeof raw.team_name === 'string' ? raw.team_name : id))
  const category = typeof raw.category === 'string' ? raw.category : null
  const format = normalizeGameFormat(raw.format ?? raw.gameFormat ?? raw.game_format) || null
  const clubId = typeof raw.clubId === 'string' ? raw.clubId : (typeof raw.club_id === 'string' ? raw.club_id : null)
  return { id, name, category, format, clubId }
}

export default function ClubManagementPage() {
  const { me } = useAuth()
  const { setSelectedTeamId, refreshTeamScope, selectedTeamId } = useTeamScope()
  const navigate = useNavigate()

  const [club, setClub] = useState<ClubMe | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [invitations, setInvitations] = useState<AccountInvitation[]>([])

  const [clubName, setClubName] = useState('')
  const [renamingClub, setRenamingClub] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)

  const [teamName, setTeamName] = useState('')
  const [selectedAgeCategories, setSelectedAgeCategories] = useState<AgeCategoryValue[]>([])
  const [teamGameFormat, setTeamGameFormat] = useState<GameFormatValue | ''>('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [isActiveTeamMenuOpen, setIsActiveTeamMenuOpen] = useState(false)
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [activeTeamTabId, setActiveTeamTabId] = useState<string | null>(null)
  const [teamPendingDelete, setTeamPendingDelete] = useState<Team | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AccountRole>('COACH')
  const [teamId, setTeamId] = useState('')
  const [managedTeamIds, setManagedTeamIds] = useState<string[]>([])
  const [linkedPlayerUserId, setLinkedPlayerUserId] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [creatingInvitation, setCreatingInvitation] = useState(false)
  const [lastInviteUrl, setLastInviteUrl] = useState('')

  const isDirection = me?.role === 'DIRECTION'

  function openInfoModal(message: string, title = 'Information') {
    setInfoModal({ title, message })
  }

  const loadClubData = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [clubData, teamData, invitationData] = await Promise.all([
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Team[]>(apiRoutes.teams.list).catch(() => []),
      apiGet<AccountInvitation[]>(apiRoutes.accounts.invitations).catch(() => []),
    ])

    if (isCancelled()) return

    setClub(clubData)
    setClubName(clubData?.name ?? '')
    const normalizedTeams = (Array.isArray(teamData) ? teamData : [])
      .map(normalizeTeam)
      .filter((team): team is Team => Boolean(team))
    setTeams(normalizedTeams)
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
  const activeTeam = useMemo(
    () => sortedTeams.find((team) => team.id === activeTeamTabId) ?? sortedTeams[0] ?? null,
    [activeTeamTabId, sortedTeams],
  )
  const sortedSelectedAgeCategories = useMemo(
    () => [...selectedAgeCategories].sort(
      (a, b) => (AGE_CATEGORY_INDEX_BY_VALUE.get(a) ?? Number.MAX_SAFE_INTEGER) - (AGE_CATEGORY_INDEX_BY_VALUE.get(b) ?? Number.MAX_SAFE_INTEGER),
    ),
    [selectedAgeCategories],
  )
  const isAgeSelectionContiguous = useMemo(() => {
    if (!sortedSelectedAgeCategories.length) return false
    for (let i = 1; i < sortedSelectedAgeCategories.length; i += 1) {
      const previous = AGE_CATEGORY_INDEX_BY_VALUE.get(sortedSelectedAgeCategories[i - 1])
      const current = AGE_CATEGORY_INDEX_BY_VALUE.get(sortedSelectedAgeCategories[i])
      if (previous == null || current == null || current !== previous + 1) return false
    }
    return true
  }, [sortedSelectedAgeCategories])
  const selectedAgeCategoryLabel = useMemo(
    () => buildAgeCategoryLabel(sortedSelectedAgeCategories),
    [sortedSelectedAgeCategories],
  )
  const suggestedGameFormat = useMemo(
    () => suggestGameFormatFromAgeCategories(sortedSelectedAgeCategories),
    [sortedSelectedAgeCategories],
  )

  useEffect(() => {
    if (!sortedTeams.length) {
      if (activeTeamTabId !== null) setActiveTeamTabId(null)
      return
    }
    if (!activeTeamTabId || !sortedTeams.some((team) => team.id === activeTeamTabId)) {
      setActiveTeamTabId(sortedTeams[0].id)
    }
  }, [activeTeamTabId, sortedTeams])

  useEffect(() => {
    if (!activeTeam) setIsActiveTeamMenuOpen(false)
  }, [activeTeam])

  useEffect(() => {
    if (!suggestedGameFormat) return
    setTeamGameFormat(suggestedGameFormat)
  }, [suggestedGameFormat])

  function handleProtectedRouteErrors(err: unknown, forbiddenMessage = 'Action réservée à la direction'): boolean {
    const status = extractStatusCode(err)
    if (status === 401) {
      navigate('/', { replace: true })
      return true
    }
    if (status === 403) {
      openInfoModal(forbiddenMessage, 'Accès refusé')
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
      setIsRenameModalOpen(false)
      openInfoModal('Nom du club mis à jour.', 'Succès')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      const status = extractStatusCode(err)
      if (status === 400) {
        openInfoModal(toErrorMessage(err, 'Nom invalide'), 'Erreur')
        return
      }
      openInfoModal(toErrorMessage(err, 'Erreur lors du renommage du club'), 'Erreur')
    } finally {
      setRenamingClub(false)
    }
  }

  function openCreateTeamModal() {
    setEditingTeamId(null)
    setTeamName('')
    setSelectedAgeCategories([])
    setTeamGameFormat('')
    setIsActiveTeamMenuOpen(false)
    setIsTeamModalOpen(true)
  }

  function openEditTeamModal(team: Team) {
    setEditingTeamId(team.id)
    setTeamName(team.name || '')
    const parsedCategories = parseAgeCategorySelection(team.category)
    setSelectedAgeCategories(parsedCategories)
    setTeamGameFormat(normalizeGameFormat(team.format) || suggestGameFormatFromAgeCategories(parsedCategories))
    setIsActiveTeamMenuOpen(false)
    setIsTeamModalOpen(true)
  }

  function requestDeleteTeam(team: Team) {
    setIsActiveTeamMenuOpen(false)
    setTeamPendingDelete(team)
  }

  async function confirmDeleteTeam() {
    if (!teamPendingDelete?.id) return
    setDeletingTeam(true)
    try {
      await apiDelete(apiRoutes.teams.byId(teamPendingDelete.id))
      setTeams((prev) => prev.filter((item) => item.id !== teamPendingDelete.id))
      if (selectedTeamId === teamPendingDelete.id) {
        setSelectedTeamId(null)
      }
      await refreshTeamScope()
      setTeamPendingDelete(null)
      openInfoModal('Équipe supprimée.', 'Succès')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, 'Erreur suppression équipe'), 'Erreur')
    } finally {
      setDeletingTeam(false)
    }
  }

  async function submitTeam(e: React.FormEvent) {
    e.preventDefault()

    setSavingTeam(true)
    try {
      if (!isAgeSelectionContiguous) {
        openInfoModal('Sélectionne une ou plusieurs catégories d’âge qui se suivent (ex: U8-U9).', 'Validation')
        return
      }
      if (!teamGameFormat) {
        openInfoModal('Sélectionne un format de jeu.', 'Validation')
        return
      }
      const normalizedCategory = selectedAgeCategoryLabel
      const rawProvidedName = teamName.trim()
      const fallbackBaseName = normalizedCategory
      const comparableNames = teams
        .filter((team) => !editingTeamId || team.id !== editingTeamId)
        .map((team) => team.name || '')
      const normalizedTeamName = rawProvidedName || buildUniqueTeamName(fallbackBaseName, comparableNames)
      if (!normalizedTeamName) {
        openInfoModal("Impossible de déterminer le nom de l'équipe.", 'Erreur')
        return
      }

      if (editingTeamId) {
        const updated = await apiPut<Team>(apiRoutes.teams.byId(editingTeamId), {
          name: normalizedTeamName,
          teamName: normalizedTeamName,
          category: normalizedCategory,
          format: teamGameFormat,
          gameFormat: teamGameFormat,
          game_format: teamGameFormat,
        })
        const normalizedUpdated = normalizeTeam(updated) ?? {
          id: editingTeamId,
          name: normalizedTeamName,
          category: normalizedCategory || null,
          format: teamGameFormat,
        }
        setTeams((prev) => prev.map((team) => (team.id === editingTeamId ? { ...team, ...normalizedUpdated } : team)))
        openInfoModal('Équipe mise à jour.', 'Succès')
      } else {
        const created = await apiPost<Team>(apiRoutes.teams.list, {
          name: normalizedTeamName,
          teamName: normalizedTeamName,
          category: normalizedCategory,
          format: teamGameFormat,
          gameFormat: teamGameFormat,
          game_format: teamGameFormat,
        })
        const normalizedCreated = normalizeTeam(created) ?? { id: '', name: normalizedTeamName }
        if (!normalizedCreated.id) {
          openInfoModal('Équipe créée mais identifiant introuvable dans la réponse backend.', 'Avertissement')
          await refreshTeamScope()
          return
        }
        setTeams((prev) => [...prev, normalizedCreated])
        if (!selectedTeamId) {
          setSelectedTeamId(normalizedCreated.id)
        }
        openInfoModal('Équipe créée.', 'Succès')
      }

      await refreshTeamScope()
      setTeamName('')
      setSelectedAgeCategories([])
      setTeamGameFormat('')
      setEditingTeamId(null)
      setIsTeamModalOpen(false)
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, editingTeamId ? 'Erreur mise à jour équipe' : 'Erreur création équipe'), 'Erreur')
    } finally {
      setSavingTeam(false)
    }
  }

  function toggleAgeCategory(value: AgeCategoryValue) {
    setSelectedAgeCategories((prev) => (
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    ))
  }

  async function createInvitation(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    const payload: InviteAccountPayload = {
      email: email.trim(),
      role,
      expiresInDays,
      expires_in_days: expiresInDays,
    }

    if ((role === 'COACH' || role === 'PLAYER') && teamId) {
      payload.teamId = teamId
      payload.team_id = teamId
    }
    if (role === 'COACH' && managedTeamIds.length > 0) {
      payload.managedTeamIds = managedTeamIds
      payload.managed_team_ids = managedTeamIds
    }
    if (role === 'PARENT' && linkedPlayerUserId.trim()) {
      const linkedId = linkedPlayerUserId.trim()
      payload.linkedPlayerUserId = linkedId
      payload.linked_player_user_id = linkedId
    }

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
      openInfoModal('Invitation envoyée', 'Succès')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      const status = extractStatusCode(err)
      if (status === 400) {
        openInfoModal(toErrorMessage(err, 'Données invitation invalides'), 'Erreur')
        return
      }
      openInfoModal(toErrorMessage(err, 'Erreur envoi invitation'), 'Erreur')
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
      openInfoModal('Lien d’invitation copié', 'Succès')
    } catch {
      openInfoModal('Impossible de copier le lien', 'Erreur')
    }
  }

  return (
    <div className="page-shell">
      <header className="club-page-head">
        <div className="club-page-mainrow">
          <div className="club-page-title-wrap">
            <h1 className="club-page-title">{club?.name?.trim() || 'Mon club'}</h1>
          </div>
          {isDirection && (
            <div className="club-menu-wrap">
              <RoundIconButton
                ariaLabel="Ouvrir le menu d'actions"
                className="menu-dots-button"
                onClick={() => setActionsMenuOpen((prev) => !prev)}
                disabled={!club}
              >
                <DotsHorizontalIcon size={18} />
              </RoundIconButton>
              {actionsMenuOpen && (
                <>
                  <button
                    type="button"
                    className="club-menu-backdrop"
                    aria-label="Fermer le menu"
                    onClick={() => setActionsMenuOpen(false)}
                  />
                  <div className="club-floating-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuOpen(false)
                        setClubName(club?.name || '')
                        setIsRenameModalOpen(true)
                      }}
                    >
                      Modifier le nom du club
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {loading && <div>Chargement…</div>}
      {error && <div className="inline-alert error">{error}</div>}

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Mes équipes</h3>
          {sortedTeams.length > 0 && (
            <RoundIconButton
              ariaLabel="Ajouter une équipe"
              className="menu-dots-button"
              onClick={openCreateTeamModal}
            >
              <PlusIcon size={18} />
            </RoundIconButton>
          )}
        </div>
        {sortedTeams.length === 0 ? (
          <div className="club-empty-teams-state">
            <p className="club-empty-teams-text">Aucune équipe.</p>
            <button type="button" style={buttonStyle} onClick={openCreateTeamModal}>
              Ajouter une équipe
            </button>
          </div>
        ) : (
          <div className="club-teams-tabs-block">
            <div className="club-teams-tabs" role="tablist" aria-label="Équipes du club">
              {sortedTeams.map((team) => {
                const isActive = activeTeam?.id === team.id
                return (
                  <button
                    key={team.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`club-team-tab-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => setActiveTeamTabId(team.id)}
                  >
                    {team.name || 'Équipe'}
                  </button>
                )
              })}
            </div>
            {activeTeam && (
              <div className="club-team-tab-panel" role="tabpanel">
                <div className="club-team-floating-actions">
                  <div className="club-menu-wrap">
                    <RoundIconButton
                      ariaLabel="Ouvrir le menu de l'équipe"
                      className="menu-dots-button"
                      size={28}
                      onClick={() => setIsActiveTeamMenuOpen((prev) => !prev)}
                    >
                      <DotsHorizontalIcon size={16} />
                    </RoundIconButton>
                    {isActiveTeamMenuOpen && (
                      <>
                        <button
                          type="button"
                          className="club-menu-backdrop"
                          aria-label="Fermer le menu de l'équipe"
                          onClick={() => setIsActiveTeamMenuOpen(false)}
                        />
                        <div className="club-floating-menu">
                          <button type="button" onClick={() => openEditTeamModal(activeTeam)}>
                            Modifier
                          </button>
                          <button type="button" className="danger" onClick={() => requestDeleteTeam(activeTeam)}>
                            Supprimer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div><strong>Nom:</strong> {activeTeam.name || '—'}</div>
                <div><strong>Catégorie:</strong> {activeTeam.category || '—'}</div>
                <div><strong>Format:</strong> {activeTeam.format || '—'}</div>
              </div>
            )}
          </div>
        )}
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
            <div className="club-managed-teams-box">
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
            <div className="club-invite-link-box">
              <label style={{ fontSize: 12, color: '#6b7280' }}>Lien d’invitation</label>
              <input value={lastInviteUrl} readOnly style={inputStyle} className="club-invite-url-input" />
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
          <div className="club-invitations-table-wrap">
            <table className="club-invitations-table">
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th className="club-table-cell club-table-head">Email</th>
                  <th className="club-table-cell club-table-head">Rôle</th>
                  <th className="club-table-cell club-table-head">Statut</th>
                  <th className="club-table-cell club-table-head">Date d’envoi</th>
                  <th className="club-table-cell club-table-head">Expiration</th>
                  <th className="club-table-cell club-table-head">Accepté le</th>
                </tr>
              </thead>
              <tbody>
                {sortedInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="club-table-cell">{invitation.email}</td>
                    <td className="club-table-cell">{invitation.role}</td>
                    <td className="club-table-cell"><StatusBadge status={invitation.status} /></td>
                    <td className="club-table-cell">{formatDate(getSentAt(invitation))}</td>
                    <td className="club-table-cell">{formatDate(invitation.expiresAt)}</td>
                    <td className="club-table-cell">{formatDate(invitation.acceptedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isRenameModalOpen && (
        <>
          <div className="club-modal-overlay" onClick={() => !renamingClub && setIsRenameModalOpen(false)} />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label="Renommer le club">
            <div className="club-modal-head">
              <h3>Modifier le nom du club</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => !renamingClub && setIsRenameModalOpen(false)}
                disabled={renamingClub}
              >
                ×
              </button>
            </div>
            <form onSubmit={renameClub} style={formStyle}>
              <input
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="Nouveau nom du club"
                style={inputStyle}
                minLength={2}
                maxLength={120}
                required
                autoFocus
              />
              <div className="club-rename-actions">
                <button
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  style={secondaryButtonStyle}
                  disabled={renamingClub}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={renamingClub || clubName.trim().length < 2 || clubName.trim().length > 120}
                  style={{
                    ...buttonStyle,
                    ...(renamingClub || clubName.trim().length < 2 || clubName.trim().length > 120 ? disabledButtonStyle : {}),
                  }}
                >
                  {renamingClub ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {isTeamModalOpen && (
        <>
          <div
            className="club-modal-overlay"
            onClick={() => !savingTeam && setIsTeamModalOpen(false)}
          />
          <div
            className="club-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingTeamId ? 'Modifier une équipe' : 'Ajouter une équipe'}
          >
            <div className="club-modal-head">
              <h3>{editingTeamId ? 'Modifier une équipe' : 'Ajouter une équipe'}</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => !savingTeam && setIsTeamModalOpen(false)}
                disabled={savingTeam}
              >
                ×
              </button>
            </div>
            <form onSubmit={submitTeam} style={formStyle}>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Nom de l'équipe"
                style={inputStyle}
                autoFocus
              />
              <div className="club-age-selector-wrap">
                <span className="club-age-selector-label">Catégorie d’âge</span>
                <div className="club-age-selector-grid">
                  {AGE_CATEGORY_OPTIONS.map((option) => {
                    const selected = selectedAgeCategories.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`club-age-option ${selected ? 'is-active' : ''}`}
                        onClick={() => toggleAgeCategory(option.value)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {!isAgeSelectionContiguous && selectedAgeCategories.length > 0 && (
                  <p className="club-age-selector-error">
                    Les catégories sélectionnées doivent se suivre (ex: U8-U9).
                  </p>
                )}
              </div>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Format de jeu</span>
                <select value={teamGameFormat} onChange={(e) => setTeamGameFormat(normalizeGameFormat(e.target.value))} style={inputStyle}>
                  <option value="">Sélectionner un format</option>
                  {GAME_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="club-team-modal-actions">
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setIsTeamModalOpen(false)}
                  disabled={savingTeam}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingTeam || !isAgeSelectionContiguous || !teamGameFormat}
                  style={{
                    ...buttonStyle,
                    ...(savingTeam || !isAgeSelectionContiguous || !teamGameFormat ? disabledButtonStyle : {}),
                  }}
                >
                  {savingTeam ? 'Enregistrement…' : editingTeamId ? 'Enregistrer' : 'Créer équipe'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {teamPendingDelete && (
        <>
          <div
            className="club-modal-overlay"
            onClick={() => !deletingTeam && setTeamPendingDelete(null)}
          />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label="Supprimer une équipe">
            <div className="club-modal-head">
              <h3>Supprimer une équipe</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => !deletingTeam && setTeamPendingDelete(null)}
                disabled={deletingTeam}
              >
                ×
              </button>
            </div>
            <p className="club-modal-text">
              Supprimer l&apos;équipe &quot;{teamPendingDelete.name || teamPendingDelete.id}&quot; ?
            </p>
            <div className="club-modal-actions">
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setTeamPendingDelete(null)}
                disabled={deletingTeam}
              >
                Annuler
              </button>
              <button
                type="button"
                style={{
                  ...dangerButtonStyle,
                  ...(deletingTeam ? disabledButtonStyle : {}),
                }}
                onClick={() => { void confirmDeleteTeam() }}
                disabled={deletingTeam}
              >
                {deletingTeam ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}

      {infoModal && (
        <>
          <div className="club-modal-overlay" onClick={() => setInfoModal(null)} />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label={infoModal.title}>
            <div className="club-modal-head">
              <h3>{infoModal.title}</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => setInfoModal(null)}
              >
                ×
              </button>
            </div>
            <p className="club-modal-text">{infoModal.message}</p>
            <div className="club-modal-actions">
              <button type="button" style={buttonStyle} onClick={() => setInfoModal(null)}>
                OK
              </button>
            </div>
          </div>
        </>
      )}
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

const disabledButtonStyle: CSSProperties = {
  opacity: 0.55,
  cursor: 'not-allowed',
}

const dangerButtonStyle: CSSProperties = {
  border: '1px solid #dc2626',
  background: '#dc2626',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}
