import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { isMatchNotPlayed } from '../matchStatus'
import type { ClubMe, MatchLite, MatchTeamLite, Plateau, Player } from '../types/api'
import { uiAlert } from '../ui'
import './MatchDetailsPage.css'
import './TrainingDetailsPage.css'

type MatchDetailsData = MatchLite & {
  playersById?: Record<string, Player>
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function colorFromName(name: string) {
  const palette = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#0e7490', '#b91c1c']
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function getTeam(match: MatchLite, side: 'home' | 'away'): MatchTeamLite | undefined {
  return match.teams.find((team) => team.side === side)
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
  const [plateauDateISO, setPlateauDateISO] = useState<string>('')
  const [clubName, setClubName] = useState<string>('Club')
  const [players, setPlayers] = useState<Player[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<MatchDraft | null>(null)
  const [editHomeScore, setEditHomeScore] = useState(0)
  const [editAwayScore, setEditAwayScore] = useState(0)
  const [editIsPlayed, setEditIsPlayed] = useState(false)
  const [selectedHomePlayer, setSelectedHomePlayer] = useState('')
  const [selectedHomeRole, setSelectedHomeRole] = useState<'starter' | 'sub'>('starter')
  const [selectedHomeScorer, setSelectedHomeScorer] = useState('')

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
    if (payload.plateauId) {
      const plateau = await apiGet<Plateau>(apiRoutes.plateaus.byId(payload.plateauId)).catch(() => null)
      if (!isCancelled()) setPlateauDateISO(plateau?.date || '')
    } else {
      setPlateauDateISO('')
    }
  }, [id])

  const { loading, error } = useAsyncLoader(loadMatch)

  const home = useMemo(() => (match ? getTeam(match, 'home') : undefined), [match])
  const away = useMemo(() => (match ? getTeam(match, 'away') : undefined), [match])
  const homeScore = home?.score ?? 0
  const awayScore = away?.score ?? 0
  const pending = match ? (
    match.type === 'PLATEAU'
      ? homeScore === 0 && awayScore === 0 && (match.scorers?.length ?? 0) === 0
      : isMatchNotPlayed(match)
  ) : false
  const outcomeLabel = pending ? 'Pas encore joué' : homeScore > awayScore ? 'Victoire' : homeScore < awayScore ? 'Défaite' : 'Nul'
  const outcomeClass = pending ? 'pending' : homeScore > awayScore ? 'win' : homeScore < awayScore ? 'loss' : 'draw'
  const homeLabel = clubName
  const awayLabel = match?.opponentName || 'Adversaire'
  const matchDate = useMemo(() => {
    const source = plateauDateISO || match?.createdAt
    if (!source) return ''
    const date = new Date(source)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [match?.createdAt, plateauDateISO])
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
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players])

  function openEditModal() {
    setMenuOpen(false)
    if (match) setDraft(buildDraft(match))
    setEditHomeScore(homeScore)
    setEditAwayScore(awayScore)
    setEditIsPlayed(!pending)
    setSelectedHomePlayer('')
    setSelectedHomeScorer('')
    setIsEditModalOpen(true)
  }

  function closeEditModal() {
    if (saving) return
    setIsEditModalOpen(false)
  }

  function openDeleteModal() {
    setMenuOpen(false)
    setIsDeleteModalOpen(true)
  }

  function closeDeleteModal() {
    if (deleting) return
    setIsDeleteModalOpen(false)
  }

  function addPlayerToCompo(role: 'starter' | 'sub', playerId: string) {
    if (!playerId) return
    setDraft((prev) => {
      if (!prev) return prev
      const block = prev.home
      const all = new Set([...block.starters, ...block.subs])
      if (all.has(playerId)) return prev
      const updatedSide: SideDraft = role === 'starter'
        ? { starters: [...block.starters, playerId], subs: block.subs }
        : { starters: block.starters, subs: [...block.subs, playerId] }
      return { ...prev, home: updatedSide }
    })
  }

  function removePlayerFromCompo(role: 'starter' | 'sub', index: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const block = prev.home
      const updatedSide: SideDraft = role === 'starter'
        ? { starters: block.starters.filter((_, i) => i !== index), subs: block.subs }
        : { starters: block.starters, subs: block.subs.filter((_, i) => i !== index) }
      return { ...prev, home: updatedSide }
    })
  }

  function addScorer(playerId: string) {
    if (!playerId || !editIsPlayed) return
    setDraft((prev) => (prev ? { ...prev, scorers: [...prev.scorers.filter((s) => s.side === 'home'), { side: 'home', playerId }] } : prev))
  }

  function removeScorer(index: number) {
    setDraft((prev) => (prev ? { ...prev, scorers: prev.scorers.filter((_, i) => i !== index) } : prev))
  }

  function toggleEditIsPlayed(checked: boolean) {
    setEditIsPlayed(checked)
    if (!checked) {
      setEditHomeScore(0)
      setEditAwayScore(0)
      setDraft((prev) => (prev ? { ...prev, scorers: prev.scorers.filter((s) => s.side !== 'home') } : prev))
      setSelectedHomeScorer('')
    }
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
          home: editIsPlayed ? Math.max(0, editHomeScore) : 0,
          away: editIsPlayed ? Math.max(0, editAwayScore) : 0,
        },
        buteurs: editIsPlayed
          ? draft.scorers
          .filter((s) => s.side === 'home')
          .map((s) => ({ side: s.side, playerId: s.playerId }))
          : [],
        opponentName: match.opponentName ?? '',
      })
      setMatch(updated)
      setDraft(buildDraft(updated))
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour du match: ${toErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteMatch() {
    if (!id) return
    setDeleting(true)
    try {
      await apiDelete(apiRoutes.matches.byId(id))
      navigate(-1)
    } catch (err: unknown) {
      uiAlert(`Erreur suppression du match: ${toErrorMessage(err)}`)
    } finally {
      setDeleting(false)
      setIsDeleteModalOpen(false)
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Chargement…</div>
  if (error) return <div style={{ padding: 20, color: '#b91c1c' }}>Erreur: {toErrorMessage(error)}</div>
  if (!match) return <div style={{ padding: 20 }}>Match introuvable.</div>

  return (
    <div className="match-details-page">
      <header className="match-details-topbar">
        <button type="button" className="back-link-button" onClick={() => navigate(-1)}>
          <ChevronLeftIcon size={18} />
          <span>Retour</span>
        </button>
        <div className="topbar-menu-wrap">
          <RoundIconButton ariaLabel="Ouvrir les actions du match" className="menu-dots-button" onClick={() => setMenuOpen((prev) => !prev)}>
            <DotsHorizontalIcon size={18} />
          </RoundIconButton>
          {menuOpen && (
            <>
              <button type="button" className="menu-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />
              <div className="floating-menu">
                <button type="button" onClick={openEditModal}>Modifier</button>
                <button type="button" className="danger" onClick={openDeleteModal}>Supprimer</button>
              </div>
            </>
          )}
        </div>
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
              {pending ? (
                <span>vs</span>
              ) : (
                <>
                  <span>{homeScore}</span>
                  <span>-</span>
                  <span>{awayScore}</span>
                </>
              )}
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
          <div className="hero-scorers-col" />
        </div>
        <div className="match-result-row">
          <div className={`result-pill ${outcomeClass}`}>{outcomeLabel}</div>
        </div>
        {matchDate && <p className="match-meta-line">{matchDate}</p>}
      </section>

      <section className="match-content-grid">
        <article className="match-card">
          <h3>Composition</h3>
          <div className="lineup-stack">
            <div className="compo-line-list">
              {viewDraft.home.starters.length > 0 ? (
                viewDraft.home.starters.map((playerId, index) => {
                  const player = playerById.get(playerId)
                  const name = player?.name || playerId
                  const maybeAvatar =
                    (player as Player & { avatarUrl?: string | null; avatar?: string | null; photoUrl?: string | null; imageUrl?: string | null } | undefined)?.avatarUrl
                    || (player as Player & { avatar?: string | null } | undefined)?.avatar
                    || (player as Player & { photoUrl?: string | null } | undefined)?.photoUrl
                    || (player as Player & { imageUrl?: string | null } | undefined)?.imageUrl
                  return (
                    <div key={`home-starter-${playerId}-${index}`} className="compo-line-item">
                      <div className="compo-avatar-chip" title={name}>
                        {maybeAvatar ? (
                          <img src={maybeAvatar} alt={name} />
                        ) : (
                          <span style={{ background: colorFromName(name) }}>{getInitials(name)}</span>
                        )}
                      </div>
                      <strong>{name}</strong>
                    </div>
                  )
                })
              ) : (
                <p className="muted-inline">Aucun joueur</p>
              )}
            </div>
          </div>
          {viewDraft.home.subs.length > 0 && (
            <div className="lineup-stack">
              <p>Remplaçants</p>
              <div className="compo-line-list">
                {viewDraft.home.subs.map((playerId, index) => {
                  const player = playerById.get(playerId)
                  const name = player?.name || playerId
                  const maybeAvatar =
                    (player as Player & { avatarUrl?: string | null; avatar?: string | null; photoUrl?: string | null; imageUrl?: string | null } | undefined)?.avatarUrl
                    || (player as Player & { avatar?: string | null } | undefined)?.avatar
                    || (player as Player & { photoUrl?: string | null } | undefined)?.photoUrl
                    || (player as Player & { imageUrl?: string | null } | undefined)?.imageUrl
                  return (
                    <div key={`home-sub-${playerId}-${index}`} className="compo-line-item">
                      <div className="compo-avatar-chip" title={name}>
                        {maybeAvatar ? (
                          <img src={maybeAvatar} alt={name} />
                        ) : (
                          <span style={{ background: colorFromName(name) }}>{getInitials(name)}</span>
                        )}
                      </div>
                      <strong>{name}</strong>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </article>

      </section>

      {isEditModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeEditModal} />
          <div className="match-edit-modal" role="dialog" aria-modal="true" aria-label="Modifier composition et buteurs">
            <div className="drill-modal-head">
              <h3>Modifier le match</h3>
              <button type="button" onClick={closeEditModal} disabled={saving}>✕</button>
            </div>

            <div className="lineup-stack">
              <label className="match-not-played-toggle">
                <input
                  type="checkbox"
                  checked={editIsPlayed}
                  onChange={(e) => toggleEditIsPlayed(e.target.checked)}
                />
                <span>Match joué</span>
              </label>
            </div>

            <div className="lineup-stack">
              <p>Score</p>
              <div className="modal-score-grid">
                <div className="modal-score-item">
                  <span>Nous</span>
                  <div className="modal-score-controls">
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditHomeScore((v) => Math.max(0, v - 1))}>−</button>
                    <strong>{editHomeScore}</strong>
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditHomeScore((v) => v + 1)}>+</button>
                  </div>
                </div>
                <div className="modal-score-item">
                  <span>Adversaire</span>
                  <div className="modal-score-controls">
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditAwayScore((v) => Math.max(0, v - 1))}>−</button>
                    <strong>{editAwayScore}</strong>
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditAwayScore((v) => v + 1)}>+</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lineup-stack">
              <p>Composition</p>
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
                    addPlayerToCompo(selectedHomeRole, selectedHomePlayer)
                    setSelectedHomePlayer('')
                  }}
                >
                  Ajouter
                </button>
              </div>

              <div className="lineup-stack">
                <p>Titulaires</p>
                <ul>
                  {viewDraft.home.starters.map((playerId, index) => (
                    <li key={`modal-home-starter-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                      <button type="button" onClick={() => removePlayerFromCompo('starter', index)}>Retirer</button>
                    </li>
                  ))}
                  {viewDraft.home.starters.length === 0 && <li>Aucun joueur</li>}
                </ul>
              </div>

              <div className="lineup-stack">
                <p>Remplaçants</p>
                <ul>
                  {viewDraft.home.subs.map((playerId, index) => (
                    <li key={`modal-home-sub-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                      <button type="button" onClick={() => removePlayerFromCompo('sub', index)}>Retirer</button>
                    </li>
                  ))}
                  {viewDraft.home.subs.length === 0 && <li>Aucun joueur</li>}
                </ul>
              </div>
            </div>

            <div className="lineup-stack">
              <p>Buteurs</p>
              <div className="editor-inline-row is-short">
                <select value={selectedHomeScorer} onChange={(e) => setSelectedHomeScorer(e.target.value)} disabled={!editIsPlayed}>
                  <option value="">Joueur...</option>
                  {sortedPlayers.map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!editIsPlayed}
                  onClick={() => {
                    addScorer(selectedHomeScorer)
                    setSelectedHomeScorer('')
                  }}
                >
                  Ajouter
                </button>
              </div>
              {!editIsPlayed && <p className="muted-inline">Active le switch pour saisir le score et les buteurs.</p>}
              <ul>
                {viewDraft.scorers
                  .map((scorer, idx) => ({ scorer, idx }))
                  .filter(({ scorer }) => scorer.side === 'home')
                  .map(({ scorer, idx }) => (
                    <li key={`modal-scorer-${scorer.playerId}-${idx}`}>
                      <span>{playerNameById.get(scorer.playerId) || scorer.playerId}</span>
                      <button type="button" onClick={() => removeScorer(idx)}>Retirer</button>
                    </li>
                  ))}
                {viewDraft.scorers.filter((s) => s.side === 'home').length === 0 && <li>Aucun buteur</li>}
              </ul>
            </div>

            <div className="edit-action-group">
              <button type="button" className="edit-secondary" onClick={closeEditModal} disabled={saving}>Annuler</button>
              <button type="button" className="edit-primary" onClick={() => void saveDraft()} disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </>
      )}

      {isDeleteModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeDeleteModal} />
          <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Supprimer le match">
            <div className="drill-modal-head">
              <h3>Supprimer le match ?</h3>
              <button type="button" onClick={closeDeleteModal} disabled={deleting}>✕</button>
            </div>
            <p className="muted-line">Cette action est définitive.</p>
            <div className="edit-action-group">
              <button type="button" className="edit-secondary" onClick={closeDeleteModal} disabled={deleting}>Annuler</button>
              <button type="button" className="edit-primary" onClick={() => void deleteMatch()} disabled={deleting}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
