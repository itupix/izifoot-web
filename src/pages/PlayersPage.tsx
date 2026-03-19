import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingPlusButton from '../components/FloatingPlusButton'
import SearchInput from '../components/SearchInput'
import { apiDelete, apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import { toErrorMessage } from '../errors'
import { readDefaultTactic, saveDefaultTactic } from '../features/defaultTactic'
import { buildPointsMap, buildTacticalFormations, buildTacticalTokens, type TacticalPoint } from '../features/tactical'
import { playersOnFieldFromGameFormat } from '../features/teamFormat'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { Player } from '../types/api'
import './PlayersPage.css'

const POSITIONS = ['GARDIEN', 'DEFENSEUR', 'MILIEU', 'ATTAQUANT'] as const
const POSITION_UNDEFINED = 'NON DEFINI'
const POSITION_FILTERS = [POSITION_UNDEFINED, ...POSITIONS] as const

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

function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function getPlayerNames(player: Player): { firstName: string; lastName: string } {
  const firstName =
    (typeof player.firstName === 'string' ? player.firstName : '') ||
    (typeof player.first_name === 'string' ? player.first_name : '') ||
    (typeof player.prenom === 'string' ? player.prenom : '')
  const lastName =
    (typeof player.lastName === 'string' ? player.lastName : '') ||
    (typeof player.last_name === 'string' ? player.last_name : '') ||
    (typeof player.nom === 'string' ? player.nom : '')

  if (firstName.trim() || lastName.trim()) {
    return { firstName: firstName.trim(), lastName: lastName.trim() }
  }

  const fallback = splitFullName(player.name || '')
  return {
    firstName: fallback.firstName.trim(),
    lastName: fallback.lastName.trim(),
  }
}

function getPlayerDisplayName(player: Player): string {
  const { firstName, lastName } = getPlayerNames(player)
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || player.name || '—'
}

function formatPositionLabel(position: string): string {
  const normalized = position.trim().toUpperCase()
  if (normalized === 'GARDIEN') return 'Gardien'
  if (normalized === 'DEFENSEUR') return 'Défenseur'
  if (normalized === 'MILIEU') return 'Milieu'
  if (normalized === 'ATTAQUANT') return 'Attaquant'
  if (normalized === POSITION_UNDEFINED) return 'Non défini'
  return position || 'Non défini'
}

export default function PlayersPage() {
  const { me } = useAuth()
  const { selectedTeamId, selectedTeamFormat, requiresSelection } = useTeamScope()
  const navigate = useNavigate()

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
  const [defaultTacticSignature, setDefaultTacticSignature] = useState('')
  const [tacticalPoints, setTacticalPoints] = useState<Record<string, TacticalPoint>>(() => normalizePointsMap(
    tacticalTokens,
    buildPointsMap(tacticalTokens, defaultFormation?.points || []),
  ))

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [primary, setPrimary] = useState<string>(POSITION_UNDEFINED)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isChild, setIsChild] = useState(false)
  const [parentFirstName, setParentFirstName] = useState('')
  const [parentLastName, setParentLastName] = useState('')
  const [licence, setLicence] = useState('')

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
      items = items.filter((p) => getPlayerDisplayName(p).toLowerCase().includes(needle))
    }
    if (posFilter) {
      if (posFilter === POSITION_UNDEFINED) {
        items = items.filter((p) => {
          const normalizedPosition = (p.primary_position || '').trim()
          return !normalizedPosition || normalizedPosition === POSITION_UNDEFINED
        })
      } else {
        items = items.filter((p) => p.primary_position === posFilter)
      }
    }
    return items
  }, [players, q, posFilter, requiresSelection, selectedTeamId])

  const sortedPlayers = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'position') {
        const leftPosition = (a.primary_position || POSITION_UNDEFINED).trim() || POSITION_UNDEFINED
        const rightPosition = (b.primary_position || POSITION_UNDEFINED).trim() || POSITION_UNDEFINED
        const byPosition = leftPosition.localeCompare(rightPosition, 'fr', { sensitivity: 'base' })
        if (byPosition !== 0) return byPosition
      }
      return getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b), 'fr', { sensitivity: 'base' })
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  }, [filtered, sortDir, sortKey])

  const hasActiveFilters = Boolean(q.trim() || posFilter)
  const playersCountLabel = sortedPlayers.length === 1 ? '1 joueur' : `${sortedPlayers.length} joueurs`
  const canSaveTactic = tacticName.trim().length > 0
  const currentTacticSignature = useMemo(
    () => JSON.stringify({ preset: tacticalPresetValue, points: tacticalPoints }),
    [tacticalPoints, tacticalPresetValue],
  )

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
      const fallbackDefault = readDefaultTactic(selectedTeamId, playersOnField)
      if (fallbackDefault) {
        setDefaultTacticSignature(JSON.stringify({ preset: fallbackDefault.preset, points: fallbackDefault.points }))
      } else {
        setDefaultTacticSignature('')
      }
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
      const savedDefault = readDefaultTactic(selectedTeamId, playersOnField)
      if (savedDefault) {
        setDefaultTacticSignature(JSON.stringify({ preset: savedDefault.preset, points: savedDefault.points }))
      } else {
        setDefaultTacticSignature('')
      }
    } catch {
      setTacticalFormation(defaultFormation.key)
      setTacticalPresetValue(`formation:${defaultFormation.key}`)
      setTacticalPoints(normalizePointsMap(tacticalTokens, buildPointsMap(tacticalTokens, defaultFormation.points)))
      setDefaultTacticSignature('')
    }
  }, [defaultFormation, playersOnField, selectedTeamId, tacticalFormations, tacticalTokens])

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!teamScopedWritable) return
    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const normalizedEmail = email.trim()
    const normalizedPhone = phone.trim()
    const normalizedParentFirstName = parentFirstName.trim()
    const normalizedParentLastName = parentLastName.trim()
    const normalizedLicence = licence.trim()

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !normalizedPhone) {
      uiAlert('Merci de renseigner prénom, nom, e-mail et téléphone.')
      return
    }
    if (isChild && (!normalizedParentFirstName || !normalizedParentLastName)) {
      uiAlert('Merci de renseigner le prénom et le nom du parent.')
      return
    }

    try {
      const body: {
        name: string
        firstName: string
        first_name: string
        prenom: string
        lastName: string
        last_name: string
        nom: string
        primary_position: string
        email: string
        phone: string
        licence?: string
        license?: string
        isChild: boolean
        enfant: boolean
        parentFirstName?: string
        parent_first_name?: string
        parentPrenom?: string
        parentLastName?: string
        parent_last_name?: string
        parentNom?: string
        teamId?: string
      } = {
        name: `${normalizedFirstName} ${normalizedLastName}`.trim(),
        firstName: normalizedFirstName,
        first_name: normalizedFirstName,
        prenom: normalizedFirstName,
        lastName: normalizedLastName,
        last_name: normalizedLastName,
        nom: normalizedLastName,
        primary_position: (primary || POSITION_UNDEFINED).trim() || POSITION_UNDEFINED,
        email: normalizedEmail,
        phone: normalizedPhone,
        isChild,
        enfant: isChild,
        teamId: selectedTeamId || undefined,
      }
      if (normalizedLicence) {
        body.licence = normalizedLicence
        body.license = normalizedLicence
      }
      if (isChild) {
        body.parentFirstName = normalizedParentFirstName
        body.parent_first_name = normalizedParentFirstName
        body.parentPrenom = normalizedParentFirstName
        body.parentLastName = normalizedParentLastName
        body.parent_last_name = normalizedParentLastName
        body.parentNom = normalizedParentLastName
      }
      const created = await apiPost<Player>(apiRoutes.players.list, body)
      setPlayers((prev) => [...prev, created].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b), 'fr', { sensitivity: 'base' })))
      setFirstName('')
      setLastName('')
      setPrimary(POSITION_UNDEFINED)
      setEmail('')
      setPhone('')
      setIsChild(false)
      setParentFirstName('')
      setParentLastName('')
      setLicence('')
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

  function setCurrentTacticAsDefault() {
    const normalizedName = tacticName.trim() || 'Tactique'
    const formation = tacticalPresetValue.startsWith('formation:')
      ? tacticalPresetValue.replace('formation:', '')
      : tacticalFormation
    const payload = {
      name: normalizedName,
      formation,
      preset: tacticalPresetValue,
      points: tacticalPoints,
      savedAt: new Date().toISOString(),
      playersOnField,
    }
    saveDefaultTactic(selectedTeamId, payload)
    setDefaultTacticSignature(JSON.stringify({ preset: payload.preset, points: payload.points }))
    uiAlert('Tactique par défaut enregistrée.')
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
            {POSITION_FILTERS.map((position) => (
              <button
                key={position}
                type="button"
                role="tab"
                aria-selected={posFilter === position}
                className={`players-filter-btn ${posFilter === position ? 'is-active' : ''}`}
                onClick={() => setPosFilter(position)}
              >
                {formatPositionLabel(position)}
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
                    <tr
                      key={player.id}
                      className="players-row-clickable"
                      role="button"
                      tabIndex={0}
                      aria-label={`Voir la fiche de ${getPlayerDisplayName(player)}`}
                      onClick={() => navigate(`/effectif/${encodeURIComponent(player.id)}`)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        navigate(`/effectif/${encodeURIComponent(player.id)}`)
                      }}
                    >
                      <td>
                        <div className="players-name-cell">
                          <PlayerAvatar player={player} />
                          <span>{getPlayerDisplayName(player)}</span>
                        </div>
                      </td>
                      <td>{formatPositionLabel(player.primary_position || POSITION_UNDEFINED)}</td>
                      <td className="players-row-actions">
                        <button
                          type="button"
                          className="players-icon-btn danger"
                          disabled={!teamScopedWritable}
                          onClick={(event) => {
                            event.stopPropagation()
                            void removePlayer(player.id)
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation()
                          }}
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
            <button
              type="button"
              className="players-secondary-btn"
              onClick={setCurrentTacticAsDefault}
              disabled={defaultTacticSignature === currentTacticSignature}
            >
              Par défaut
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
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-last-name-input">Nom</label>
                <input
                  id="player-last-name-input"
                  className="players-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-first-name-input">Prénom</label>
                <input
                  id="player-first-name-input"
                  className="players-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="players-form-field">
                <label className="players-checkbox" htmlFor="player-is-child-input">
                  <input
                    id="player-is-child-input"
                    type="checkbox"
                    checked={isChild}
                    onChange={(e) => setIsChild(e.target.checked)}
                  />
                  <span>Enfant</span>
                </label>
              </div>
              {isChild && (
                <>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-parent-last-name-input">Nom du parent</label>
                    <input
                      id="player-parent-last-name-input"
                      className="players-input"
                      value={parentLastName}
                      onChange={(e) => setParentLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-parent-first-name-input">Prénom du parent</label>
                    <input
                      id="player-parent-first-name-input"
                      className="players-input"
                      value={parentFirstName}
                      onChange={(e) => setParentFirstName(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-phone-input">Numéro de téléphone</label>
                <input
                  id="player-phone-input"
                  className="players-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-email-input">Adresse e-mail</label>
                <input
                  id="player-email-input"
                  className="players-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-licence-input">Licence</label>
                <input
                  id="player-licence-input"
                  className="players-input"
                  value={licence}
                  onChange={(e) => setLicence(e.target.value)}
                />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-position-select">Poste</label>
                <select
                  id="player-position-select"
                  className="players-input"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                >
                  <option value={POSITION_UNDEFINED}>{formatPositionLabel(POSITION_UNDEFINED)}</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {formatPositionLabel(position)}
                    </option>
                  ))}
                </select>
              </div>
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
  const displayName = getPlayerDisplayName(player)
  const initials = getInitials(displayName)
  return (
    <div className="players-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} />
      ) : (
        <span style={{ background: colorFromName(displayName) }}>{initials}</span>
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
