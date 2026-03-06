import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, type Planning } from '../api'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import AttendanceAccordion from '../components/AttendanceAccordion'
import type { PlanningData } from '../components/PlanningEditor'
import PlanningModal from '../components/PlanningModal'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, MatchLite, Plateau, Player } from '../types/api'
import './TrainingDetailsPage.css'

const TEAM_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c2410c',
  '#9333ea', '#0f766e', '#be123c', '#1d4ed8', '#15803d',
  '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4338ca',
]

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function toDateKey(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
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

export default function PlateauDetailsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection } = useTeamScope()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauAttendance, setPlateauAttendance] = useState<Set<string>>(new Set())
  const [plateauMatches, setPlateauMatches] = useState<MatchLite[]>([])
  const [plateauPlannings, setPlateauPlannings] = useState<Planning[]>([])
  const [playersOpen, setPlayersOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [sharedPublicUrl, setSharedPublicUrl] = useState('')
  const [shareQrDataUrl, setShareQrDataUrl] = useState('')
  const [shareQrLoading, setShareQrLoading] = useState(false)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editingPlanning, setEditingPlanning] = useState<Planning | null>(null)
  const [selectedPlanningTeam, setSelectedPlanningTeam] = useState('')
  const [rotationMenuOpen, setRotationMenuOpen] = useState(false)

  const [homeScore, setHomeScore] = useState<number>(0)
  const [awayScore, setAwayScore] = useState<number>(0)
  const [matchResult, setMatchResult] = useState<'WIN' | 'LOSS' | 'DRAW'>('WIN')
  const [scorers, setScorers] = useState<string[]>([])
  const [newScorerPlayerId, setNewScorerPlayerId] = useState<string>('')
  const [opponentName, setOpponentName] = useState<string>('')

  const loadPlateau = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [p, ps, matches, attends, plannings] = await Promise.all([
      apiGet<Plateau>(apiRoutes.plateaus.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<MatchLite[]>(apiRoutes.matches.byPlateau(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('PLATEAU', id)),
      api.listPlannings(),
    ])
    if (isCancelled()) return
    setPlateau(p)
    setPlayers(ps)
    setPlateauMatches(matches)
    setPlateauAttendance(new Set(attends.map(a => a.playerId)))
    setPlateauPlannings(
      plannings
        .filter((planning) => toDateKey(planning.date) === toDateKey(p.date))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 1)
    )
  }, [id])

  const { loading, error } = useAsyncLoader(loadPlateau)

  const dateLabel = useMemo(() => {
    if (!plateau?.date) return ''
    return new Date(plateau.date).toLocaleDateString()
  }, [plateau])
  const backToPlanningUrl = useMemo(
    () => toPlanningUrl(plateau?.date, searchParams.get('date')),
    [plateau?.date, searchParams]
  )

  const plateauPlanning = useMemo(() => plateauPlannings[0] ?? null, [plateauPlannings])
  const plateauPlanningData = useMemo(
    () => (plateauPlanning?.data as PlanningData | undefined) ?? null,
    [plateauPlanning]
  )
  const plateauPlanningTeams = useMemo(() => {
    if (!plateauPlanningData?.slots?.length) return [] as string[]
    const labels = new Set<string>()
    for (const slot of plateauPlanningData.slots) {
      for (const game of slot.games) {
        labels.add(game.A)
        labels.add(game.B)
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [plateauPlanningData])
  const plateauPlanningTeamColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const savedEntries = Array.isArray(plateauPlanningData?.teams) ? plateauPlanningData?.teams : []
    for (const entry of savedEntries ?? []) {
      if (entry?.label && entry?.color) map.set(entry.label, entry.color)
    }
    for (const [index, label] of plateauPlanningTeams.entries()) {
      if (!map.has(label)) map.set(label, TEAM_COLORS[index % TEAM_COLORS.length])
    }
    return map
  }, [plateauPlanningData, plateauPlanningTeams])
  const visiblePlanningSlots = useMemo(() => {
    if (!plateauPlanningData?.slots?.length) return []
    return plateauPlanningData.slots
      .map((slot) => {
        const games = selectedPlanningTeam
          ? slot.games.filter((game) => game.A === selectedPlanningTeam || game.B === selectedPlanningTeam)
          : slot.games
        return { ...slot, games }
      })
      .filter((slot) => slot.games.length > 0)
  }, [plateauPlanningData, selectedPlanningTeam])
  const publicPlateauUrl = useMemo(() => sharedPublicUrl, [sharedPublicUrl])
  const writable = me ? canWrite(me.role) && (!requiresSelection || Boolean(selectedTeamId)) : false

  useEffect(() => {
    let cancelled = false
    if (!isShareModalOpen || !publicPlateauUrl) {
      setShareQrDataUrl('')
      setShareQrLoading(false)
      return
    }
    setShareQrLoading(true)
    void QRCode.toDataURL(publicPlateauUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl: string) => {
        if (cancelled) return
        setShareQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (cancelled) return
        setShareQrDataUrl('')
      })
      .finally(() => {
        if (cancelled) return
        setShareQrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isShareModalOpen, publicPlateauUrl])

  async function togglePlateauPresence(playerId: string, present: boolean) {
    if (!writable) return
    if (!id) return
    try {
      await apiPost(apiRoutes.attendance.list, {
        session_type: 'PLATEAU',
        session_id: id,
        playerId,
        present
      })
      setPlateauAttendance(prev => {
        const next = new Set(prev)
        if (present) next.add(playerId); else next.delete(playerId)
        return next
      })
    } catch (err: unknown) {
      uiAlert(`Erreur présence (plateau): ${toErrorMessage(err)}`)
    }
  }

  async function deleteMatch(matchId: string) {
    if (!writable) return
    if (!uiConfirm('Supprimer définitivement ce match ?')) return
    try {
      await apiDelete(apiRoutes.matches.byId(matchId))
      setPlateauMatches(prev => prev.filter(m => m.id !== matchId))
    } catch (err: unknown) {
      uiAlert(`Erreur suppression du match: ${toErrorMessage(err)}`)
    }
  }

  async function deletePlateau() {
    if (!writable) return
    if (!id) return
    if (!uiConfirm('Supprimer définitivement ce plateau (et tous ses matchs) ?')) return
    try {
      await apiDelete(apiRoutes.plateaus.byId(id))
      navigate(backToPlanningUrl)
    } catch (err: unknown) {
      uiAlert(`Erreur suppression plateau: ${toErrorMessage(err)}`)
    }
  }

  function addScorer() {
    if (!newScorerPlayerId) return
    setScorers(prev => [...prev, newScorerPlayerId])
    setNewScorerPlayerId('')
  }

  function removeScorer(i: number) {
    setScorers(prev => prev.filter((_, idx) => idx !== i))
  }

  function resetMatchForm() {
    setEditingMatchId(null)
    setHomeScore(0)
    setAwayScore(0)
    setMatchResult('WIN')
    setScorers([])
    setNewScorerPlayerId('')
    setOpponentName('')
  }

  function closeMatchModal() {
    setIsMatchModalOpen(false)
    resetMatchForm()
  }

  function openCreateMatchModal() {
    resetMatchForm()
    setIsMatchModalOpen(true)
  }

  function openCreatePlanningModal() {
    if (!writable) return
    if (plateauPlanning) return
    setRotationMenuOpen(false)
    setEditingPlanning(null)
    setIsPlanningModalOpen(true)
  }

  function openEditPlanningModal(planning: Planning) {
    if (!writable) return
    setRotationMenuOpen(false)
    setEditingPlanning(planning)
    setIsPlanningModalOpen(true)
  }

  function closePlanningModal() {
    setIsPlanningModalOpen(false)
    setEditingPlanning(null)
  }

  async function openShareModal() {
    if (!writable) return
    if (!id) return
    setShareCopied(false)
    setShareLoading(true)
    setIsShareModalOpen(true)
    try {
      const data = await apiPost<{ token: string; url?: string }>(apiRoutes.plateaus.share(id), {})
      const fallbackUrl = `${window.location.origin}/plateau/public/${encodeURIComponent(data.token)}`
      setSharedPublicUrl(data.url || fallbackUrl)
    } catch (err: unknown) {
      setSharedPublicUrl('')
      uiAlert(`Erreur génération du lien public: ${toErrorMessage(err)}`)
    } finally {
      setShareLoading(false)
    }
  }

  function closeShareModal() {
    setIsShareModalOpen(false)
    setShareCopied(false)
    setShareQrDataUrl('')
    setShareQrLoading(false)
  }

  async function copyShareLink() {
    if (!publicPlateauUrl) return
    try {
      await navigator.clipboard.writeText(publicPlateauUrl)
      setShareCopied(true)
    } catch {
      uiAlert("Impossible de copier automatiquement le lien.")
    }
  }

  function upsertPlanning(savedPlanning: Planning) {
    setPlateauPlannings([savedPlanning])
    setSelectedPlanningTeam('')
  }

  async function deletePlanningItem(planningId: string) {
    if (!writable) return
    if (!uiConfirm('Supprimer cette rotation ?')) return
    setRotationMenuOpen(false)
    try {
      await api.deletePlanning(planningId)
      setPlateauPlannings([])
      setSelectedPlanningTeam('')
    } catch (err: unknown) {
      uiAlert(`Erreur suppression rotation: ${toErrorMessage(err)}`)
    }
  }

  function openEditMatchModal(match: MatchLite) {
    if (!writable) return
    const home = match.teams.find((t) => t.side === 'home')?.score ?? 0
    const away = match.teams.find((t) => t.side === 'away')?.score ?? 0
    setEditingMatchId(match.id)
    setHomeScore(home)
    setAwayScore(away)
    setMatchResult(home > away ? 'WIN' : home < away ? 'LOSS' : 'DRAW')
    setScorers(match.scorers.filter((s) => s.side === 'home').map((s) => s.playerId))
    setNewScorerPlayerId('')
    setOpponentName(match.opponentName || '')
    setIsMatchModalOpen(true)
  }

  async function submitMatchForm(e: React.FormEvent) {
    if (!writable) return
    e.preventDefault()
    if (!id) return
    if (!opponentName.trim()) {
      uiAlert('Merci de renseigner le nom de l’adversaire.')
      return
    }
    if (matchResult === 'WIN' && homeScore <= awayScore) {
      uiAlert('Le score doit refléter une victoire.')
      return
    }
    if (matchResult === 'LOSS' && homeScore >= awayScore) {
      uiAlert('Le score doit refléter une défaite.')
      return
    }
    if (matchResult === 'DRAW' && homeScore !== awayScore) {
      uiAlert('Le score doit refléter un match nul.')
      return
    }
    try {
      const payload = {
        type: 'PLATEAU' as const,
        plateauId: id,
        sides: {
          home: { starters: [], subs: [] },
          away: { starters: [], subs: [] },
        },
        score: { home: homeScore, away: awayScore },
        buteurs: scorers.map((playerId) => ({ playerId, side: 'home' as const })),
        opponentName: opponentName.trim(),
      }
      if (editingMatchId) {
        const updated = await apiPut<MatchLite>(apiRoutes.matches.byId(editingMatchId), payload)
        setPlateauMatches(prev => prev.map((m) => (m.id === editingMatchId ? updated : m)))
      } else {
        const created = await apiPost<MatchLite>(apiRoutes.matches.list, payload)
        setPlateauMatches(prev => [created, ...prev])
      }
      closeMatchModal()
    } catch (err: unknown) {
      uiAlert(`Erreur ${editingMatchId ? 'mise à jour' : 'création'} match: ${toErrorMessage(err)}`)
    }
  }

  return (
    <div className="training-details-page">
      <header className="topbar">
        <RoundIconButton ariaLabel="Revenir au planning" className="back-round-button" onClick={() => navigate(backToPlanningUrl)}>
          <ChevronLeftIcon size={18} />
        </RoundIconButton>
        <div className="topbar-title">
          <h2>Plateau</h2>
          <p>{dateLabel}</p>
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
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuOpen(false)
                        void openShareModal()
                      }}
                    >
                      Partager le plateau
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setActionsMenuOpen(false)
                        deletePlateau()
                      }}
                    >
                      Supprimer le plateau
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}

      {plateau && (
        <>
          {!writable && <p className="muted-line">Mode lecture seule: actions de modification désactivées.</p>}
          <div className="training-details-grid">
            <section className="details-card">
              <div className="card-head">
                <h3>Informations</h3>
              </div>
              <div style={{ color: '#374151' }}>Lieu : <strong>{plateau.lieu}</strong></div>
            </section>

            <AttendanceAccordion
              countLabel={`${plateauAttendance.size}/${players.length}`}
              isOpen={playersOpen}
              onToggle={() => setPlayersOpen((prev) => !prev)}
              toggleLabel={playersOpen ? 'Réduire la liste des joueurs' : 'Ouvrir la liste des joueurs'}
              disabled={!writable}
              disabledMessage={<p className="muted-line">Mode lecture seule: présences indisponibles.</p>}
            >
              <div className="attendance-list-simple">
                {players.map((p) => {
                  const present = plateauAttendance.has(p.id)
                  return (
                    <label key={p.id} className="attendance-row">
                      <span>{getFirstName(p.name)}</span>
                      <input
                        type="checkbox"
                        checked={present}
                        disabled={!writable}
                        onChange={(e) => togglePlateauPresence(p.id, e.target.checked)}
                      />
                    </label>
                  )
                })}
              </div>
            </AttendanceAccordion>
          </div>

          <section className="details-card">
            <div className="card-head">
              <h3>Rotation</h3>
              <div className="head-actions">
                {!plateauPlanning && (
                  <button
                    type="button"
                    className="add-button"
                    onClick={openCreatePlanningModal}
                    disabled={!plateau?.date || !writable}
                  >
                    Créer une rotation
                  </button>
                )}
                {plateauPlanning && writable && (
                  <div className="topbar-menu-wrap">
                    <RoundIconButton
                      ariaLabel="Ouvrir le menu de la rotation"
                      className="menu-dots-button"
                      onClick={() => setRotationMenuOpen((prev) => !prev)}
                    >
                      <DotsHorizontalIcon size={18} />
                    </RoundIconButton>
                    {rotationMenuOpen && (
                      <>
                        <button
                          type="button"
                          className="menu-backdrop"
                          aria-label="Fermer le menu"
                          onClick={() => setRotationMenuOpen(false)}
                        />
                        <div className="floating-menu">
                          <button type="button" onClick={() => openEditPlanningModal(plateauPlanning)}>
                            Modifier la rotation
                          </button>
                          <button type="button" className="danger" onClick={() => void deletePlanningItem(plateauPlanning.id)}>
                            Supprimer la rotation
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {plateauPlanning ? (
                <>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Mise à jour le {new Date(plateauPlanning.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {plateauPlanningTeams.length > 0 && (
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Filtrer par équipe</span>
                      <select
                        value={selectedPlanningTeam}
                        onChange={(e) => setSelectedPlanningTeam(e.target.value)}
                        style={{ padding: 8, border: '1px solid #dbe5f1', borderRadius: 8 }}
                      >
                        <option value="">Toutes les équipes</option>
                        {plateauPlanningTeams.map((teamLabel) => (
                          <option key={teamLabel} value={teamLabel}>{teamLabel}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {visiblePlanningSlots.map((slot) => (
                      <div
                        key={slot.time}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: 10,
                          padding: 10,
                          background: '#fff',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{slot.time}</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {slot.games.map((game) => (
                            <div
                              key={`${slot.time}-${game.pitch}-${game.A}-${game.B}`}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 10px',
                                background: '#f8fafc',
                                display: 'grid',
                                gap: 6,
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Terrain {game.pitch}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                                  <circle cx="6" cy="6" r="6" fill={plateauPlanningTeamColorMap.get(game.A) ?? TEAM_COLORS[0]} />
                                </svg>
                                {game.A}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                                  <circle cx="6" cy="6" r="6" fill={plateauPlanningTeamColorMap.get(game.B) ?? TEAM_COLORS[1]} />
                                </svg>
                                {game.B}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {selectedPlanningTeam && visiblePlanningSlots.length === 0 && (
                      <div style={{ color: '#6b7280' }}>Aucun créneau pour cette équipe.</div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: '#6b7280' }}>Aucune rotation enregistrée pour ce plateau.</div>
              )}
            </div>
          </section>

          <section className="details-card" style={{ marginTop: 12 }}>
            <div className="card-head">
              <h3>Matchs</h3>
              <div className="head-actions">
                <span>{plateauMatches.length}</span>
                <button
                  type="button"
                  className="add-button"
                  onClick={openCreateMatchModal}
                  disabled={!writable}
                >
                  Ajouter
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {plateauMatches.map(m => {
                const home = m.teams.find(t => t.side === 'home')
                const away = m.teams.find(t => t.side === 'away')
                const homeScoreValue = home?.score ?? 0
                const awayScoreValue = away?.score ?? 0
                const outcome = homeScoreValue > awayScoreValue
                  ? 'win'
                  : homeScoreValue < awayScoreValue
                    ? 'loss'
                    : 'draw'
                const outcomeLabel = outcome === 'win'
                  ? 'Victoire'
                  : outcome === 'loss'
                    ? 'Défaite'
                    : 'Nul'
                const outcomeColor = outcome === 'win'
                  ? '#16a34a'
                  : outcome === 'loss'
                    ? '#dc2626'
                    : '#94a3b8'
                const ourScorers = m.scorers
                  .filter(s => s.side === 'home')
                  .map(s => players.find(p => p.id === s.playerId)?.name || s.playerId)
                return (
                  <div
                    key={m.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderLeft: `6px solid ${outcomeColor}`,
                      borderRadius: 8,
                      padding: 10,
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{m.opponentName || 'Adversaire'}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {outcomeLabel}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{homeScoreValue} - {awayScoreValue}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
                      <strong>Buteurs:</strong> {ourScorers.length ? ourScorers.join(', ') : '—'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => openEditMatchModal(m)}
                        disabled={!writable}
                        style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: 6, padding: '4px 8px' }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMatch(m.id)}
                        disabled={!writable}
                        style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )
              })}
              {plateauMatches.length === 0 && (
                <div style={{ color: '#6b7280' }}>Aucun match encore enregistré pour ce plateau.</div>
              )}
            </div>
          </section>
        </>
      )}

      {writable && isMatchModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeMatchModal} />
          <div className="drill-modal" role="dialog" aria-modal="true">
            <div className="drill-modal-head">
              <h3>{editingMatchId ? 'Modifier le match' : 'Ajouter un match'}</h3>
              <button type="button" onClick={closeMatchModal}>✕</button>
            </div>
            <form onSubmit={submitMatchForm} style={{ display: 'grid', gap: 10 }}>
              <input
                placeholder="Nom de l’adversaire"
                value={opponentName}
                onChange={e => setOpponentName(e.target.value)}
                style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={homeScore}
                  onChange={e => setHomeScore(Number(e.target.value))}
                  placeholder="Nos buts"
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
                <input
                  type="number"
                  min={0}
                  value={awayScore}
                  onChange={e => setAwayScore(Number(e.target.value))}
                  placeholder="Buts adverses"
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Résultat</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setMatchResult('WIN')}
                    style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '6px 10px', background: matchResult === 'WIN' ? '#dcfce7' : '#fff' }}
                  >
                    Victoire
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchResult('LOSS')}
                    style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '6px 10px', background: matchResult === 'LOSS' ? '#fee2e2' : '#fff' }}
                  >
                    Défaite
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchResult('DRAW')}
                    style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '6px 10px', background: matchResult === 'DRAW' ? '#e2e8f0' : '#fff' }}
                  >
                    Nul
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Buteurs</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <select
                    value={newScorerPlayerId}
                    onChange={e => setNewScorerPlayerId(e.target.value)}
                    style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                  >
                    <option value="">— Choisir un joueur —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={addScorer}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}
                  >
                    Ajouter
                  </button>
                </div>
                {scorers.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                    {scorers.map((playerId, i) => (
                      <li key={`${playerId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', background: '#fff' }}>
                        <span>{players.find(p => p.id === playerId)?.name || playerId}</span>
                        <button
                          type="button"
                          onClick={() => removeScorer(i)}
                          style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '2px 6px' }}
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={closeMatchModal}
                  style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', padding: '6px 10px' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}
                >
                  {editingMatchId ? 'Enregistrer' : 'Créer le match'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {writable && isPlanningModalOpen && plateau?.date && (
        <PlanningModal
          dateISO={plateau.date}
          planning={editingPlanning}
          onClose={closePlanningModal}
          onSaved={upsertPlanning}
        />
      )}

      {writable && isShareModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeShareModal} />
          <div className="drill-modal share-modal" role="dialog" aria-modal="true" aria-label="Partager le plateau">
            <div className="drill-modal-head">
              <h3>Partager le plateau</h3>
              <button type="button" onClick={closeShareModal}>✕</button>
            </div>
            <div className="share-content">
              <p className="muted-line">
                Ce lien ouvre la version publique du plateau avec les blocs titre/date, informations et rotation.
              </p>
              <label className="share-url-block">
                <span>Lien public</span>
                <input type="text" readOnly value={shareLoading ? 'Génération du lien…' : publicPlateauUrl} />
              </label>
              <div className="share-actions">
                <button type="button" onClick={() => void copyShareLink()} disabled={shareLoading || !publicPlateauUrl}>
                  {shareCopied ? 'Lien copié' : 'Copier le lien'}
                </button>
                <a
                  href={publicPlateauUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!publicPlateauUrl) e.preventDefault()
                  }}
                  aria-disabled={!publicPlateauUrl}
                >
                  Ouvrir le lien
                </a>
              </div>
              {shareQrLoading && <p className="muted-line">Génération du QR code…</p>}
              {shareQrDataUrl && (
                <div className="share-qr-wrap">
                  <img src={shareQrDataUrl} alt="QR code du lien public du plateau" width={220} height={220} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
