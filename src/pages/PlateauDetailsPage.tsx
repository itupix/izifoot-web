import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, MatchLite, Plateau, Player } from '../types/api'

export default function PlateauDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauAttendance, setPlateauAttendance] = useState<Set<string>>(new Set())
  const [plateauMatches, setPlateauMatches] = useState<MatchLite[]>([])
  const [matchEdits, setMatchEdits] = useState<Record<string, { home: number; away: number; opponentName: string }>>({})

  const [homeStarters, setHomeStarters] = useState<string[]>([])
  const [awayStarters, setAwayStarters] = useState<string[]>([])
  const [homeScore, setHomeScore] = useState<number>(0)
  const [awayScore, setAwayScore] = useState<number>(0)
  const [scorers, setScorers] = useState<{ playerId: string; side: 'home' | 'away' }[]>([])
  const [newScorerPlayerId, setNewScorerPlayerId] = useState<string>('')
  const [newScorerSide, setNewScorerSide] = useState<'home' | 'away'>('home')
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

  useEffect(() => {
    setMatchEdits(prev => {
      const next = { ...prev }
      for (const m of plateauMatches) {
        if (!next[m.id]) {
          const home = m.teams.find(t => t.side === 'home')?.score ?? 0
          const away = m.teams.find(t => t.side === 'away')?.score ?? 0
          next[m.id] = { home, away, opponentName: m.opponentName || '' }
        }
      }
      return next
    })
  }, [plateauMatches])

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

  async function saveMatchEdits(matchId: string) {
    const e = matchEdits[matchId]
    if (!e) return
    try {
      const updated = await apiPut<MatchLite>(apiRoutes.matches.byId(matchId), {
        score: { home: e.home, away: e.away },
        opponentName: e.opponentName || undefined
      })
      setPlateauMatches(prev => prev.map(m => m.id === matchId ? updated : m))
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour du match: ${toErrorMessage(err)}`)
    }
  }

  async function deleteMatch(matchId: string) {
    if (!uiConfirm('Supprimer définitivement ce match ?')) return
    try {
      await apiDelete(apiRoutes.matches.byId(matchId))
      setPlateauMatches(prev => prev.filter(m => m.id !== matchId))
      setMatchEdits(prev => { const n = { ...prev }; delete n[matchId]; return n })
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

  function readMultiSelect(sel: HTMLSelectElement): string[] {
    return Array.from(sel.selectedOptions).map(o => o.value)
  }

  function addScorer() {
    if (!newScorerPlayerId) return
    setScorers(prev => [...prev, { playerId: newScorerPlayerId, side: newScorerSide }])
    setNewScorerPlayerId('')
  }

  function removeScorer(i: number) {
    setScorers(prev => prev.filter((_, idx) => idx !== i))
  }

  async function createPlateauMatch(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    try {
      const payload = {
        type: 'PLATEAU' as const,
        plateauId: id,
        sides: {
          home: { starters: homeStarters, subs: [] },
          away: { starters: awayStarters, subs: [] },
        },
        score: { home: homeScore, away: awayScore },
        buteurs: scorers,
        opponentName: opponentName || undefined,
      }
      const created = await apiPost<MatchLite>(apiRoutes.matches.list, payload)
      setPlateauMatches(prev => [created, ...prev])
      setHomeStarters([]); setAwayStarters([]); setHomeScore(0); setAwayScore(0); setScorers([]); setNewScorerPlayerId(''); setNewScorerSide('home'); setOpponentName('')
    } catch (err: unknown) {
      uiAlert(`Erreur création match: ${toErrorMessage(err)}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/planning">← Retour</Link>
          <h2 style={{ margin: '4px 0' }}>Plateau</h2>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{dateLabel}</div>
        </div>
        <button onClick={deletePlateau} style={{ border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, background: '#fff', padding: '4px 8px' }}>Supprimer</button>
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {plateau && (
        <>
          <div style={{ color: '#374151' }}>Lieu : <strong>{plateau.lieu}</strong></div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Présents: {plateauAttendance.size} / {players.length}</span>
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 6, background: '#fff' }}>
            {players.map(p => {
              const present = plateauAttendance.has(p.id)
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{p.primary_position}{p.secondary_position ? ` / ${p.secondary_position}` : ''}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={present}
                    onChange={(e) => togglePlateauPresence(p.id, e.target.checked)}
                  />
                </label>
              )
            })}
          </div>

          <h4 style={{ margin: '12px 0 6px' }}>➕ Nouveau match</h4>
          <form onSubmit={createPlateauMatch} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fcfcfc', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <input
                placeholder="Nom de l’adversaire (ex: FC Trifouillis)"
                value={opponentName}
                onChange={e => setOpponentName(e.target.value)}
                style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Home – titulaires</div>
                <select multiple size={6}
                  value={homeStarters}
                  onChange={(e) => setHomeStarters(readMultiSelect(e.currentTarget))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: 6 }}>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 8, alignContent: 'center', justifyItems: 'center' }}>
                <input type="number" min={0} value={homeScore} onChange={e => setHomeScore(Number(e.target.value))} style={{ width: 50, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4 }} />
                <div style={{ fontWeight: 700 }}>Score</div>
                <input type="number" min={0} value={awayScore} onChange={e => setAwayScore(Number(e.target.value))} style={{ width: 50, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Away – titulaires</div>
                <select multiple size={6}
                  value={awayStarters}
                  onChange={(e) => setAwayStarters(readMultiSelect(e.currentTarget))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: 6 }}>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Buteurs</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8, alignItems: 'center' }}>
                <select value={newScorerPlayerId} onChange={e => setNewScorerPlayerId(e.target.value)}
                  style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <option value="">— Choisir un joueur —</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={newScorerSide} onChange={e => setNewScorerSide(e.target.value as 'home' | 'away')}
                  style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                </select>
                <button type="button" onClick={addScorer}
                  style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}>Ajouter</button>
              </div>
              {scorers.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'grid', gap: 6 }}>
                  {scorers.map((s, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', background: '#fff' }}>
                      <span>
                        {s.side === 'home' ? 'Home' : 'Away'} • {players.find(p => p.id === s.playerId)?.name || s.playerId}
                      </span>
                      <button type="button" onClick={() => removeScorer(i)}
                        style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '2px 6px' }}>Retirer</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="submit"
                style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}>
                Créer le match
              </button>
            </div>
          </form>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h4 style={{ margin: '8px 0' }}>🏟️ Matchs joués</h4>
            <small style={{ color: '#6b7280' }}>{plateauMatches.length} match(es)</small>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {plateauMatches.map(m => {
              const home = m.teams.find(t => t.side === 'home')
              const away = m.teams.find(t => t.side === 'away')
              return (
                <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div><strong>Home</strong> {home ? `(${home.players?.map(p => p.player.name).join(', ') || ''})` : ''}</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{home?.score ?? 0} - {away?.score ?? 0}</div>
                      {m.opponentName && <div style={{ fontSize: 12, color: '#6b7280' }}>vs {m.opponentName}</div>}
                    </div>
                    <div><strong>Away</strong> {away ? `(${away.players?.map(p => p.player.name).join(', ') || ''})` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <label style={{ fontSize: 12, color: '#6b7280' }}>Score</label>
                    <input type="number" min={0} style={{ width: 60, padding: 4, border: '1px solid #e5e7eb', borderRadius: 6 }}
                      value={(matchEdits[m.id]?.home ?? m.teams.find(t => t.side === 'home')?.score ?? 0)}
                      onChange={e => setMatchEdits(prev => ({ ...prev, [m.id]: { ...(prev[m.id] || { home: 0, away: 0, opponentName: '' }), home: Number(e.target.value) } }))}
                    />
                    <span>:</span>
                    <input type="number" min={0} style={{ width: 60, padding: 4, border: '1px solid #e5e7eb', borderRadius: 6 }}
                      value={(matchEdits[m.id]?.away ?? m.teams.find(t => t.side === 'away')?.score ?? 0)}
                      onChange={e => setMatchEdits(prev => ({ ...prev, [m.id]: { ...(prev[m.id] || { home: 0, away: 0, opponentName: '' }), away: Number(e.target.value) } }))}
                    />
                    <input placeholder="Adversaire" style={{ flex: 1, padding: 4, border: '1px solid #e5e7eb', borderRadius: 6 }}
                      value={(matchEdits[m.id]?.opponentName ?? m.opponentName ?? '')}
                      onChange={e => setMatchEdits(prev => ({ ...prev, [m.id]: { ...(prev[m.id] || { home: 0, away: 0, opponentName: '' }), opponentName: e.target.value } }))}
                    />
                    <button onClick={() => saveMatchEdits(m.id)} style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: 6, padding: '4px 8px' }}>Enregistrer</button>
                    <button onClick={() => deleteMatch(m.id)} style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>Supprimer</button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
                    {(() => {
                      const name = (pid: string) => players.find(p => p.id === pid)?.name || pid
                      const sh = m.scorers.filter(s => s.side === 'home').map(s => name(s.playerId))
                      const sa = m.scorers.filter(s => s.side === 'away').map(s => name(s.playerId))
                      return (
                        <div>
                          <div><strong>Buteurs Home:</strong> {sh.length ? sh.join(', ') : '—'}</div>
                          <div><strong>Buteurs Away:</strong> {sa.length ? sa.join(', ') : '—'}</div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
            {plateauMatches.length === 0 && (
              <div style={{ color: '#6b7280' }}>Aucun match encore enregistré pour ce plateau.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
