import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import AttendanceAccordion from '../components/AttendanceAccordion'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, MatchLite, Plateau, Player } from '../types/api'
import './TrainingDetailsPage.css'

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export default function PlateauDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauAttendance, setPlateauAttendance] = useState<Set<string>>(new Set())
  const [plateauMatches, setPlateauMatches] = useState<MatchLite[]>([])
  const [playersOpen, setPlayersOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)

  const [homeScore, setHomeScore] = useState<number>(0)
  const [awayScore, setAwayScore] = useState<number>(0)
  const [matchResult, setMatchResult] = useState<'WIN' | 'LOSS' | 'DRAW'>('WIN')
  const [scorers, setScorers] = useState<string[]>([])
  const [newScorerPlayerId, setNewScorerPlayerId] = useState<string>('')
  const [opponentName, setOpponentName] = useState<string>('')

  const { loading, error } = useAsyncLoader(async ({ isCancelled }) => {
    if (!id) return
    const [p, ps, matches, attends] = await Promise.all([
      apiGet<Plateau>(apiRoutes.plateaus.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<MatchLite[]>(apiRoutes.matches.byPlateau(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('PLATEAU', id)),
    ])
    if (isCancelled()) return
    setPlateau(p)
    setPlayers(ps)
    setPlateauMatches(matches)
    setPlateauAttendance(new Set(attends.map(a => a.playerId)))
  }, [id])

  const dateLabel = useMemo(() => {
    if (!plateau?.date) return ''
    return new Date(plateau.date).toLocaleDateString()
  }, [plateau])

  async function togglePlateauPresence(playerId: string, present: boolean) {
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
    if (!uiConfirm('Supprimer définitivement ce match ?')) return
    try {
      await apiDelete(apiRoutes.matches.byId(matchId))
      setPlateauMatches(prev => prev.filter(m => m.id !== matchId))
    } catch (err: unknown) {
      uiAlert(`Erreur suppression du match: ${toErrorMessage(err)}`)
    }
  }

  async function deletePlateau() {
    if (!id) return
    if (!uiConfirm('Supprimer définitivement ce plateau (et tous ses matchs) ?')) return
    try {
      await apiDelete(apiRoutes.plateaus.byId(id))
      navigate('/planning')
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

  function openEditMatchModal(match: MatchLite) {
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
        <RoundIconButton ariaLabel="Revenir au planning" className="back-round-button" onClick={() => navigate('/planning')}>
          <ChevronLeftIcon size={18} />
        </RoundIconButton>
        <div className="topbar-title">
          <h2>Plateau</h2>
          <p>{dateLabel}</p>
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
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}

      {plateau && (
        <>
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
                        onChange={(e) => togglePlateauPresence(p.id, e.target.checked)}
                      />
                    </label>
                  )
                })}
              </div>
            </AttendanceAccordion>
          </div>

          <section className="details-card" style={{ marginTop: 12 }}>
            <div className="card-head">
              <h3>Matchs</h3>
              <div className="head-actions">
                <span>{plateauMatches.length}</span>
                <button
                  type="button"
                  className="add-button"
                  onClick={openCreateMatchModal}
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
                        style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: 6, padding: '4px 8px' }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMatch(m.id)}
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

      {isMatchModalOpen && (
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
    </div>
  )
}
