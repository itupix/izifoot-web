import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import type { ClubMe, MatchLite, MatchTeamLite, Player } from '../types/api'
import { uiAlert } from '../ui'
import './MatchDetailsPage.css'

type MatchDetailsData = MatchLite & {
  playersById?: Record<string, Player>
}

function getTeam(match: MatchLite, side: 'home' | 'away'): MatchTeamLite | undefined {
  return match.teams.find((team) => team.side === side)
}

function isNotPlayed(match: MatchLite) {
  const home = getTeam(match, 'home')?.score ?? 0
  const away = getTeam(match, 'away')?.score ?? 0
  const homeScorersCount = match.scorers.filter((s) => s.side === 'home').length
  return home === 0 && away === 0 && homeScorersCount === 0
}

type SideDraft = {
  starters: string[]
  subs: string[]
}

type MatchDraft = {
  home: SideDraft
  away: SideDraft
  scorers: Array<{ playerId: string; side: 'home' | 'away' }>
}

function buildDraft(match: MatchDetailsData): MatchDraft {
  const homePlayers = getTeam(match, 'home')?.players ?? []
  const awayPlayers = getTeam(match, 'away')?.players ?? []
  const ids = (list: Array<{ playerId?: string }>) => list
    .map((p) => p.playerId)
    .filter((playerId): playerId is string => Boolean(playerId))
  return {
    home: {
      starters: ids(homePlayers.filter((p) => p.role !== 'sub')),
      subs: ids(homePlayers.filter((p) => p.role === 'sub')),
    },
    away: {
      starters: ids(awayPlayers.filter((p) => p.role !== 'sub')),
      subs: ids(awayPlayers.filter((p) => p.role === 'sub')),
    },
    scorers: match.scorers.map((s) => ({ playerId: s.playerId, side: s.side })),
  }
}

export default function MatchDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchDetailsData | null>(null)
  const [clubName, setClubName] = useState<string>('Club')
  const [players, setPlayers] = useState<Player[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<MatchDraft | null>(null)
  const [selectedHomePlayer, setSelectedHomePlayer] = useState('')
  const [selectedAwayPlayer, setSelectedAwayPlayer] = useState('')
  const [selectedHomeRole, setSelectedHomeRole] = useState<'starter' | 'sub'>('starter')
  const [selectedAwayRole, setSelectedAwayRole] = useState<'starter' | 'sub'>('starter')
  const [selectedHomeScorer, setSelectedHomeScorer] = useState('')
  const [selectedAwayScorer, setSelectedAwayScorer] = useState('')

  const loadMatch = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [payload, club, roster] = await Promise.all([
      apiGet<MatchDetailsData>(apiRoutes.matches.byId(id)),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Player[]>(apiRoutes.players.list).catch(() => []),
    ])
    if (isCancelled()) return
    setMatch(payload)
    setDraft(buildDraft(payload))
    setPlayers(roster)
    if (club?.name?.trim()) setClubName(club.name.trim())
  }, [id])

  const { loading, error } = useAsyncLoader(loadMatch)

  const home = useMemo(() => (match ? getTeam(match, 'home') : undefined), [match])
  const away = useMemo(() => (match ? getTeam(match, 'away') : undefined), [match])
  const homeScore = home?.score ?? 0
  const awayScore = away?.score ?? 0
  const pending = match ? isNotPlayed(match) : false
  const outcomeLabel = pending ? 'Pas encore joué' : homeScore > awayScore ? 'Victoire' : homeScore < awayScore ? 'Défaite' : 'Nul'
  const outcomeClass = pending ? 'pending' : homeScore > awayScore ? 'win' : homeScore < awayScore ? 'loss' : 'draw'
  const homeLabel = clubName
  const awayLabel = match?.opponentName || 'Adversaire'
  const matchDate = useMemo(() => {
    if (!match?.createdAt) return ''
    const date = new Date(match.createdAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [match?.createdAt])
  const playerNameById = useMemo(() => new Map(players.map((p) => [p.id, p.name] as const)), [players])
  const sortedPlayers = useMemo(
    () => players.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  )
  const viewDraft = draft ?? { home: { starters: [], subs: [] }, away: { starters: [], subs: [] }, scorers: [] }
  const heroHomeScorers = useMemo(
    () => viewDraft.scorers
      .filter((s) => s.side === 'home')
      .map((s) => playerNameById.get(s.playerId) || s.playerId),
    [viewDraft.scorers, playerNameById]
  )
  const heroAwayScorers = useMemo(
    () => viewDraft.scorers
      .filter((s) => s.side === 'away')
      .map((s) => playerNameById.get(s.playerId) || s.playerId),
    [viewDraft.scorers, playerNameById]
  )

  function toggleEditing(next: boolean) {
    setIsEditing(next)
    if (next && match) {
      setDraft(buildDraft(match))
      setSelectedHomePlayer('')
      setSelectedAwayPlayer('')
      setSelectedHomeScorer('')
      setSelectedAwayScorer('')
    }
  }

  function addPlayerToCompo(side: 'home' | 'away', role: 'starter' | 'sub', playerId: string) {
    if (!playerId) return
    setDraft((prev) => {
      if (!prev) return prev
      const block = side === 'home' ? prev.home : prev.away
      const all = new Set([...block.starters, ...block.subs])
      if (all.has(playerId)) return prev
      const updatedSide: SideDraft = role === 'starter'
        ? { starters: [...block.starters, playerId], subs: block.subs }
        : { starters: block.starters, subs: [...block.subs, playerId] }
      return side === 'home'
        ? { ...prev, home: updatedSide }
        : { ...prev, away: updatedSide }
    })
  }

  function removePlayerFromCompo(side: 'home' | 'away', role: 'starter' | 'sub', index: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const block = side === 'home' ? prev.home : prev.away
      const updatedSide: SideDraft = role === 'starter'
        ? { starters: block.starters.filter((_, i) => i !== index), subs: block.subs }
        : { starters: block.starters, subs: block.subs.filter((_, i) => i !== index) }
      return side === 'home'
        ? { ...prev, home: updatedSide }
        : { ...prev, away: updatedSide }
    })
  }

  function addScorer(side: 'home' | 'away', playerId: string) {
    if (!playerId) return
    setDraft((prev) => (prev ? { ...prev, scorers: [...prev.scorers, { side, playerId }] } : prev))
  }

  function removeScorer(index: number) {
    setDraft((prev) => (prev ? { ...prev, scorers: prev.scorers.filter((_, i) => i !== index) } : prev))
  }

  async function saveDraft() {
    if (!match || !id || !draft) return
    setSaving(true)
    try {
      const updated = await apiPut<MatchDetailsData>(apiRoutes.matches.byId(id), {
        type: match.type,
        plateauId: match.plateauId ?? undefined,
        sides: {
          home: {
            starters: draft.home.starters,
            subs: draft.home.subs,
          },
          away: {
            starters: draft.away.starters,
            subs: draft.away.subs,
          },
        },
        score: {
          home: homeScore,
          away: awayScore,
        },
        buteurs: draft.scorers.map((s) => ({ side: s.side, playerId: s.playerId })),
        opponentName: match.opponentName ?? '',
      })
      setMatch(updated)
      setDraft(buildDraft(updated))
      setIsEditing(false)
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour du match: ${toErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Chargement…</div>
  if (error) return <div style={{ padding: 20, color: '#b91c1c' }}>Erreur: {toErrorMessage(error)}</div>
  if (!match) return <div style={{ padding: 20 }}>Match introuvable.</div>

  return (
    <div className="match-details-page">
      <header className="match-details-topbar">
        <button type="button" className="match-back-button" onClick={() => navigate(-1)}>
          Retour
        </button>
        {match.plateauId && (
          <Link className="match-plateau-link" to={`/plateau/${match.plateauId}`}>
            Voir le plateau
          </Link>
        )}
      </header>

      <section className="match-hero">
        <div className="match-hero-row">
          <div className="match-team-block is-home">
            <div className="match-team-content">
              <div className="team-name">{homeLabel}</div>
            </div>
          </div>
          <div className="match-scoreboard">
            <div className="score-line">
              <span>{homeScore}</span>
              <span>-</span>
              <span>{awayScore}</span>
            </div>
          </div>
          <div className="match-team-block is-away">
            <div className="match-team-content">
              <div className="team-name">{awayLabel}</div>
            </div>
          </div>
        </div>
        <div className="hero-scorers-row">
          <div className="hero-scorers-col">
            {heroHomeScorers.map((name, idx) => (
              <div className="hero-scorer-line" key={`hero-home-scorer-${idx}-${name}`}>
                <span className="hero-scorer-ball" aria-hidden="true">⚽</span>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <div />
          <div className="hero-scorers-col">
            {heroAwayScorers.map((name, idx) => (
              <div className="hero-scorer-line" key={`hero-away-scorer-${idx}-${name}`}>
                <span className="hero-scorer-ball" aria-hidden="true">⚽</span>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="match-result-row">
          <div className={`result-pill ${outcomeClass}`}>{outcomeLabel}</div>
        </div>
        {matchDate && <p className="match-meta-line">{matchDate}</p>}
      </section>

      <section className="match-editor-actions">
        {!isEditing ? (
          <button type="button" className="edit-action-button" onClick={() => toggleEditing(true)}>
            Modifier compo et buteurs
          </button>
        ) : (
          <div className="edit-action-group">
            <button type="button" className="edit-secondary" onClick={() => toggleEditing(false)} disabled={saving}>
              Annuler
            </button>
            <button type="button" className="edit-primary" onClick={() => void saveDraft()} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )}
      </section>

      <section className="match-content-grid">
        <article className="match-card">
          <h3>Compositions</h3>
          <div className="lineup-grid">
            <div>
              <h4>{homeLabel}</h4>
              {isEditing && (
                <div className="editor-inline-row">
                  <select value={selectedHomePlayer} onChange={(e) => setSelectedHomePlayer(e.target.value)}>
                    <option value="">Joueur...</option>
                    {sortedPlayers.map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                  <select value={selectedHomeRole} onChange={(e) => setSelectedHomeRole(e.target.value as 'starter' | 'sub')}>
                    <option value="starter">Titulaire</option>
                    <option value="sub">Remplaçant</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      addPlayerToCompo('home', selectedHomeRole, selectedHomePlayer)
                      setSelectedHomePlayer('')
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              <div className="lineup-stack">
                <p>Titulaires</p>
                <ul>
                  {viewDraft.home.starters.length > 0 ? (
                    viewDraft.home.starters.map((playerId, index) => (
                      <li key={`home-starter-${playerId}-${index}`}>
                        <span>{playerNameById.get(playerId) || playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removePlayerFromCompo('home', 'starter', index)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))
                  ) : (
                    <li>Aucun joueur</li>
                  )}
                </ul>
              </div>
              <div className="lineup-stack">
                <p>Remplaçants</p>
                <ul>
                  {viewDraft.home.subs.length > 0 ? (
                    viewDraft.home.subs.map((playerId, index) => (
                      <li key={`home-sub-${playerId}-${index}`}>
                        <span>{playerNameById.get(playerId) || playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removePlayerFromCompo('home', 'sub', index)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))
                  ) : (
                    <li>Aucun joueur</li>
                  )}
                </ul>
              </div>
            </div>
            <div>
              <h4>{awayLabel}</h4>
              {isEditing && (
                <div className="editor-inline-row">
                  <select value={selectedAwayPlayer} onChange={(e) => setSelectedAwayPlayer(e.target.value)}>
                    <option value="">Joueur...</option>
                    {sortedPlayers.map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                  <select value={selectedAwayRole} onChange={(e) => setSelectedAwayRole(e.target.value as 'starter' | 'sub')}>
                    <option value="starter">Titulaire</option>
                    <option value="sub">Remplaçant</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      addPlayerToCompo('away', selectedAwayRole, selectedAwayPlayer)
                      setSelectedAwayPlayer('')
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              <div className="lineup-stack">
                <p>Titulaires</p>
                <ul>
                  {viewDraft.away.starters.length > 0 ? (
                    viewDraft.away.starters.map((playerId, index) => (
                      <li key={`away-starter-${playerId}-${index}`}>
                        <span>{playerNameById.get(playerId) || playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removePlayerFromCompo('away', 'starter', index)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))
                  ) : (
                    <li>Aucun joueur</li>
                  )}
                </ul>
              </div>
              <div className="lineup-stack">
                <p>Remplaçants</p>
                <ul>
                  {viewDraft.away.subs.length > 0 ? (
                    viewDraft.away.subs.map((playerId, index) => (
                      <li key={`away-sub-${playerId}-${index}`}>
                        <span>{playerNameById.get(playerId) || playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removePlayerFromCompo('away', 'sub', index)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))
                  ) : (
                    <li>Aucun joueur</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </article>

        <article className="match-card">
          <h3>Buteurs</h3>
          {pending && !isEditing && <p>Le match n’est pas encore joué.</p>}
          <div className="scorers-grid">
            <div>
              <h4>{homeLabel}</h4>
              {isEditing && (
                <div className="editor-inline-row">
                  <select value={selectedHomeScorer} onChange={(e) => setSelectedHomeScorer(e.target.value)}>
                    <option value="">Joueur...</option>
                    {sortedPlayers.map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      addScorer('home', selectedHomeScorer)
                      setSelectedHomeScorer('')
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              {(viewDraft.scorers.filter((s) => s.side === 'home').length > 0) ? (
                <ul>
                  {viewDraft.scorers
                    .map((scorer, idx) => ({ scorer, idx }))
                    .filter(({ scorer }) => scorer.side === 'home')
                    .map(({ scorer, idx }) => (
                      <li key={`${scorer.playerId}-home-${idx}`}>
                        <span>{playerNameById.get(scorer.playerId) || scorer.playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removeScorer(idx)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p>Aucun buteur</p>
              )}
            </div>
            <div>
              <h4>{awayLabel}</h4>
              {isEditing && (
                <div className="editor-inline-row">
                  <select value={selectedAwayScorer} onChange={(e) => setSelectedAwayScorer(e.target.value)}>
                    <option value="">Joueur...</option>
                    {sortedPlayers.map((player) => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      addScorer('away', selectedAwayScorer)
                      setSelectedAwayScorer('')
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              {(viewDraft.scorers.filter((s) => s.side === 'away').length > 0) ? (
                <ul>
                  {viewDraft.scorers
                    .map((scorer, idx) => ({ scorer, idx }))
                    .filter(({ scorer }) => scorer.side === 'away')
                    .map(({ scorer, idx }) => (
                      <li key={`${scorer.playerId}-away-${idx}`}>
                        <span>{playerNameById.get(scorer.playerId) || scorer.playerId}</span>
                        {isEditing && (
                          <button type="button" onClick={() => removeScorer(idx)}>
                            Retirer
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <p>Aucun buteur</p>
              )}
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
