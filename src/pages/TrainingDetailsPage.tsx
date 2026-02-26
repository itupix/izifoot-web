import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, Drill, Player, Training, TrainingDrill } from '../types/api'
import './TrainingDetailsPage.css'

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export default function TrainingDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [training, setTraining] = useState<Training | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Set<string>>(new Set())
  const [drills, setDrills] = useState<TrainingDrill[]>([])
  const [catalog, setCatalog] = useState<Drill[]>([])
  const [query, setQuery] = useState('')
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [manageDrillsOpen, setManageDrillsOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  const { loading, error } = useAsyncLoader(async ({ isCancelled }) => {
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
    setDrills(ds)
    setAttendance(new Set(att.map((a) => a.playerId)))
  }, [id])

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

  async function setTrainingStatus(cancelled: boolean) {
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
    if (!training) return
    if (!uiConfirm('Supprimer définitivement cet entraînement ?')) return
    try {
      await apiDelete(apiRoutes.trainings.byId(training.id))
      navigate('/planning')
    } catch (err: unknown) {
      uiAlert(`Erreur suppression: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function togglePresence(playerId: string, present: boolean) {
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
    if (!training || !drillId) return
    try {
      const row = await apiPost<TrainingDrill>(apiRoutes.trainings.drills(training.id), { drillId })
      setDrills((prev) => [...prev, row])
    } catch (err: unknown) {
      uiAlert(`Erreur ajout exercice: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  async function removeDrill(trainingDrillId: string) {
    if (!training) return
    try {
      await apiDelete(apiRoutes.trainings.drillById(training.id, trainingDrillId))
      setDrills((prev) => prev.filter((d) => d.id !== trainingDrillId))
    } catch (err: unknown) {
      uiAlert(`Erreur suppression exercice: ${toErrorMessage(err, 'Erreur', 'Erreur serveur')}`)
    }
  }

  if (!id) return <div>Entraînement introuvable.</div>

  return (
    <div className="training-details-page">
      <header className="topbar">
        <RoundIconButton ariaLabel="Revenir à la page précédente" className="back-round-button" onClick={() => navigate(-1)}>
          <ChevronLeftIcon size={18} />
        </RoundIconButton>
        <div className="topbar-title">
          <h2>
            Entrainement
            {isCancelled && <span className="cancelled-tag">Annulé</span>}
          </h2>
          <p>{trainingDateLabel}</p>
        </div>
        <div className="topbar-menu-wrap">
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
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}

      {training && (
        <div className="training-details-grid">
          <section className={`details-card ${isCancelled ? 'is-disabled' : ''}`}>
            {!isCancelled ? (
              <button
                type="button"
                className="card-head-button"
                onClick={() => setPlayersOpen((prev) => !prev)}
                aria-expanded={playersOpen}
                aria-label={playersOpen ? 'Réduire la liste des joueurs' : 'Ouvrir la liste des joueurs'}
              >
                <div className="card-head">
                  <h3>Présents</h3>
                  <div className="head-actions">
                    <span>{attendance.size}/{players.length}</span>
                    <ChevronRightIcon size={18} style={{ transform: playersOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                  </div>
                </div>
              </button>
            ) : (
              <div className="card-head">
                <h3>Présents</h3>
                <div className="head-actions">
                  <span>{attendance.size}/{players.length}</span>
                </div>
              </div>
            )}
            {isCancelled ? (
              <p className="muted-line">Séance annulée: présences indisponibles.</p>
            ) : playersOpen && (
              <div className="attendance-list-simple">
                {players.map((player) => {
                  const present = attendance.has(player.id)
                  return (
                    <label key={player.id} className="attendance-row">
                      <span>{getFirstName(player.name)}</span>
                      <input
                        type="checkbox"
                        checked={present}
                        onChange={(e) => togglePresence(player.id, e.target.checked)}
                      />
                    </label>
                  )
                })}
              </div>
            )}
          </section>

          <section className={`details-card ${isCancelled ? 'is-disabled' : ''}`}>
            <div className="card-head">
              <h3>Exercices</h3>
              <div className="head-actions">
                {!isCancelled && (
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
              <>
                <div className="drill-cards-grid">
                  {drills.map((row) => {
                    const meta = row.meta || catalogById.get(row.drillId) || null
                    return (
                      <article
                        key={row.id}
                        className="drill-card"
                        onClick={() => {
                          if (meta) setSelectedDrill(meta)
                        }}
                      >
                        <div className="drill-card-head">
                          <h4>{meta?.title || 'Exercice'}</h4>
                          <RoundIconButton
                            ariaLabel="Supprimer l'exercice"
                            className="icon-danger-button card-delete-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeDrill(row.id)
                            }}
                          >
                            <CloseIcon size={16} />
                          </RoundIconButton>
                        </div>
                        <small>{meta?.category || '—'} · {row.duration ?? meta?.duration ?? '—'} min</small>
                      </article>
                    )
                  })}
                  {drills.length === 0 && (
                    <p className="muted-line">Aucun exercice ajouté pour cette séance.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {manageDrillsOpen && !isCancelled && (
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
                        <button type="button" className="add-text" onClick={() => setSelectedDrill(item)}>
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

      {selectedDrill && (
        <>
          <div className="modal-overlay" onClick={() => setSelectedDrill(null)} />
          <div className="drill-modal" role="dialog" aria-modal="true">
            <div className="drill-modal-head">
              <h3>{selectedDrill.title}</h3>
              <button type="button" onClick={() => setSelectedDrill(null)}>✕</button>
            </div>
            <p>{selectedDrill.description || 'Aucune description.'}</p>
            <div className="modal-meta-grid">
              <div>
                <strong>Catégorie</strong>
                <span>{selectedDrill.category || '—'}</span>
              </div>
              <div>
                <strong>Joueurs</strong>
                <span>{selectedDrill.players || '—'}</span>
              </div>
              <div>
                <strong>Durée</strong>
                <span>{selectedDrill.duration ?? '—'} min</span>
              </div>
              <div>
                <strong>Tags</strong>
                <span>{selectedDrill.tags.length ? selectedDrill.tags.join(', ') : '—'}</span>
              </div>
              <div>
                <strong>Statut séance</strong>
                <span>{drillIdsInSession.has(selectedDrill.id) ? 'Ajouté' : 'Non ajouté'}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
