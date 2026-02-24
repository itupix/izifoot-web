


import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { API_BASE } from '../api'
import { apiRoutes } from '../apiRoutes'
function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

// Normalize side/role helpers (handle casing)
const normSide = (s: unknown): 'home' | 'away' => (String(s || '').toLowerCase() === 'away' ? 'away' : 'home')
const isSub = (r: unknown) => String(r || '').toLowerCase() === 'sub'

interface Player {
  id: string
  name: string
  primary_position?: string | null
  secondary_position?: string | null
  email?: string | null
  phone?: string | null
}

interface Convocation {
  player: Player
  status?: 'present' | 'absent' | 'convoque' | 'non_convoque'
  // legacy support from old API:
  present?: boolean
}

interface MatchTeamPlayer { playerId: string; role: 'starter' | 'sub'; player: Player }
interface MatchTeam { id: string; side: string; score: number; players: MatchTeamPlayer[] }
interface Scorer { id: string; playerId: string; side: string; playerName?: string }

interface Match {
  id: string
  opponentName?: string | null
  teams: MatchTeam[]
  scorers: Scorer[]
  scorersDetailed?: Scorer[]
  createdAt: string
}

interface Plateau { id: string; date: string; lieu: string; /* adresse?: string | null */ }

interface SummaryResponse {
  plateau: Plateau
  convocations: Convocation[]
  matches: Match[]
  playersById?: Record<string, Player>
}

export default function MatchDay() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rsvp, setRsvp] = useState<Record<string, { presentUrl: string; absentUrl: string }>>({})

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const allSelected = useMemo(() => {
    const ids = (data?.convocations || []).map(c => c.player.id)
    return ids.length > 0 && ids.every(id => selected[id])
  }, [data, selected])
  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])

  const toggleAll = () => {
    const next: Record<string, boolean> = {}
    const ids = (data?.convocations || []).map(c => c.player.id)
    const value = !allSelected
    ids.forEach(id => next[id] = value)
    setSelected(next)
  }
  const toggleOne = (id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] }))

  const q = useQuery()
  const rsvpStatus = useMemo(() => {
    const s = q.get('rsvp')
    return s === 'present' ? 'present' : s === 'absent' ? 'absent' : null
  }, [q])

  async function genLinksFor(playerId: string, withEmail = true) {
    if (!id) return
    const player = data?.playersById?.[playerId]
    const body: { plateauId: string; email?: string } = { plateauId: id }
    if (withEmail && player?.email) body.email = player.email
    const resp = await fetch(`${API_BASE}${apiRoutes.players.invite(playerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      throw new Error(`Invite failed (${resp.status}) ${t}`)
    }
    const json = await resp.json()
    setRsvp(prev => ({ ...prev, [playerId]: { presentUrl: json.presentUrl, absentUrl: json.absentUrl } }))
    // Optimistic UI: mark as convoked unless already present/absent
    setData(prev => prev ? ({
      ...prev,
      convocations: prev.convocations.map(c => c.player.id === playerId ? {
        ...c,
        status: (c.status === 'present' || c.status === 'absent') ? c.status : 'convoque'
      } : c)
    }) : prev)
  }

  async function genLinksForMany(ids: string[], withEmail: boolean) {
    if (!id) return
    for (const pid of ids) {
      const player = data?.convocations.find(c => c.player.id === pid)?.player
      const body: { plateauId: string; email?: string } = { plateauId: id }
      if (withEmail && player?.email) body.email = player.email
      const resp = await fetch(`${API_BASE}${apiRoutes.players.invite(pid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      })
      if (resp.ok) {
        const json = await resp.json()
        setRsvp(prev => ({ ...prev, [pid]: { presentUrl: json.presentUrl, absentUrl: json.absentUrl } }))
      }
    }
  }

  const convokeSelectedByEmail = async () => {
    const ids = selectedIds
    if (!ids.length) return
    await genLinksForMany(ids, true)
    alert(`Convocation envoyée pour ${ids.length} joueur(s) (si email dispo).`)
  }

  const generateLinksSelected = async () => {
    const ids = selectedIds
    if (!ids.length) return
    await genLinksForMany(ids, false)
    alert(`Liens générés pour ${ids.length} joueur(s). Vous pouvez copier depuis la colonne RSVP.`)
  }

  useEffect(() => {
    const abort = new AbortController()
    async function run() {
      if (!id) return
      try {
        setLoading(true)
        setError(null)
        const resp = await fetch(`${API_BASE}${apiRoutes.plateaus.summary(id)}`, {
          credentials: 'include',
          signal: abort.signal
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const json = await resp.json()
        setData(json)
      } catch (err: unknown) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        if (!isAbort) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => abort.abort()
  }, [id])

  const dateLabel = useMemo(() => {
    if (!data?.plateau?.date) return ''
    try {
      return new Date(data.plateau.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return String(data?.plateau?.date ?? '')
    }
  }, [data])

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>
  if (error) return <div style={{ padding: 24, color: 'crimson' }}>Erreur: {error}</div>
  if (!data) return <div style={{ padding: 24 }}>Aucune donnée</div>

  const { plateau, convocations, matches } = data

  // Helper to format sides (normalize side)
  const getSideLabel = (side: string, m: Match) => {
    const s = normSide(side)
    if (m.opponentName) return s === 'home' ? 'Nous' : m.opponentName
    return s === 'home' ? 'Équipe A' : 'Équipe B'
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {rsvpStatus && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '8px 12px', borderRadius: 8, marginBottom: 16 }}>
          {rsvpStatus === 'present' ? 'Présence confirmée ✅' : 'Absence enregistrée ✅'}
        </div>
      )}
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}><Link to="/">← Retour</Link></div>
        <h1 style={{ margin: '8px 0' }}>Plateau</h1>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><strong>Date:</strong> {dateLabel}</div>
          <div><strong>Lieu:</strong> {plateau.lieu}</div>
          {/* <div><strong>Adresse:</strong> {plateau.adresse || '—'}</div> */}
        </div>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2>Joueurs convoqués</h2>
        {(convocations.length > 0) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px' }}>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{selectedIds.length} sélectionné(s)</span>
            <button
              onClick={convokeSelectedByEmail}
              disabled={!selectedIds.length}
              style={{ border: '1px solid #10b981', color: '#10b981', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
            >
              Convoquer (email)
            </button>
            <button
              onClick={generateLinksSelected}
              disabled={!selectedIds.length}
              style={{ border: '1px solid #3b82f6', color: '#3b82f6', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
            >
              Générer liens
            </button>
          </div>
        )}
        {convocations.length === 0 ? (
          <p>Aucun joueur n'est encore rattaché aux matchs de ce plateau.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 36, borderBottom: '1px solid #ddd', padding: '8px 4px' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 4px' }}>Joueur</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 4px' }}>Poste</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 4px' }}>Statut</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 4px' }}>RSVP</th>
                </tr>
              </thead>
              <tbody>
                {convocations
                  .slice()
                  .sort((a, b) => a.player.name.localeCompare(b.player.name))
                  .map((c) => (
                    <tr key={c.player.id}>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0' }}>
                        <input type="checkbox" checked={!!selected[c.player.id]} onChange={() => toggleOne(c.player.id)} />
                      </td>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0' }}>{c.player.name}</td>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0' }}>
                        {c.player.primary_position || '—'}{c.player.secondary_position ? ` / ${c.player.secondary_position}` : ''}
                      </td>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0' }}>
                        {(() => {
                          const s = c.status ?? (c.present ? 'present' : 'non_convoque')
                          return s === 'present' ? 'Présent' : s === 'absent' ? 'Absent' : s === 'convoque' ? 'Convoqué' : 'Non convoqué'
                        })()}
                        <div style={{ marginTop: 6 }}>
                          {(() => {
                            const s = c.status ?? (c.present ? 'present' : 'non_convoque')
                            if (s === 'non_convoque') {
                              return (
                                <button onClick={() => genLinksFor(c.player.id, true)} style={{ border: '1px solid #10b981', color: '#10b981', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>
                                  Convoquer
                                </button>
                              )
                            }
                            return (
                              <button onClick={() => genLinksFor(c.player.id, true)} style={{ border: '1px solid #6b7280', color: '#374151', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>
                                Renvoyer convocation
                              </button>
                            )
                          })()}
                        </div>
                      </td>
                      <td style={{ padding: '8px 4px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              value={rsvp[c.player.id]?.presentUrl || ''}
                              readOnly
                              placeholder="URL Présence"
                              style={{ flex: 1, padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                            />
                            <button
                              disabled={!rsvp[c.player.id]?.presentUrl}
                              onClick={() => rsvp[c.player.id]?.presentUrl && navigator.clipboard.writeText(rsvp[c.player.id]!.presentUrl)}
                              style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                            >Copier</button>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              value={rsvp[c.player.id]?.absentUrl || ''}
                              readOnly
                              placeholder="URL Absence"
                              style={{ flex: 1, padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                            />
                            <button
                              disabled={!rsvp[c.player.id]?.absentUrl}
                              onClick={() => rsvp[c.player.id]?.absentUrl && navigator.clipboard.writeText(rsvp[c.player.id]!.absentUrl)}
                              style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                            >Copier</button>
                          </div>
                          <div>
                            <button
                              onClick={() => genLinksFor(c.player.id, false)}
                              style={{ border: '1px solid #10b981', color: '#10b981', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                            >Générer (sans email)</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Résultats des matches</h2>
        {matches.length === 0 ? <p>Aucun match enregistré pour ce plateau.</p> : (
          <div style={{ display: 'grid', gap: 16 }}>
            {matches.map((m) => {
              // Normalize team side for matching
              const home = m.teams.find(t => normSide(t.side) === 'home')
              const away = m.teams.find(t => normSide(t.side) === 'away')
              const homeLabel = getSideLabel('home', m)
              const awayLabel = getSideLabel('away', m)
              return (
                <div key={m.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {homeLabel} {home?.score ?? 0} – {away?.score ?? 0} {awayLabel}
                  </div>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{homeLabel}</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {home?.players.map(p => (
                          <li key={p.playerId}>{p.player?.name || p.playerId}{isSub(p.role) ? ' (remp.)' : ''}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{awayLabel}</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {away?.players.map(p => (
                          <li key={p.playerId}>{p.player?.name || p.playerId}{isSub(p.role) ? ' (remp.)' : ''}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {(m.scorers && m.scorers.length > 0) && (
                    <div style={{ marginTop: 8, fontSize: 14 }}>
                      <em>Buteurs:</em>{' '}
                      {(m.scorersDetailed && m.scorersDetailed.length ? m.scorersDetailed : m.scorers).map((s) => {
                        const sSide = normSide(s.side)
                        const sideLabel = sSide === 'home' ? homeLabel : awayLabel
                        const nameFromDetailed = s.playerName as string | undefined
                        const nameFromTeams = [...(home?.players || []), ...(away?.players || [])]
                          .find(p => p.playerId === s.playerId)?.player?.name
                        const nameFromMap = data.playersById?.[s.playerId]?.name
                        const playerName = nameFromDetailed || nameFromTeams || nameFromMap || s.playerId
                        return `${playerName} (${sideLabel})`
                      }).join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
