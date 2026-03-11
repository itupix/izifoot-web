import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { HttpError } from '../api'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import AttendanceAccordion from '../components/AttendanceAccordion'
import PlayersPresenceSection from '../components/PlayersPresenceSection'
import { ChevronLeftIcon, CloseIcon, DiceIcon, DotsHorizontalIcon, SparklesIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { applyAttendanceValue, extractPresentPlayerIds, persistAttendanceToggle } from '../features/attendance'
import { mapTrainingAiError } from '../features/trainingAi'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, Drill, GenerateTrainingDrillsResponse, Player, Training, TrainingDrill, TrainingRolesResponse } from '../types/api'
import './TrainingDetailsPage.css'

function toPlanningUrl(dateISO?: string | null, fallbackDate?: string | null) {
  const date = dateISO ? new Date(dateISO) : null
  if (date && !Number.isNaN(date.getTime())) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `/planning?date=${y}-${m}-${day}`
  }

  if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
    return `/planning?date=${fallbackDate}`
  }

  return '/planning'
}

function sortTrainingDrills(items: TrainingDrill[]) {
  return [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

function reindexTrainingDrills(items: TrainingDrill[]) {
  return items.map((item, index) => ({ ...item, order: index }))
}

function moveTrainingDrills(items: TrainingDrill[], draggedId: string, targetId: string) {
  const sourceIndex = items.findIndex((item) => item.id === draggedId)
  const targetIndex = items.findIndex((item) => item.id === targetId)

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items

  const next = [...items]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

function normalizeDrillIntroText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getDrillIntro(meta: Drill | null): string {
  if (!meta) return ''
  const source = typeof meta.descriptionHtml === 'string' && meta.descriptionHtml.trim()
    ? meta.descriptionHtml
    : meta.description
  const normalized = normalizeDrillIntroText(source || '')
  if (!normalized) return ''
  const maxLength = 140
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

const TRAINING_OBJECTIVE_PLACEHOLDERS = [
  'Ex: travailler la relance courte sous pression puis finir vite en 3 passes maximum.',
  'Ex: ameliorer le contre-pressing immediat apres perte dans les 6 secondes.',
  'Ex: renforcer les automatismes defensifs sur centre et deuxieme ballon.',
  'Ex: accelerer la transition defense-attaque avec des courses de profondeur.',
  'Ex: corriger le positionnement des milieux pour mieux fermer l axe.',
  'Ex: preparer un plan de pressing haut coordonne sur sortie adverse.',
  'Ex: augmenter la qualite technique sous fatigue en fin de seance.',
  'Ex: travailler les circuits de passe cote faible vers cote fort.',
  'Ex: ameliorer la finition dans la surface apres debordement sur les ailes.',
  'Ex: stabiliser le bloc equipe et la communication sur coups de pied arretes.',
]
const TRAINING_OBJECTIVE_MAX_LENGTH = 400
const TRAINING_OBJECTIVE_MIN_LENGTH = 10
const AI_SKELETON_ITEMS = 4
const TRAINING_ROLE_OPTIONS = [
  'Capitaine',
  'Rangement materiel',
  'Arbitre',
  'Gardien de but',
  'Responsable echauffement',
  'Responsable hydratation',
  'Animateur cri d equipe',
  'Coach adjoint',
]

type TrainingRoleLine = {
  id: string
  role: string
  playerId: string
}

function makeRoleLine(role = '', playerId = ''): TrainingRoleLine {
  return { id: `role-${Math.random().toString(36).slice(2, 10)}`, role, playerId }
}

function ensureTrailingEmptyRoleLine(lines: TrainingRoleLine[]): TrainingRoleLine[] {
  const base = lines.length ? [...lines] : [makeRoleLine()]
  const last = base[base.length - 1]
  if (last.role && last.playerId) {
    base.push(makeRoleLine())
  }
  return base
}

export default function TrainingDetailsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection } = useTeamScope()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [training, setTraining] = useState<Training | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Set<string>>(new Set())
  const [drills, setDrills] = useState<TrainingDrill[]>([])
  const [catalog, setCatalog] = useState<Drill[]>([])
  const [query, setQuery] = useState('')
  const [rolesOpen, setRolesOpen] = useState(false)
  const [manageDrillsOpen, setManageDrillsOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [draggedDrillId, setDraggedDrillId] = useState<string | null>(null)
  const [dragOverDrillId, setDragOverDrillId] = useState<string | null>(null)
  const [savingDrillOrder, setSavingDrillOrder] = useState(false)
  const [trainingObjective, setTrainingObjective] = useState('')
  const [sendingObjective, setSendingObjective] = useState(false)
  const [roleLines, setRoleLines] = useState<TrainingRoleLine[]>([])
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleModalMode, setRoleModalMode] = useState<'add' | 'edit'>('add')
  const [roleEditLineId, setRoleEditLineId] = useState<string | null>(null)
  const [roleMenuLineId, setRoleMenuLineId] = useState<string | null>(null)
  const [roleDraftRole, setRoleDraftRole] = useState(TRAINING_ROLE_OPTIONS[0])
  const [roleDraftPlayerId, setRoleDraftPlayerId] = useState('')
  const [roleRandomizing, setRoleRandomizing] = useState(false)
  const [roleRandomOverlayOpen, setRoleRandomOverlayOpen] = useState(false)
  const [roleRandomOverlayName, setRoleRandomOverlayName] = useState('')
  const roleRandomIntervalRef = useRef<number | null>(null)
  const rolesHydratedRef = useRef(false)
  const lastSavedRoleSignatureRef = useRef('[]')
  const [trainingObjectivePlaceholder] = useState(
    () => TRAINING_OBJECTIVE_PLACEHOLDERS[Math.floor(Math.random() * TRAINING_OBJECTIVE_PLACEHOLDERS.length)],
  )

  const loadTraining = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    rolesHydratedRef.current = false
    const [t, ps, dr, ds, att, roles] = await Promise.all([
      apiGet<Training>(apiRoutes.trainings.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<{ items: Drill[] }>(apiRoutes.drills.list),
      apiGet<TrainingDrill[]>(apiRoutes.trainings.drills(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('TRAINING', id)),
      apiGet<TrainingRolesResponse>(apiRoutes.trainings.roles(id)),
    ])

    if (isCancelled()) return
    setTraining(t)
    setPlayers(ps)
    setCatalog(dr.items)
    setDrills(sortTrainingDrills(ds))
    setAttendance(extractPresentPlayerIds(att))
    const initialRoleLines = ensureTrailingEmptyRoleLine(
      roles.items.map((item) => makeRoleLine(item.role, item.playerId)),
    )
    setRoleLines(initialRoleLines.filter((line) => line.role && line.playerId))
    lastSavedRoleSignatureRef.current = JSON.stringify(
      roles.items.map((item) => ({ role: item.role, playerId: item.playerId })),
    )
    rolesHydratedRef.current = true
    setRolesError(null)
  }, [id])

  const { loading, error } = useAsyncLoader(loadTraining)

  const trainingDateLabel = useMemo(() => {
    if (!training?.date) return ''
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(training.date))
  }, [training])

  const drillIdsInSession = useMemo(() => new Set(drills.map((d) => d.drillId)), [drills])
  const catalogById = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog])
  const backToPlanningUrl = useMemo(
    () => toPlanningUrl(training?.date, searchParams.get('date')),
    [searchParams, training?.date],
  )

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = catalog.filter((d) => {
      if (!needle) return true
      return (
        d.title.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle) ||
        d.category.toLowerCase().includes(needle) ||
        d.tags.some((tag) => tag.toLowerCase().includes(needle))
      )
    })

    return list.sort((a, b) => Number(drillIdsInSession.has(a.id)) - Number(drillIdsInSession.has(b.id)))
  }, [catalog, query, drillIdsInSession])
  const isCancelled = training?.status === 'CANCELLED'
  const writable = me ? canWrite(me.role) && (!requiresSelection || Boolean(selectedTeamId)) : false
  const presentPlayers = useMemo(
    () => players.filter((player) => attendance.has(player.id)),
    [players, attendance],
  )
  const duplicateAssignedPlayerName = useMemo(() => {
    const seen = new Set<string>()
    for (const line of roleLines) {
      if (seen.has(line.playerId)) {
        return players.find((player) => player.id === line.playerId)?.name || 'Joueur'
      }
      seen.add(line.playerId)
    }
    return ''
  }, [roleLines, players])
  const rolePayload = useMemo(
    () => roleLines.map((line) => ({ role: line.role.trim(), playerId: line.playerId })),
    [roleLines],
  )
  const rolePayloadSignature = useMemo(
    () => JSON.stringify(rolePayload),
    [rolePayload],
  )

  useEffect(() => {
    if (!training?.id || !writable || isCancelled) return
    if (!rolesHydratedRef.current) return
    if (duplicateAssignedPlayerName) return
    if (rolePayloadSignature === lastSavedRoleSignatureRef.current) return

    const timeoutId = window.setTimeout(async () => {
      setSavingRoles(true)
      setRolesError(null)
      try {
        const response = await apiPut<TrainingRolesResponse>(apiRoutes.trainings.roles(training.id), {
          items: rolePayload,
        })
        lastSavedRoleSignatureRef.current = JSON.stringify(
          response.items.map((item) => ({ role: item.role, playerId: item.playerId })),
        )
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          if (err.status === 400) setRolesError('Validation invalide: verifier doublons, joueurs et champs.')
          else if (err.status === 401) setRolesError('Session expiree. Veuillez vous reconnecter.')
          else if (err.status === 403) setRolesError('Acces refuse: role COACH ou DIRECTION requis.')
          else if (err.status === 404) setRolesError('Seance introuvable ou hors scope.')
          else if (err.status === 409) setRolesError('Conflit metier sur les affectations de roles.')
          else setRolesError(toErrorMessage(err, 'Erreur', 'Erreur serveur'))
        } else {
          setRolesError(toErrorMessage(err, 'Erreur', 'Erreur serveur'))
        }
      } finally {
      setSavingRoles(false)
      }
    }, 280)

    return () => window.clearTimeout(timeoutId)
  }, [duplicateAssignedPlayerName, isCancelled, rolePayload, rolePayloadSignature, training?.id, writable])

  useEffect(() => () => {
    if (roleRandomIntervalRef.current) {
      window.clearInterval(roleRandomIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (roleModalOpen) return
    if (roleRandomIntervalRef.current) {
      window.clearInterval(roleRandomIntervalRef.current)
      roleRandomIntervalRef.current = null
    }
    setRoleRandomizing(false)
    setRoleRandomOverlayOpen(false)
    setRoleRandomOverlayName('')
  }, [roleModalOpen])

  async function setTrainingStatus(cancelled: boolean) {
    if (!writable) return
    if (!training) return
    try {
      const updated = await apiPut<Training>(apiRoutes.trainings.byId(training.id), {
        status: cancelled ? 'CANCELLED' : 'PLANNED',
      })
      setTraining(updated)
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour statut: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function deleteTraining() {
    if (!writable) return
    if (!training) return
    if (!uiConfirm('Supprimer définitivement cet entraînement ?')) return
    try {
      await apiDelete(apiRoutes.trainings.byId(training.id))
      navigate(backToPlanningUrl)
    } catch (err: unknown) {
      uiAlert(`Erreur suppression: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function togglePresence(playerId: string, present: boolean) {
    if (!writable) return
    if (!training) return
    const previousPresent = attendance.has(playerId)
    setAttendance((prev) => applyAttendanceValue(prev, playerId, present))
    try {
      const payload = await persistAttendanceToggle(apiPost, {
        sessionType: 'TRAINING',
        sessionId: training.id,
        playerId,
        present,
      })
      console.debug('[attendance][training] POST /attendance payload', payload)
    } catch (err: unknown) {
      setAttendance((prev) => applyAttendanceValue(prev, playerId, previousPresent))
      uiAlert(`Erreur présence: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function addDrill(drillId: string) {
    if (!writable) return
    if (!training || !drillId) return
    try {
      const row = await apiPost<TrainingDrill>(apiRoutes.trainings.drills(training.id), { drillId })
      setDrills((prev) => sortTrainingDrills([...prev, row]))
    } catch (err: unknown) {
      uiAlert(`Erreur ajout exercice: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function removeDrill(trainingDrillId: string) {
    if (!writable) return
    if (!training) return
    try {
      await apiDelete(apiRoutes.trainings.drillById(training.id, trainingDrillId))
      setDrills((prev) => prev.filter((d) => d.id !== trainingDrillId))
    } catch (err: unknown) {
      uiAlert(`Erreur suppression exercice: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function persistDrillOrder(previousDrills: TrainingDrill[], nextDrills: TrainingDrill[]) {
    if (!writable) return
    if (!training) return

    const previousById = new Map(previousDrills.map((item) => [item.id, item]))
    const changedRows = nextDrills.filter((item) => previousById.get(item.id)?.order !== item.order)

    if (changedRows.length === 0) return

    setSavingDrillOrder(true)
    try {
      await Promise.all(
        changedRows.map((item) =>
          apiPut<TrainingDrill>(apiRoutes.trainings.drillById(training.id, item.id), { order: item.order }),
        ),
      )
    } catch (err: unknown) {
      setDrills(previousDrills)
      uiAlert(`Erreur réorganisation exercices: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    } finally {
      setSavingDrillOrder(false)
    }
  }

  function handleDrillDragStart(event: React.DragEvent<HTMLElement>, trainingDrillId: string) {
    if (!writable) {
      event.preventDefault()
      return
    }
    if (savingDrillOrder) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', trainingDrillId)
    setDraggedDrillId(trainingDrillId)
    setDragOverDrillId(trainingDrillId)
  }

  function handleDrillDragEnd() {
    setDraggedDrillId(null)
    setDragOverDrillId(null)
  }

  function handleDrillDragOver(event: React.DragEvent<HTMLElement>, trainingDrillId: string) {
    if (!draggedDrillId || draggedDrillId === trainingDrillId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverDrillId !== trainingDrillId) setDragOverDrillId(trainingDrillId)
  }

  async function handleDrillDrop(trainingDrillId: string) {
    if (!writable) return
    if (!draggedDrillId || draggedDrillId === trainingDrillId || savingDrillOrder) {
      setDraggedDrillId(null)
      setDragOverDrillId(null)
      return
    }

    const previousDrills = drills
    const movedDrills = moveTrainingDrills(previousDrills, draggedDrillId, trainingDrillId)
    const nextDrills = reindexTrainingDrills(movedDrills)

    setDrills(nextDrills)
    setDraggedDrillId(null)
    setDragOverDrillId(null)
    await persistDrillOrder(previousDrills, nextDrills)
  }

  function openDrill(drillId: string, trainingDrillId?: string) {
    if (!training) return
    const query = trainingDrillId
      ? `?fromTraining=${training.id}&fromTrainingDrill=${trainingDrillId}`
      : `?fromTraining=${training.id}`
    navigate(`/exercices/${drillId}${query}`)
  }

  function removeRoleLine(lineId: string) {
    setRoleLines((prev) => prev.filter((line) => line.id !== lineId))
  }

  function availablePlayersForLine(lineId?: string) {
    const assignedInOtherLines = new Set(
      roleLines
        .filter((line) => line.id !== lineId && line.playerId.trim())
        .map((line) => line.playerId),
    )
    return presentPlayers.filter((player) => !assignedInOtherLines.has(player.id))
  }

  function openRoleModal() {
    setRolesError(null)
    setRoleModalMode('add')
    setRoleEditLineId(null)
    setRoleDraftRole(TRAINING_ROLE_OPTIONS[0])
    setRoleDraftPlayerId('')
    setRoleMenuLineId(null)
    setRoleModalOpen(true)
  }

  function openRoleEditModal(line: TrainingRoleLine) {
    setRolesError(null)
    setRoleModalMode('edit')
    setRoleEditLineId(line.id)
    setRoleDraftRole(line.role)
    setRoleDraftPlayerId(line.playerId)
    setRoleMenuLineId(null)
    setRoleModalOpen(true)
  }

  function confirmRoleModal() {
    if (!roleDraftRole.trim() || !roleDraftPlayerId) return
    const duplicate = roleLines.some((line) =>
      line.playerId === roleDraftPlayerId && (roleModalMode === 'add' || line.id !== roleEditLineId),
    )
    if (duplicate) {
      const duplicateName = players.find((player) => player.id === roleDraftPlayerId)?.name || 'Joueur'
      setRolesError(`Le joueur "${duplicateName}" est deja affecte.`)
      return
    }
    if (roleModalMode === 'edit' && roleEditLineId) {
      setRoleLines((prev) => prev.map((line) => (
        line.id === roleEditLineId
          ? { ...line, role: roleDraftRole, playerId: roleDraftPlayerId }
          : line
      )))
    } else {
    setRoleLines((prev) => [...prev, makeRoleLine(roleDraftRole, roleDraftPlayerId)])
    }
    setRoleModalOpen(false)
  }

  function pickRandomPlayerForModal() {
    const candidates = availablePlayersForLine(roleModalMode === 'edit' ? roleEditLineId || undefined : undefined)
    if (!candidates.length) {
      uiAlert('Aucun joueur disponible pour ce tirage.')
      return
    }
    if (roleRandomizing) return

    setRoleRandomizing(true)
    setRoleRandomOverlayOpen(true)
    setRoleRandomOverlayName(candidates[0]?.name || '...')
    if (roleRandomIntervalRef.current) window.clearInterval(roleRandomIntervalRef.current)
    roleRandomIntervalRef.current = window.setInterval(() => {
      const rolling = candidates[Math.floor(Math.random() * candidates.length)]
      if (rolling?.id) {
        setRoleDraftPlayerId(rolling.id)
        setRoleRandomOverlayName(rolling.name)
      }
    }, 85)

    window.setTimeout(() => {
      if (roleRandomIntervalRef.current) {
        window.clearInterval(roleRandomIntervalRef.current)
        roleRandomIntervalRef.current = null
      }
      const winner = candidates[Math.floor(Math.random() * candidates.length)]
      if (winner?.id) {
        setRoleDraftPlayerId(winner.id)
        setRoleRandomOverlayName(winner.name)
      }
      setRoleRandomizing(false)
      window.setTimeout(() => {
        setRoleRandomOverlayOpen(false)
      }, 1000)
    }, 2500)
  }

  async function sendTrainingObjective() {
    if (!writable || isCancelled || sendingObjective) return
    if (!training) return
    const objective = trainingObjective.trim()
    if (objective.length < TRAINING_OBJECTIVE_MIN_LENGTH) {
      uiAlert(`L'objectif doit contenir au moins ${TRAINING_OBJECTIVE_MIN_LENGTH} caracteres.`)
      return
    }
    setSendingObjective(true)
    try {
      const generated = await apiPost<GenerateTrainingDrillsResponse>(
        apiRoutes.trainings.generateAiDrills(training.id),
        { objective, includeDiagrams: false },
      )
      const generatedDrills = generated.items.map((item) => ({
        ...item.trainingDrill,
        meta: item.drill,
      }))
      setDrills(sortTrainingDrills(generatedDrills))
      setTrainingObjective('')
    } catch (err: unknown) {
      uiAlert(`Erreur generation IA: ${mapTrainingAiError(err, 'training')}`)
    } finally {
      setSendingObjective(false)
    }
  }

  if (!id) return <div>Entraînement introuvable.</div>

  return (
    <div className="training-details-page">
      <header className="details-page-head">
        <button type="button" className="back-link-button" onClick={() => navigate(backToPlanningUrl)}>
          <ChevronLeftIcon size={18} />
          <span>Retour au planning</span>
        </button>
        <div className="details-page-mainrow">
          <div className="details-page-title-wrap">
            <h1 className="details-page-title">
              Entrainement
              {isCancelled && <span className="cancelled-tag">Annulé</span>}
            </h1>
            <p className="details-page-subtitle">{trainingDateLabel}</p>
          </div>
          <div className="topbar-menu-wrap">
            {writable && (
              <>
                <RoundIconButton
                  ariaLabel="Ouvrir le menu d'actions"
                  className="menu-dots-button"
                  onClick={() => setActionsMenuOpen((prev) => !prev)}
                >
                  <DotsHorizontalIcon size={18} />
                </RoundIconButton>
                {actionsMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="menu-backdrop"
                      aria-label="Fermer le menu"
                      onClick={() => setActionsMenuOpen(false)}
                    />
                    <div className="floating-menu">
                      {training && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuOpen(false)
                            setTrainingStatus(training.status !== 'CANCELLED')
                          }}
                        >
                          {training.status === 'CANCELLED' ? 'Rétablir l’entrainement' : 'Annuler l’entrainement'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          deleteTraining()
                        }}
                      >
                        Supprimer l’entrainement
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}

      {training && (
        <div className="training-details-grid">
          <PlayersPresenceSection
            players={players}
            presentPlayerIds={attendance}
            onTogglePresence={togglePresence}
            cardDisabled={isCancelled || !writable}
            selectionDisabled={isCancelled || !writable}
            selectionDisabledMessage={(
              <p className="muted-line">
                {isCancelled ? 'Séance annulée: sélection indisponible.' : 'Mode lecture seule: sélection indisponible.'}
              </p>
            )}
          />

          <section className={`details-card ${isCancelled ? 'is-disabled' : ''}`}>
            <div className="card-head">
              <h3>Programme</h3>
            </div>
            {isCancelled ? (
              <p className="muted-line">Séance annulée: exercices indisponibles.</p>
            ) : (
              <>
                <form
                  className="training-objective-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    sendTrainingObjective()
                  }}
                >
                  <div className="training-objective-glow" aria-hidden="true" />
                  <div className="training-objective-head">
                    <div className="training-objective-title-wrap">
                      <span className="training-objective-icon" aria-hidden="true">
                        <SparklesIcon size={15} />
                      </span>
                      <label htmlFor="training-objective" className="training-objective-label">
                        Objectif d&apos;entrainement
                      </label>
                    </div>
                    <span className="training-objective-badge">AI Coach</span>
                  </div>
                  <textarea
                    id="training-objective"
                    className="training-objective-input"
                    value={trainingObjective}
                    onChange={(event) => setTrainingObjective(event.target.value)}
                    placeholder={trainingObjectivePlaceholder}
                    maxLength={TRAINING_OBJECTIVE_MAX_LENGTH}
                    disabled={!writable || sendingObjective}
                  />
                  <div className="training-objective-footer">
                    <span className="training-objective-counter">
                      {trainingObjective.length}/{TRAINING_OBJECTIVE_MAX_LENGTH}
                    </span>
                    <button
                      type="submit"
                      className="add-button training-objective-submit"
                      disabled={!writable || sendingObjective || trainingObjective.trim().length < TRAINING_OBJECTIVE_MIN_LENGTH}
                    >
                      {sendingObjective ? 'Generation…' : 'Generer 5 exercices'}
                    </button>
                  </div>
                </form>

                <div className="drill-cards-grid">
                  {sendingObjective ? (
                    Array.from({ length: AI_SKELETON_ITEMS }, (_, index) => (
                      <article key={`ai-skeleton-${index}`} className="drill-card drill-card-skeleton" aria-hidden="true">
                        <div className="drill-card-head">
                          <div className="drill-card-title-wrap">
                            <span className="drill-skeleton-line is-title" />
                          </div>
                          <span className="drill-skeleton-pill">IA</span>
                        </div>
                        <span className="drill-skeleton-line is-meta" />
                      </article>
                    ))
                  ) : (
                    <>
                      {drills.map((row) => {
                        const meta = row.meta || catalogById.get(row.drillId) || null
                        const isDragTarget = dragOverDrillId === row.id && draggedDrillId !== row.id
                        const intro = getDrillIntro(meta)
                        return (
                          <article
                            key={row.id}
                            className={`drill-card ${isDragTarget ? 'is-drag-target' : ''}`}
                            draggable={writable && !savingDrillOrder}
                            onClick={() => openDrill(row.drillId, row.id)}
                            onDragStart={(event) => handleDrillDragStart(event, row.id)}
                            onDragEnd={handleDrillDragEnd}
                            onDragOver={(event) => handleDrillDragOver(event, row.id)}
                            onDrop={(event) => {
                              event.preventDefault()
                              void handleDrillDrop(row.id)
                            }}
                          >
                            <div className="drill-card-head">
                              <div className="drill-card-title-wrap">
                                <h4>{meta?.title || 'Exercice'}</h4>
                              </div>
                              <RoundIconButton
                                ariaLabel="Supprimer l'exercice"
                                className="icon-danger-button card-delete-button"
                                disabled={savingDrillOrder || !writable}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeDrill(row.id)
                                }}
                              >
                                <CloseIcon size={16} />
                              </RoundIconButton>
                            </div>
                            {meta?.category && <small>{meta.category}</small>}
                            {!!intro && <p className="drill-card-description">{intro}</p>}
                          </article>
                        )
                      })}
                      {drills.length === 0 && (
                        <p className="muted-line training-program-empty-state">Aucun exercice ajouté pour cette séance.</p>
                      )}
                    </>
                  )}
                </div>
                {writable && (
                  <button
                    type="button"
                    className="add-button training-program-add-cta"
                    onClick={() => setManageDrillsOpen(true)}
                    aria-label="Ajouter un exercice"
                  >
                    Ajouter un exercice
                  </button>
                )}
              </>
            )}
            {!writable && <p className="muted-line">Mode lecture seule: édition des exercices désactivée.</p>}
            {drills.length > 1 && !isCancelled && savingDrillOrder && <p className="muted-line">Enregistrement du nouvel ordre…</p>}
          </section>

          <AttendanceAccordion
            title="Roles"
            countLabel={`${roleLines.length}`}
            isOpen={rolesOpen}
            onToggle={() => setRolesOpen((prev) => !prev)}
            toggleLabel={rolesOpen ? 'Replier les roles' : 'Ouvrir les roles'}
            disabled={isCancelled}
            disabledMessage={<p className="muted-line">Seance annulee: attribution des roles indisponible.</p>}
          >
            <div className="training-roles-list">
              {roleLines.map((line) => {
                const playerName = players.find((player) => player.id === line.playerId)?.name || 'Joueur introuvable'
                const menuOpen = roleMenuLineId === line.id
                return (
                  <article key={line.id} className="training-role-row">
                    <div className="training-role-static"><strong>{line.role}</strong></div>
                    <div className="training-role-static"><span>{playerName}</span></div>
                    <div className="training-role-menu-wrap">
                      <RoundIconButton
                        ariaLabel={`Actions role ${line.role}`}
                        className="training-role-menu-button"
                        onClick={() => setRoleMenuLineId((prev) => (prev === line.id ? null : line.id))}
                      >
                        <DotsHorizontalIcon size={14} />
                      </RoundIconButton>
                      {menuOpen && (
                        <div className="training-role-menu">
                          <button type="button" onClick={() => openRoleEditModal(line)} disabled={!writable}>
                            Modifier
                          </button>
                          <button type="button" onClick={() => removeRoleLine(line.id)} disabled={!writable}>
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
              {roleLines.length === 0 && (
                <p className="muted-line">Aucun role attribue pour cette seance.</p>
              )}
            </div>

            {(duplicateAssignedPlayerName || rolesError) && (
              <p className="error-text training-roles-error">
                {rolesError || (duplicateAssignedPlayerName
                  ? `Le joueur "${duplicateAssignedPlayerName}" est attribue plusieurs fois.`
                  : '')}
              </p>
            )}
            {savingRoles && <p className="muted-line">Enregistrement des roles...</p>}

            <button
              type="button"
              className="add-button training-roles-add-cta"
              onClick={openRoleModal}
              disabled={!writable || presentPlayers.length === 0}
            >
              Ajouter
            </button>
          </AttendanceAccordion>
        </div>
      )}

      {roleModalOpen && (
        <>
          <div className="modal-overlay" onClick={() => setRoleModalOpen(false)} />
          <div className="drill-modal training-role-random-modal" role="dialog" aria-modal="true">
            <div className="drill-modal-head">
              <h3>Ajouter un role</h3>
              <button type="button" onClick={() => setRoleModalOpen(false)}>✕</button>
            </div>
            <div className="training-role-modal-body">
              <label className="training-role-modal-field">
                <span>Role</span>
                <select value={roleDraftRole} onChange={(e) => setRoleDraftRole(e.target.value)}>
                  {TRAINING_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label className="training-role-modal-field">
                <span>Joueur present</span>
                <select value={roleDraftPlayerId} onChange={(e) => setRoleDraftPlayerId(e.target.value)}>
                  <option value="">Choisir un joueur</option>
                  {roleDraftPlayerId
                    && !availablePlayersForLine(roleModalMode === 'edit' ? roleEditLineId || undefined : undefined)
                      .some((player) => player.id === roleDraftPlayerId)
                    && players.find((player) => player.id === roleDraftPlayerId) && (
                      <option value={roleDraftPlayerId}>
                        {players.find((player) => player.id === roleDraftPlayerId)?.name}
                      </option>
                  )}
                  {availablePlayersForLine(roleModalMode === 'edit' ? roleEditLineId || undefined : undefined).map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </label>
              <div className="training-role-modal-actions">
                <button
                  type="button"
                  className="training-role-modal-random"
                  onClick={pickRandomPlayerForModal}
                  disabled={
                    roleRandomizing
                    || availablePlayersForLine(roleModalMode === 'edit' ? roleEditLineId || undefined : undefined).length === 0
                  }
                >
                  <DiceIcon size={14} />
                  <span>{roleRandomizing ? 'Selection…' : 'Aleatoire'}</span>
                </button>
                <button type="button" className="add-button" onClick={confirmRoleModal} disabled={!roleDraftPlayerId}>
                  {roleModalMode === 'edit' ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {roleRandomOverlayOpen && (
        <div className="training-role-random-overlay" aria-live="polite">
          <div className="training-role-random-overlay-name">
            {roleRandomOverlayName || '...'}
          </div>
        </div>
      )}

      {manageDrillsOpen && !isCancelled && writable && (
        <>
          <div className="modal-overlay" onClick={() => setManageDrillsOpen(false)} />
          <div className="drill-modal manage-modal" role="dialog" aria-modal="true">
            <div className="drill-modal-head">
              <h3>Gérer les exercices</h3>
              <button type="button" onClick={() => setManageDrillsOpen(false)}>✕</button>
            </div>

            <div className="drill-search-box">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un exercice"
              />
            </div>

            <div className="manage-section">
              <h4>Choisir un exercice</h4>
              {filteredCatalog.length === 0 && (
                <p className="muted-line">Aucun exercice trouvé.</p>
              )}
              {filteredCatalog.map((item) => {
                const alreadyAdded = drillIdsInSession.has(item.id)
                return (
                  <article key={item.id} className="drill-card">
                    <div className="drill-card-head">
                      <h4>{item.title}</h4>
                      <div className="card-actions">
                        <button
                          type="button"
                          className="add-text"
                          onClick={() => {
                            setManageDrillsOpen(false)
                            setQuery('')
                            openDrill(item.id)
                          }}
                        >
                          Détails
                        </button>
                        <button
                          type="button"
                          className="add-text"
                          disabled={alreadyAdded}
                          onClick={() => {
                            addDrill(item.id)
                            setManageDrillsOpen(false)
                            setQuery('')
                          }}
                        >
                          {alreadyAdded ? 'Déjà ajouté' : 'Ajouter'}
                        </button>
                      </div>
                    </div>
                    <small>{item.category || '—'} · {item.duration ?? '—'} min</small>
                  </article>
                )
              })}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
