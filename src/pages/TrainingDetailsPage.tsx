import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import AttendanceAccordion from '../components/AttendanceAccordion'
import { ChevronLeftIcon, CloseIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, Drill, Player, Training, TrainingDrill } from '../types/api'
import './TrainingDetailsPage.css'

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

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
  const [playersOpen, setPlayersOpen] = useState(false)
  const [manageDrillsOpen, setManageDrillsOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [draggedDrillId, setDraggedDrillId] = useState<string | null>(null)
  const [dragOverDrillId, setDragOverDrillId] = useState<string | null>(null)
  const [savingDrillOrder, setSavingDrillOrder] = useState(false)

  const loadTraining = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [t, ps, dr, ds, att] = await Promise.all([
      apiGet<Training>(apiRoutes.trainings.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<{ items: Drill[] }>(apiRoutes.drills.list),
      apiGet<TrainingDrill[]>(apiRoutes.trainings.drills(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('TRAINING', id)),
    ])

    if (isCancelled()) return
    setTraining(t)
    setPlayers(ps)
    setCatalog(dr.items)
    setDrills(sortTrainingDrills(ds))
    setAttendance(new Set(att.map((a) => a.playerId)))
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
    try {
      await apiPost(apiRoutes.attendance.list, {
        session_type: 'TRAINING',
        session_id: training.id,
        playerId,
        present,
      })

      setAttendance((prev) => {
        const next = new Set(prev)
        if (present) next.add(playerId)
        else next.delete(playerId)
        return next
      })
    } catch (err: unknown) {
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

  function openDrill(drillId: string) {
    if (!training) return
    navigate(`/exercices/${drillId}?fromTraining=${training.id}`)
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
          <AttendanceAccordion
            countLabel={`${attendance.size}/${players.length}`}
            isOpen={playersOpen}
            onToggle={() => setPlayersOpen((prev) => !prev)}
            toggleLabel={playersOpen ? 'Réduire la liste des joueurs' : 'Ouvrir la liste des joueurs'}
            disabled={isCancelled || !writable}
            disabledMessage={<p className="muted-line">{isCancelled ? 'Séance annulée: présences indisponibles.' : 'Mode lecture seule: présences indisponibles.'}</p>}
          >
            <div className="attendance-list-simple">
              {players.map((player) => {
                const present = attendance.has(player.id)
                return (
                  <label key={player.id} className="attendance-row">
                    <span>{getFirstName(player.name)}</span>
                    <input
                      type="checkbox"
                      checked={present}
                      disabled={!writable}
                      onChange={(e) => togglePresence(player.id, e.target.checked)}
                    />
                  </label>
                )
              })}
            </div>
          </AttendanceAccordion>

          <section className={`details-card ${isCancelled ? 'is-disabled' : ''}`}>
            <div className="card-head">
              <h3>Exercices</h3>
              <div className="head-actions">
                {!isCancelled && writable && (
                  <button
                    type="button"
                    className="add-button"
                    onClick={() => setManageDrillsOpen(true)}
                    aria-label="Ajouter un exercice"
                  >
                    Ajouter
                  </button>
                )}
              </div>
            </div>
            {isCancelled ? (
              <p className="muted-line">Séance annulée: exercices indisponibles.</p>
            ) : (
              <div className="drill-cards-grid">
                {drills.map((row) => {
                  const meta = row.meta || catalogById.get(row.drillId) || null
                  const isDragTarget = dragOverDrillId === row.id && draggedDrillId !== row.id
                  return (
                    <article
                      key={row.id}
                      className={`drill-card ${isDragTarget ? 'is-drag-target' : ''}`}
                      draggable={writable && !savingDrillOrder}
                      onClick={() => openDrill(row.drillId)}
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
                    </article>
                  )
                })}
                {drills.length === 0 && (
                  <p className="muted-line">Aucun exercice ajouté pour cette séance.</p>
                )}
              </div>
            )}
            {!writable && <p className="muted-line">Mode lecture seule: édition des exercices désactivée.</p>}
            {drills.length > 1 && !isCancelled && savingDrillOrder && <p className="muted-line">Enregistrement du nouvel ordre…</p>}
          </section>
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
