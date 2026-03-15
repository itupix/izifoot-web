import React, { useCallback, useEffect, useMemo, useState } from 'react'
import FloatingPlusButton from '../components/FloatingPlusButton'
import SearchInput from '../components/SearchInput'
import { apiDelete, apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import { toErrorMessage } from '../errors'
import { buildPointsMap, buildTacticalFormations, buildTacticalTokens, type TacticalPoint } from '../features/tactical'
import { playersOnFieldFromGameFormat } from '../features/teamFormat'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { Player } from '../types/api'
import './PlayersPage.css'

const POSITIONS = ['GARDIEN', 'DEFENSEUR', 'MILIEU', 'ATTAQUANT'] as const

type SortKey = 'name' | 'position'
type TeamTab = 'EFFECTIF' | 'TACTIQUE'
type TacticalRole = 'GARDIEN' | 'DEFENSEUR' | 'MILIEU' | 'ATTAQUANT'
type SavedTactic = {
  name: string
  formation: string
  points: Record<string, TacticalPoint>
  savedAt: string
  playersOnField?: number
}

const TACTICAL_SNAP_POINTS: TacticalPoint[] = [
  ...[{ y: 90, xs: [50] }],
  ...[{ y: 84, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 74, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 64, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 54, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 44, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 34, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 24, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
  ...[{ y: 14, xs: [8, 20, 32, 44, 50, 56, 68, 80, 92] }],
]
  .flatMap(({ y, xs }) => xs.map((x) => ({ x, y })))
const TACTICAL_TOKEN_SIZE = 56

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function distance(a: TacticalPoint, b: TacticalPoint) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pointKey(point: TacticalPoint) {
  return `${point.x.toFixed(1)}-${point.y.toFixed(1)}`
}

function nearestAllowedPoint(point: TacticalPoint, blockedKeys: Set<string>) {
  const candidates = TACTICAL_SNAP_POINTS.filter((snapPoint) => !blockedKeys.has(pointKey(snapPoint)))
  const pool = candidates.length ? candidates : TACTICAL_SNAP_POINTS
  let nearest: TacticalPoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const snapPoint of pool) {
    const currentDistance = distance(point, snapPoint)
    if (currentDistance < nearestDistance) {
      nearestDistance = currentDistance
      nearest = snapPoint
    }
  }
  return nearest || pool[0] || point
}

function inferRole(point: TacticalPoint): TacticalRole {
  if (point.y >= 88) return 'GARDIEN'
  if (point.y >= 62) return 'DEFENSEUR'
  if (point.y >= 42) return 'MILIEU'
  return 'ATTAQUANT'
}

function normalizePointsMap(tokens: string[], points: Record<string, TacticalPoint>) {
  const blocked = new Set<string>()
  const normalized: Record<string, TacticalPoint> = {}
  for (const tokenId of tokens) {
    const raw = points[tokenId] || { x: 50, y: 50 }
    const nearest = nearestAllowedPoint(raw, blocked)
    normalized[tokenId] = nearest
    blocked.add(pointKey(nearest))
  }
  return normalized
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

function getAvatarUrl(player: Player) {
  const withAvatar = player as Player & {
    avatarUrl?: string | null
    avatar?: string | null
    photoUrl?: string | null
    imageUrl?: string | null
  }
  return withAvatar.avatarUrl || withAvatar.avatar || withAvatar.photoUrl || withAvatar.imageUrl || null
}

export default function PlayersPage() {
  const { me } = useAuth()
  const { selectedTeamId, selectedTeamFormat, requiresSelection } = useTeamScope()

  const playersOnField = useMemo(() => playersOnFieldFromGameFormat(selectedTeamFormat, 5), [selectedTeamFormat])
  const tacticalTokens = useMemo(() => buildTacticalTokens(playersOnField), [playersOnField])
  const tacticalFormations = useMemo(() => buildTacticalFormations(playersOnField), [playersOnField])
  const defaultFormation = tacticalFormations[0]

  const [players, setPlayers] = useState<Player[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TeamTab>('EFFECTIF')
  const [tacticalFormation, setTacticalFormation] = useState<string>(defaultFormation?.key || '')
  const [tacticalPresetValue, setTacticalPresetValue] = useState(
    defaultFormation ? `formation:${defaultFormation.key}` : '',
  )
  const [tacticName, setTacticName] = useState('Mon systeme')
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([])
  const [tacticalPoints, setTacticalPoints] = useState<Record<string, TacticalPoint>>(() => normalizePointsMap(
    tacticalTokens,
    buildPointsMap(tacticalTokens, defaultFormation?.points || []),
  ))

  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<typeof POSITIONS[number]>('MILIEU')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [q, setQ] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const writable = me ? canWrite(me.role) : false
  const teamScopedWritable = writable && (!requiresSelection || Boolean(selectedTeamId))

  const loadPlayers = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const list = await apiGet<Player[]>(apiRoutes.players.list)
    if (!isCancelled()) setPlayers(list)
  }, [])

  const { loading, error } = useAsyncLoader(loadPlayers)

  const filtered = useMemo(() => {
    let items = requiresSelection && !selectedTeamId
      ? []
      : selectedTeamId
        ? players.filter((p) => !p.teamId || p.teamId === selectedTeamId)
        : players
    if (q.trim()) {
      const needle = q.toLowerCase()
      items = items.filter((p) => p.name.toLowerCase().includes(needle))
    }
    if (posFilter) items = items.filter((p) => p.primary_position === posFilter)
    return items
  }, [players, q, posFilter, requiresSelection, selectedTeamId])

  const sortedPlayers = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'position') {
        const byPosition = a.primary_position.localeCompare(b.primary_position, 'fr', { sensitivity: 'base' })
        if (byPosition !== 0) return byPosition
      }
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  }, [filtered, sortDir, sortKey])

  const hasActiveFilters = Boolean(q.trim() || posFilter)
  const playersCountLabel = sortedPlayers.length === 1 ? '1 joueur' : `${sortedPlayers.length} joueurs`
  const canSaveTactic = tacticName.trim().length > 0

  useEffect(() => {
    if (!defaultFormation) return
    const storageKey = `izifoot.tactical.scheme.${selectedTeamId || 'all'}`
    const libraryKey = `izifoot.tactical.library.${selectedTeamId || 'all'}`
    const rawLibrary = window.localStorage.getItem(libraryKey)
    let parsedLibrary: SavedTactic[] = []
    if (rawLibrary) {
      try {
        const rawParsed = JSON.parse(rawLibrary) as SavedTactic[]
        if (Array.isArray(rawParsed)) {
          parsedLibrary = rawParsed.filter((item) => !item.playersOnField || item.playersOnField === playersOnField)
          setSavedTactics(parsedLibrary)
        }
      } catch {
        setSavedTactics([])
        parsedLibrary = []
      }
    } else {
      setSavedTactics([])
    }

    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      setTacticalFormation(defaultFormation.key)
      setTacticalPresetValue(`formation:${defaultFormation.key}`)
      setTacticalPoints(normalizePointsMap(tacticalTokens, buildPointsMap(tacticalTokens, defaultFormation.points)))
      return
    }
    try {
      const parsed = JSON.parse(raw) as {
        name?: string
        formation?: string
        points?: Record<string, TacticalPoint>
      }
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        setTacticName(parsed.name.trim())
      } else {
        setTacticName('Mon systeme')
      }
      if (parsed.formation && tacticalFormations.some((formation) => formation.key === parsed.formation)) {
        setTacticalFormation(parsed.formation)
        setTacticalPresetValue(`formation:${parsed.formation}`)
      } else {
        setTacticalFormation(defaultFormation.key)
        setTacticalPresetValue(`formation:${defaultFormation.key}`)
      }
      if (parsed.points && typeof parsed.points === 'object') {
        const nextPoints: Record<string, TacticalPoint> = {}
        const currentFormation = tacticalFormations.find((formation) => formation.key === parsed.formation) || defaultFormation
        for (const [index, tokenId] of tacticalTokens.entries()) {
          const point = parsed.points[tokenId]
          nextPoints[tokenId] = point
            ? { x: clamp(point.x, 6, 94), y: clamp(point.y, 8, 92) }
            : currentFormation?.points[index] || { x: 50, y: 50 }
        }
        setTacticalPoints(normalizePointsMap(tacticalTokens, nextPoints))
      } else {
        setTacticalPoints(normalizePointsMap(tacticalTokens, buildPointsMap(tacticalTokens, defaultFormation.points)))
      }
      if (parsed.name && parsedLibrary.some((item) => item.name === parsed.name)) {
        setTacticalPresetValue(`tactic:${parsed.name}`)
      }
    } catch {
      setTacticalFormation(defaultFormation.key)
      setTacticalPresetValue(`formation:${defaultFormation.key}`)
      setTacticalPoints(normalizePointsMap(tacticalTokens, buildPointsMap(tacticalTokens, defaultFormation.points)))
    }
  }, [defaultFormation, playersOnField, selectedTeamId, tacticalFormations, tacticalTokens])

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!teamScopedWritable) return
    try {
      const body: {
        name: string
        primary_position: string
        email?: string
        phone?: string
        teamId?: string
      } = {
        name: name.trim(),
        primary_position: primary,
        teamId: selectedTeamId || undefined,
      }
      if (email.trim()) body.email = email.trim()
      if (phone.trim()) body.phone = phone.trim()
      const created = await apiPost<Player>(apiRoutes.players.list, body)
      setPlayers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setPrimary('MILIEU')
      setEmail('')
      setPhone('')
      setModalOpen(false)
    } catch (err: unknown) {
      uiAlert(`Erreur creation joueur: ${toErrorMessage(err)}`)
    }
  }

  async function removePlayer(id: string) {
    if (!teamScopedWritable) return
    if (!uiConfirm('Supprimer ce joueur ?')) return
    try {
      await apiDelete(apiRoutes.players.byId(id))
      setPlayers((prev) => prev.filter((player) => player.id !== id))
    } catch (err: unknown) {
      uiAlert(`Erreur suppression: ${toErrorMessage(err)}`)
    }
  }

  function resetFilters() {
    setQ('')
    setPosFilter('')
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDir('asc')
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '↕'
    return sortDir === 'asc' ? '↑' : '↓'
  }

  function applyFormation(formationKey: string) {
    setTacticalFormation(formationKey)
    setTacticalPresetValue(`formation:${formationKey}`)
    const formation = tacticalFormations.find((item) => item.key === formationKey)
    if (!formation) return
    setTacticalPoints(() => normalizePointsMap(
      tacticalTokens,
      buildPointsMap(tacticalTokens, formation.points),
    ))
  }

  function saveCurrentTacticalScheme() {
    const normalizedName = tacticName.trim()
    if (!normalizedName) return
    const storageKey = `izifoot.tactical.scheme.${selectedTeamId || 'all'}`
    const libraryKey = `izifoot.tactical.library.${selectedTeamId || 'all'}`
    const payload = {
      name: normalizedName,
      formation: tacticalFormation,
      points: tacticalPoints,
      savedAt: new Date().toISOString(),
      playersOnField,
    }
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
    const nextLibrary = [
      ...savedTactics.filter((item) => item.name.toLowerCase() !== normalizedName.toLowerCase()),
      payload,
    ]
      .sort((a, b) => +new Date(b.savedAt) - +new Date(a.savedAt))
      .slice(0, 30)
    setSavedTactics(nextLibrary)
    setTacticalPresetValue(`tactic:${normalizedName}`)
    window.localStorage.setItem(libraryKey, JSON.stringify(nextLibrary))
  }

  function loadSavedTacticByName(name: string) {
    const saved = savedTactics.find((item) => item.name === name)
    if (!saved) return
    setTacticName(saved.name)
    setTacticalFormation(saved.formation)
    setTacticalPoints(normalizePointsMap(tacticalTokens, saved.points))
    setTacticalPresetValue(`tactic:${saved.name}`)
  }

  function handleTacticalPresetChange(value: string) {
    if (value.startsWith('formation:')) {
      applyFormation(value.replace('formation:', ''))
      return
    }
    if (value.startsWith('tactic:')) {
      loadSavedTacticByName(value.replace('tactic:', ''))
    }
  }

  return (
    <div className="page-shell">
      <header className="players-head">
        <h1 className="players-title">Mon équipe</h1>
      </header>

      <div className="players-tabs" role="tablist" aria-label="Sections de mon equipe">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'EFFECTIF'}
          className={`players-tab-btn ${activeTab === 'EFFECTIF' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('EFFECTIF')}
        >
          Effectif
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'TACTIQUE'}
          className={`players-tab-btn ${activeTab === 'TACTIQUE' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('TACTIQUE')}
        >
          Tactique
        </button>
      </div>

      {activeTab === 'EFFECTIF' && writable && requiresSelection && !selectedTeamId && (
        <div className="inline-alert">Selectionnez une equipe active pour modifier les joueurs.</div>
      )}

      {activeTab === 'EFFECTIF' ? (
        <>
          <div className="players-search-row">
            <SearchInput
              placeholder="Recherche par nom"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>

          <div className="players-position-filters" role="tablist" aria-label="Filtrer par poste">
            <button
              type="button"
              role="tab"
              aria-selected={posFilter === ''}
              className={`players-filter-btn ${posFilter === '' ? 'is-active' : ''}`}
              onClick={() => setPosFilter('')}
            >
              Tous
            </button>
            {POSITIONS.map((position) => (
              <button
                key={position}
                type="button"
                role="tab"
                aria-selected={posFilter === position}
                className={`players-filter-btn ${posFilter === position ? 'is-active' : ''}`}
                onClick={() => setPosFilter(position)}
              >
                {position}
              </button>
            ))}
          </div>

          <section className="players-panel players-panel--effectif">
            <div className="players-meta-row">
              <p className="panel-note">{playersCountLabel}</p>
              <div className="players-meta-actions">
                {hasActiveFilters && (
                  <button type="button" className="players-secondary-btn" onClick={resetFilters}>
                    Reinitialiser les filtres
                  </button>
                )}
                {loading && <div className="players-loading">Chargement...</div>}
              </div>
            </div>

            {error && <div className="inline-alert error">{error}</div>}

            {sortedPlayers.length > 0 ? (
              <table className="players-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="players-sort-btn" onClick={() => toggleSort('name')}>
                        Nom <span>{sortIndicator('name')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" className="players-sort-btn" onClick={() => toggleSort('position')}>
                        Poste principal <span>{sortIndicator('position')}</span>
                      </button>
                    </th>
                    <th className="players-row-actions-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <tr key={player.id}>
                      <td>
                        <div className="players-name-cell">
                          <PlayerAvatar player={player} />
                          <span>{player.name}</span>
                        </div>
                      </td>
                      <td>{player.primary_position}</td>
                      <td className="players-row-actions">
                        <button
                          type="button"
                          className="players-icon-btn danger"
                          disabled={!teamScopedWritable}
                          onClick={() => { void removePlayer(player.id) }}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="players-empty-state">
                <p className="players-empty-title">
                  {hasActiveFilters ? 'Aucun joueur ne correspond aux filtres.' : 'Aucun joueur pour le moment.'}
                </p>
                <div className="players-empty-actions">
                  {hasActiveFilters && (
                    <button type="button" className="players-secondary-btn" onClick={resetFilters}>
                      Effacer les filtres
                    </button>
                  )}
                  {teamScopedWritable && (
                    <button type="button" className="players-primary-btn" onClick={() => setModalOpen(true)}>
                      Ajouter un joueur
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel players-panel">
          <div className="tactical-controls">
            <label className="players-field-label" htmlFor="tactical-name-input">Nom de la tactique</label>
            <input
              id="tactical-name-input"
              className="players-input tactical-name-input"
              value={tacticName}
              onChange={(event) => setTacticName(event.target.value)}
              placeholder="Ex: Pressing haut 2-1-1"
              maxLength={50}
            />
            <label className="players-field-label" htmlFor="tactical-formation-select">Formation</label>
            <select
              id="tactical-formation-select"
              className="players-input tactical-formation-select"
              value={tacticalPresetValue}
              onChange={(event) => handleTacticalPresetChange(event.target.value)}
            >
              <optgroup label="Formations">
                {tacticalFormations.map((formation) => (
                  <option key={formation.key} value={`formation:${formation.key}`}>
                    {formation.label}
                  </option>
                ))}
              </optgroup>
              {savedTactics.length > 0 && (
                <optgroup label="Tactiques sauvegardees">
                  {savedTactics.map((saved) => (
                    <option key={saved.name} value={`tactic:${saved.name}`}>
                      {saved.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" className="players-primary-btn" onClick={saveCurrentTacticalScheme} disabled={!canSaveTactic}>
              Sauvegarder
            </button>
          </div>
          <TacticalBoard
            tacticalTokens={tacticalTokens}
            tacticalPoints={tacticalPoints}
            onMoveToken={(tokenId, point) => {
              setTacticalPoints((prev) => ({ ...prev, [tokenId]: point }))
            }}
          />
        </section>
      )}

      {activeTab === 'EFFECTIF' && modalOpen && (
        <>
          <div className="players-modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="players-modal players-modal--create" role="dialog" aria-modal="true">
            <div className="players-modal-head">
              <strong>Ajouter un joueur</strong>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="players-modal-close"
                aria-label="Fermer"
              >
                x
              </button>
            </div>

            <form onSubmit={createPlayer} className="players-create-form">
              <input
                className="players-input"
                placeholder="Nom"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <label className="players-field-label">Poste principal</label>
              <select
                className="players-input"
                value={primary}
                onChange={(e) => setPrimary(e.target.value as typeof POSITIONS[number])}
              >
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
              <input
                className="players-input"
                placeholder="Email (optionnel)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="players-input"
                placeholder="Telephone (optionnel)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button type="submit" className="players-primary-btn">Ajouter</button>
            </form>
          </div>
        </>
      )}

      {activeTab === 'EFFECTIF' && teamScopedWritable && (
        <FloatingPlusButton ariaLabel="Ajouter un joueur" onClick={() => setModalOpen(true)} />
      )}
    </div>
  )
}

function PlayerAvatar({ player }: { player: Player }) {
  const avatarUrl = getAvatarUrl(player)
  const initials = getInitials(player.name)
  return (
    <div className="players-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt={player.name} />
      ) : (
        <span style={{ background: colorFromName(player.name) }}>{initials}</span>
      )}
    </div>
  )
}

function TacticalBoard({
  tacticalTokens,
  tacticalPoints,
  onMoveToken,
}: {
  tacticalTokens: string[]
  tacticalPoints: Record<string, TacticalPoint>
  onMoveToken: (tokenId: string, point: TacticalPoint) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  return (
    <div className="tactical-layout">
      <div className={`tactical-pitch ${draggingId ? 'is-dragging' : ''}`}>
        <div className="tactical-center-line" />
        <div className="tactical-center-circle" />
        <div className="tactical-box tactical-box-top" />
        <div className="tactical-box tactical-box-bottom" />
        <div className="tactical-goal tactical-goal-top" />
        <div className="tactical-goal tactical-goal-bottom" />
        {TACTICAL_SNAP_POINTS.map((point, index) => (
          <span
            key={`${point.x}-${point.y}-${index}`}
            className="tactical-snap-point"
            style={{ left: `calc(${point.x}% - 6px)`, top: `calc(${point.y}% - 6px)` }}
            aria-hidden="true"
          />
        ))}

        {tacticalTokens.map((tokenId) => {
          const point = tacticalPoints[tokenId] || { x: 50, y: 50 }
          const role = inferRole(point)
          const dragging = draggingId === tokenId
          return (
            <button
              key={tokenId}
              type="button"
              className={`tactical-token ${dragging ? 'is-dragging' : ''}`}
              style={{
                left: `calc(${point.x}% - ${TACTICAL_TOKEN_SIZE / 2}px)`,
                top: `calc(${point.y}% - ${TACTICAL_TOKEN_SIZE / 2}px)`,
              }}
              onPointerDown={(event) => {
                const target = event.currentTarget
                const parent = target.parentElement
                if (!parent) return
                setDraggingId(tokenId)
                target.setPointerCapture(event.pointerId)

                const parentRect = parent.getBoundingClientRect()

                const move = (clientX: number, clientY: number) => {
                  const xPx = clientX - parentRect.left
                  const yPx = clientY - parentRect.top
                  const xPercent = clamp((xPx / parentRect.width) * 100, 6, 94)
                  const yPercent = clamp((yPx / parentRect.height) * 100, 8, 92)
                  const blocked = new Set<string>()
                  for (const currentTokenId of tacticalTokens) {
                    if (currentTokenId === tokenId) continue
                    const occupied = tacticalPoints[currentTokenId]
                    if (occupied) blocked.add(pointKey(occupied))
                  }
                  onMoveToken(tokenId, nearestAllowedPoint({ x: xPercent, y: yPercent }, blocked))
                }

                move(event.clientX, event.clientY)

                const handlePointerMove = (moveEvent: PointerEvent) => {
                  move(moveEvent.clientX, moveEvent.clientY)
                }
                const handlePointerUp = () => {
                  setDraggingId((current) => (current === tokenId ? null : current))
                  window.removeEventListener('pointermove', handlePointerMove)
                  window.removeEventListener('pointerup', handlePointerUp)
                }

                window.addEventListener('pointermove', handlePointerMove)
                window.addEventListener('pointerup', handlePointerUp)
              }}
            >
              <span className="tactical-token-role">{role[0]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
