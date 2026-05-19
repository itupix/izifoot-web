import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { DotsHorizontalIcon, PlusIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import {
  coachDisplayName,
  coachInvitationBadge,
  coachManagedTeamsLabel,
  compareCoaches,
  isCoachAssignedToTeam,
  normalizeClubCoach,
} from '../features/clubCoaches'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useNavigate } from 'react-router-dom'
import { useTeamScope } from '../useTeamScope'
import type { ClubCoach, ClubMe, Team } from '../types/api'
import './ClubManagementPage.css'

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

const GAME_FORMAT_OPTIONS = [
  { value: '3v3', label: '3v3' },
  { value: '5v5', label: '5v5' },
  { value: '8v8', label: '8v8' },
  { value: '11v11', label: '11v11' },
] as const

type AgeCategoryValue = (typeof AGE_CATEGORY_OPTIONS)[number]['value']
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

function uniqueTeamIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

export default function ClubManagementPage() {
  const { me } = useAuth()
  const { setSelectedTeamId, refreshTeamScope, selectedTeamId } = useTeamScope()
  const navigate = useNavigate()

  const [club, setClub] = useState<ClubMe | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [coaches, setCoaches] = useState<ClubCoach[]>([])
  const [refreshTick, setRefreshTick] = useState(0)

  const [clubName, setClubName] = useState('')
  const [renamingClub, setRenamingClub] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)

  const [teamName, setTeamName] = useState('')
  const [selectedAgeCategories, setSelectedAgeCategories] = useState<AgeCategoryValue[]>([])
  const [teamGameFormat, setTeamGameFormat] = useState<GameFormatValue | ''>('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [openTeamMenuId, setOpenTeamMenuId] = useState<string | null>(null)
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [teamPendingDelete, setTeamPendingDelete] = useState<Team | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const [coachFirstName, setCoachFirstName] = useState('')
  const [coachLastName, setCoachLastName] = useState('')
  const [coachEmail, setCoachEmail] = useState('')
  const [coachPhone, setCoachPhone] = useState('')
  const [coachTeamId, setCoachTeamId] = useState('')
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false)
  const [savingCoach, setSavingCoach] = useState(false)
  const [coachPendingDelete, setCoachPendingDelete] = useState<ClubCoach | null>(null)
  const [deletingCoach, setDeletingCoach] = useState(false)
  const [mutatingCoachId, setMutatingCoachId] = useState<string | null>(null)
  const [coachSelectionByTeamId, setCoachSelectionByTeamId] = useState<Record<string, string>>({})

  const isDirection = me?.role === 'DIRECTION'

  function openInfoModal(message: string, title = 'Information') {
    setInfoModal({ title, message })
  }

  const loadClubData = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [clubData, teamData, coachData] = await Promise.all([
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Team[]>(apiRoutes.teams.list).catch(() => []),
      apiGet<ClubCoach[]>(apiRoutes.clubs.coaches).catch(() => []),
    ])

    if (isCancelled()) return

    setClub(clubData)
    setClubName(clubData?.name ?? '')
    setTeams(
      (Array.isArray(teamData) ? teamData : [])
        .map(normalizeTeam)
        .filter((team): team is Team => Boolean(team)),
    )
    setCoaches(
      (Array.isArray(coachData) ? coachData : [])
        .map(normalizeClubCoach)
        .filter((coach): coach is ClubCoach => Boolean(coach))
        .sort(compareCoaches),
    )
  }, [refreshTick])

  const { loading, error } = useAsyncLoader(loadClubData)

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr-FR')),
    [teams],
  )
  const sortedCoaches = useMemo(
    () => [...coaches].sort(compareCoaches),
    [coaches],
  )
  const coachesByTeamId = useMemo(() => {
    const next = new Map<string, ClubCoach[]>()
    for (const team of sortedTeams) next.set(team.id, [])
    for (const coach of sortedCoaches) {
      for (const teamId of coach.managedTeamIds || []) {
        if (!next.has(teamId)) continue
        next.get(teamId)?.push(coach)
      }
    }
    return next
  }, [sortedCoaches, sortedTeams])
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
    if (!suggestedGameFormat) return
    setTeamGameFormat(suggestedGameFormat)
  }, [suggestedGameFormat])

  function handleProtectedRouteErrors(err: unknown, forbiddenMessage = 'Action reservee a la direction'): boolean {
    const status = extractStatusCode(err)
    if (status === 401) {
      navigate('/', { replace: true })
      return true
    }
    if (status === 403) {
      openInfoModal(forbiddenMessage, 'Acces refuse')
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
      openInfoModal('Nom du club mis a jour.', 'Succes')
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
    setOpenTeamMenuId(null)
    setIsTeamModalOpen(true)
  }

  function openEditTeamModal(team: Team) {
    setEditingTeamId(team.id)
    setTeamName(team.name || '')
    const parsedCategories = parseAgeCategorySelection(team.category)
    setSelectedAgeCategories(parsedCategories)
    setTeamGameFormat(normalizeGameFormat(team.format) || suggestGameFormatFromAgeCategories(parsedCategories))
    setOpenTeamMenuId(null)
    setIsTeamModalOpen(true)
  }

  function requestDeleteTeam(team: Team) {
    setOpenTeamMenuId(null)
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
      setRefreshTick((tick) => tick + 1)
      openInfoModal('Equipe supprimee.', 'Succes')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, 'Erreur suppression equipe'), 'Erreur')
    } finally {
      setDeletingTeam(false)
    }
  }

  async function submitTeam(e: React.FormEvent) {
    e.preventDefault()

    setSavingTeam(true)
    try {
      if (!isAgeSelectionContiguous) {
        openInfoModal("Selectionne une ou plusieurs categories d'age qui se suivent (ex: U8-U9).", 'Validation')
        return
      }
      if (!teamGameFormat) {
        openInfoModal('Selectionne un format de jeu.', 'Validation')
        return
      }

      const normalizedCategory = selectedAgeCategoryLabel
      const rawProvidedName = teamName.trim()
      const comparableNames = teams
        .filter((team) => !editingTeamId || team.id !== editingTeamId)
        .map((team) => team.name || '')
      const normalizedTeamName = rawProvidedName || buildUniqueTeamName(normalizedCategory, comparableNames)
      if (!normalizedTeamName) {
        openInfoModal("Impossible de determiner le nom de l'equipe.", 'Erreur')
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
        openInfoModal('Equipe mise a jour.', 'Succes')
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
          openInfoModal("Equipe creee mais identifiant introuvable dans la reponse backend.", 'Avertissement')
          await refreshTeamScope()
          return
        }
        setTeams((prev) => [...prev, normalizedCreated])
        if (!selectedTeamId) {
          setSelectedTeamId(normalizedCreated.id)
        }
        openInfoModal('Equipe creee.', 'Succes')
      }

      await refreshTeamScope()
      setRefreshTick((tick) => tick + 1)
      setTeamName('')
      setSelectedAgeCategories([])
      setTeamGameFormat('')
      setEditingTeamId(null)
      setIsTeamModalOpen(false)
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, editingTeamId ? 'Erreur mise a jour equipe' : 'Erreur creation equipe'), 'Erreur')
    } finally {
      setSavingTeam(false)
    }
  }

  function toggleAgeCategory(value: AgeCategoryValue) {
    setSelectedAgeCategories((prev) => (
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    ))
  }

  function openCoachModal() {
    setCoachFirstName('')
    setCoachLastName('')
    setCoachEmail('')
    setCoachPhone('')
    setCoachTeamId(sortedTeams[0]?.id || '')
    setIsCoachModalOpen(true)
  }

  async function submitCoach(e: React.FormEvent) {
    e.preventDefault()
    const firstName = coachFirstName.trim()
    const lastName = coachLastName.trim()
    const emailValue = coachEmail.trim()
    if (!firstName || !lastName || !emailValue || !coachTeamId) {
      openInfoModal('Merci de renseigner prenom, nom, email et equipe.', 'Validation')
      return
    }

    setSavingCoach(true)
    try {
      await apiPost(apiRoutes.accounts.list, {
        role: 'COACH',
        email: emailValue,
        firstName,
        first_name: firstName,
        prenom: firstName,
        lastName,
        last_name: lastName,
        nom: lastName,
        phone: coachPhone.trim() || undefined,
        telephone: coachPhone.trim() || undefined,
        teamId: coachTeamId,
        team_id: coachTeamId,
        managedTeamIds: [coachTeamId],
        managed_team_ids: [coachTeamId],
      })
      setIsCoachModalOpen(false)
      setRefreshTick((tick) => tick + 1)
      openInfoModal('Coach ajoute.', 'Succes')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      const status = extractStatusCode(err)
      if (status === 400) {
        openInfoModal(toErrorMessage(err, 'Donnees coach invalides'), 'Erreur')
        return
      }
      openInfoModal(toErrorMessage(err, 'Erreur ajout coach'), 'Erreur')
    } finally {
      setSavingCoach(false)
    }
  }

  async function updateCoachTeams(coach: ClubCoach, managedTeamIds: string[]) {
    setMutatingCoachId(coach.id)
    try {
      await apiPut(apiRoutes.coaches.teams(coach.id), {
        managedTeamIds: uniqueTeamIds(managedTeamIds),
      })
      setRefreshTick((tick) => tick + 1)
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, 'Erreur mise a jour coach'), 'Erreur')
    } finally {
      setMutatingCoachId(null)
    }
  }

  async function assignCoachToTeam(teamId: string, fallbackCoachId?: string) {
    const coachId = coachSelectionByTeamId[teamId] || fallbackCoachId || ''
    const coach = sortedCoaches.find((item) => item.id === coachId)
    if (!coach) {
      openInfoModal('Selectionne un coach a affecter.', 'Validation')
      return
    }

    const nextManagedTeamIds = uniqueTeamIds([...(coach.managedTeamIds || []), teamId])
    await updateCoachTeams(coach, nextManagedTeamIds)
    setCoachSelectionByTeamId((prev) => ({ ...prev, [teamId]: '' }))
  }

  async function removeCoachFromTeam(coach: ClubCoach, teamId: string) {
    await updateCoachTeams(
      coach,
      (coach.managedTeamIds || []).filter((managedTeamId) => managedTeamId !== teamId),
    )
  }

  async function confirmDeleteCoach() {
    if (!coachPendingDelete?.id) return
    setDeletingCoach(true)
    try {
      await apiDelete(apiRoutes.coaches.byId(coachPendingDelete.id))
      setCoachPendingDelete(null)
      setRefreshTick((tick) => tick + 1)
      openInfoModal('Coach supprime.', 'Succes')
    } catch (err: unknown) {
      if (handleProtectedRouteErrors(err)) return
      openInfoModal(toErrorMessage(err, 'Erreur suppression coach'), 'Erreur')
    } finally {
      setDeletingCoach(false)
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

      {loading && <div>Chargement...</div>}
      {error && <div className="inline-alert error">{error}</div>}

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Mes equipes</h3>
          <RoundIconButton
            ariaLabel="Ajouter une equipe"
            className="menu-dots-button"
            onClick={openCreateTeamModal}
          >
            <PlusIcon size={18} />
          </RoundIconButton>
        </div>
        {sortedTeams.length === 0 ? (
          <div className="club-empty-teams-state">
            <p className="club-empty-teams-text">Aucune equipe.</p>
            <button type="button" style={buttonStyle} onClick={openCreateTeamModal}>
              Ajouter une equipe
            </button>
          </div>
        ) : (
          <div className="club-team-cards">
            {sortedTeams.map((team) => {
              const teamCoaches = coachesByTeamId.get(team.id) || []
              const assignableCoaches = sortedCoaches.filter((coach) => !isCoachAssignedToTeam(coach, team.id))
              const selectValue = coachSelectionByTeamId[team.id] ?? ''

              return (
                <article key={team.id} className="club-team-card">
                  <div className="club-team-card-head">
                    <div className="club-team-title-wrap">
                      <h4 className="club-team-card-title">{team.name || 'Equipe'}</h4>
                      <p className="club-team-card-meta">
                        {[team.category, team.format].filter(Boolean).join(' • ') || 'Categorie et format non renseignes'}
                      </p>
                    </div>
                    <div className="club-menu-wrap">
                      <RoundIconButton
                        ariaLabel={`Ouvrir le menu de l'equipe ${team.name || team.id}`}
                        className="menu-dots-button"
                        size={28}
                        onClick={() => setOpenTeamMenuId((prev) => (prev === team.id ? null : team.id))}
                      >
                        <DotsHorizontalIcon size={16} />
                      </RoundIconButton>
                      {openTeamMenuId === team.id && (
                        <>
                          <button
                            type="button"
                            className="club-menu-backdrop"
                            aria-label="Fermer le menu de l'equipe"
                            onClick={() => setOpenTeamMenuId(null)}
                          />
                          <div className="club-floating-menu">
                            <button type="button" onClick={() => openEditTeamModal(team)}>
                              Modifier
                            </button>
                            <button type="button" className="danger" onClick={() => requestDeleteTeam(team)}>
                              Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="club-team-associations">
                    <div className="club-team-associations-head">
                      <strong>Coachs associes</strong>
                      <span className="club-status-badge">{teamCoaches.length}</span>
                    </div>

                    {teamCoaches.length === 0 ? (
                      <p className="club-inline-hint">Aucun coach affecte a cette equipe.</p>
                    ) : (
                      <div className="club-team-coach-list">
                        {teamCoaches.map((coach) => {
                          const badge = coachInvitationBadge(coach)
                          const busy = mutatingCoachId === coach.id
                          return (
                            <div key={`${team.id}:${coach.id}`} className="club-team-coach-chip">
                              <div className="club-team-coach-copy">
                                <span className="club-team-coach-name">{coachDisplayName(coach)}</span>
                                {badge ? <span className="club-status-badge is-muted">{badge}</span> : null}
                              </div>
                              <button
                                type="button"
                                className="club-chip-remove"
                                onClick={() => { void removeCoachFromTeam(coach, team.id) }}
                                disabled={busy}
                              >
                                {busy ? '...' : 'Retirer'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {assignableCoaches.length > 0 ? (
                      <div className="club-team-assign-row">
                        <select
                          value={selectValue}
                          onChange={(event) => {
                            const value = event.target.value
                            setCoachSelectionByTeamId((prev) => ({ ...prev, [team.id]: value }))
                          }}
                          style={inputStyle}
                          disabled={mutatingCoachId !== null}
                        >
                          <option value="">Selectionner un coach</option>
                          {assignableCoaches.map((coach) => (
                            <option key={coach.id} value={coach.id}>
                              {coachDisplayName(coach)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          style={buttonStyle}
                          onClick={() => { void assignCoachToTeam(team.id, assignableCoaches[0]?.id) }}
                          disabled={mutatingCoachId !== null}
                        >
                          Affecter
                        </button>
                      </div>
                    ) : (
                      <p className="club-inline-hint">Tous les coaches sont deja associes a cette equipe.</p>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel" style={cardStyle}>
        <div className="panel-head">
          <h3 className="panel-title">Coachs</h3>
          <RoundIconButton ariaLabel="Ajouter un coach" className="menu-dots-button" onClick={openCoachModal}>
            <PlusIcon size={18} />
          </RoundIconButton>
        </div>
        {sortedCoaches.length === 0 ? (
          <div className="club-empty-teams-state">
            <p className="club-empty-teams-text">Aucun coach.</p>
            <button type="button" style={buttonStyle} onClick={openCoachModal}>
              Ajouter un coach
            </button>
          </div>
        ) : (
          <div className="club-coaches-table-wrap">
            <table className="club-coaches-table">
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th className="club-table-cell club-table-head">Coach</th>
                  <th className="club-table-cell club-table-head">Equipes</th>
                  <th className="club-table-cell club-table-head">Statut</th>
                  <th className="club-table-cell club-table-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedCoaches.map((coach) => {
                  const badge = coachInvitationBadge(coach)
                  return (
                    <tr key={coach.id}>
                      <td className="club-table-cell">
                        <div className="club-coach-main-copy">
                          <strong>{coachDisplayName(coach)}</strong>
                          {coach.email ? <span>{coach.email}</span> : null}
                        </div>
                      </td>
                      <td className="club-table-cell">{coachManagedTeamsLabel(coach)}</td>
                      <td className="club-table-cell">{badge || 'Actif'}</td>
                      <td className="club-table-cell">
                        <button
                          type="button"
                          className="club-inline-action danger"
                          onClick={() => setCoachPendingDelete(coach)}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
                  {renamingClub ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {isTeamModalOpen && (
        <>
          <div className="club-modal-overlay" onClick={() => !savingTeam && setIsTeamModalOpen(false)} />
          <div
            className="club-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingTeamId ? 'Modifier une equipe' : 'Ajouter une equipe'}
          >
            <div className="club-modal-head">
              <h3>{editingTeamId ? 'Modifier une equipe' : 'Ajouter une equipe'}</h3>
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
                placeholder="Nom de l'equipe"
                style={inputStyle}
                autoFocus
              />
              <div className="club-age-selector-wrap">
                <span className="club-age-selector-label">Categorie d'age</span>
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
                    Les categories selectionnees doivent se suivre (ex: U8-U9).
                  </p>
                )}
              </div>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Format de jeu</span>
                <select value={teamGameFormat} onChange={(e) => setTeamGameFormat(normalizeGameFormat(e.target.value))} style={inputStyle}>
                  <option value="">Selectionner un format</option>
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
                  {savingTeam ? 'Enregistrement...' : editingTeamId ? 'Enregistrer' : 'Creer equipe'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {isCoachModalOpen && (
        <>
          <div className="club-modal-overlay" onClick={() => !savingCoach && setIsCoachModalOpen(false)} />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label="Ajouter un coach">
            <div className="club-modal-head">
              <h3>Ajouter un coach</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => !savingCoach && setIsCoachModalOpen(false)}
                disabled={savingCoach}
              >
                ×
              </button>
            </div>
            <form onSubmit={submitCoach} style={formStyle}>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Prenom</span>
                <input
                  value={coachFirstName}
                  onChange={(e) => setCoachFirstName(e.target.value)}
                  placeholder="Prenom"
                  style={inputStyle}
                  required
                />
              </label>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Nom</span>
                <input
                  value={coachLastName}
                  onChange={(e) => setCoachLastName(e.target.value)}
                  placeholder="Nom"
                  style={inputStyle}
                  required
                />
              </label>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Email</span>
                <input
                  value={coachEmail}
                  onChange={(e) => setCoachEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  style={inputStyle}
                  required
                />
              </label>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Telephone</span>
                <input
                  value={coachPhone}
                  onChange={(e) => setCoachPhone(e.target.value)}
                  placeholder="Telephone"
                  style={inputStyle}
                />
              </label>
              <label className="club-field-grid">
                <span className="club-age-selector-label">Equipe initiale</span>
                <select value={coachTeamId} onChange={(e) => setCoachTeamId(e.target.value)} style={inputStyle} required>
                  <option value="">Selectionner une equipe</option>
                  {sortedTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name || team.id}</option>
                  ))}
                </select>
              </label>
              <div className="club-team-modal-actions">
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setIsCoachModalOpen(false)}
                  disabled={savingCoach}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    ...buttonStyle,
                    ...(savingCoach ? disabledButtonStyle : {}),
                  }}
                  disabled={savingCoach}
                >
                  {savingCoach ? 'Enregistrement...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {teamPendingDelete && (
        <>
          <div className="club-modal-overlay" onClick={() => !deletingTeam && setTeamPendingDelete(null)} />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label="Supprimer une equipe">
            <div className="club-modal-head">
              <h3>Supprimer une equipe</h3>
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
              Supprimer l&apos;equipe &quot;{teamPendingDelete.name || teamPendingDelete.id}&quot; ?
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
                {deletingTeam ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}

      {coachPendingDelete && (
        <>
          <div className="club-modal-overlay" onClick={() => !deletingCoach && setCoachPendingDelete(null)} />
          <div className="club-modal" role="dialog" aria-modal="true" aria-label="Supprimer un coach">
            <div className="club-modal-head">
              <h3>Supprimer un coach</h3>
              <button
                type="button"
                aria-label="Fermer"
                className="club-modal-close"
                onClick={() => !deletingCoach && setCoachPendingDelete(null)}
                disabled={deletingCoach}
              >
                ×
              </button>
            </div>
            <p className="club-modal-text">
              Supprimer le coach &quot;{coachDisplayName(coachPendingDelete)}&quot; du club ?
            </p>
            <div className="club-modal-actions">
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setCoachPendingDelete(null)}
                disabled={deletingCoach}
              >
                Annuler
              </button>
              <button
                type="button"
                style={{
                  ...dangerButtonStyle,
                  ...(deletingCoach ? disabledButtonStyle : {}),
                }}
                onClick={() => { void confirmDeleteCoach() }}
                disabled={deletingCoach}
              >
                {deletingCoach ? 'Suppression...' : 'Supprimer'}
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
