import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { isMatchNotPlayed } from '../matchStatus'
import type { AttendanceRow, ClubMe, MatchLite, MatchTeamLite, Plateau, Player } from '../types/api'
import { uiAlert } from '../ui'
import { useTeamScope } from '../useTeamScope'
import './MatchDetailsPage.css'
import './TrainingDetailsPage.css'

type MatchDetailsData = MatchLite & {
  playersById?: Record<string, Player>
}

type TacticalPoint = { x: number; y: number }
type FormationKey = '2-1-1' | '1-2-1' | '1-1-2'
type SavedTactic = {
  name: string
  formation: FormationKey
  points: Record<string, TacticalPoint>
  savedAt: string
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

const TACTICAL_TOKENS = ['gk', 'p1', 'p2', 'p3', 'p4'] as const
const TACTICAL_DEFAULT_FORMATION: FormationKey = '2-1-1'
const TACTICAL_FORMATIONS: Array<{ key: FormationKey; label: string; points: TacticalPoint[] }> = [
  {
    key: '2-1-1',
    label: '2-1-1',
    points: [
      { x: 50, y: 90 },
      { x: 33, y: 72 },
      { x: 67, y: 72 },
      { x: 50, y: 53 },
      { x: 50, y: 32 },
    ],
  },
  {
    key: '1-2-1',
    label: '1-2-1',
    points: [
      { x: 50, y: 90 },
      { x: 50, y: 72 },
      { x: 36, y: 52 },
      { x: 64, y: 52 },
      { x: 50, y: 32 },
    ],
  },
  {
    key: '1-1-2',
    label: '1-1-2',
    points: [
      { x: 50, y: 90 },
      { x: 50, y: 72 },
      { x: 50, y: 53 },
      { x: 36, y: 32 },
      { x: 64, y: 32 },
    ],
  },
]

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

function getAvatarUrl(player: Player | undefined) {
  if (!player) return null
  const withAvatar = player as Player & {
    avatarUrl?: string | null
    avatar?: string | null
    photoUrl?: string | null
    imageUrl?: string | null
  }
  return withAvatar.avatarUrl || withAvatar.avatar || withAvatar.photoUrl || withAvatar.imageUrl || null
}

function getTeam(match: MatchLite, side: 'home' | 'away'): MatchTeamLite | undefined {
  return match.teams.find((team) => team.side === side)
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

function buildPointsMap(points: TacticalPoint[]): Record<string, TacticalPoint> {
  return TACTICAL_TOKENS.reduce<Record<string, TacticalPoint>>((acc, token, index) => {
    acc[token] = points[index] || { x: 50, y: 50 }
    return acc
  }, {})
}

function getFormationPointsMap(key: FormationKey) {
  const formation = TACTICAL_FORMATIONS.find((item) => item.key === key)
  return buildPointsMap(formation?.points || [])
}

function getRole(point: TacticalPoint) {
  if (point.y >= 88) return 'GARDIEN'
  if (point.y >= 62) return 'DEFENSEUR'
  if (point.y >= 42) return 'MILIEU'
  return 'ATTAQUANT'
}

function roleLabel(role: string) {
  if (role === 'GARDIEN') return 'Gardien'
  if (role === 'DEFENSEUR') return 'Defenseur'
  if (role === 'MILIEU') return 'Milieu'
  return 'Attaquant'
}

type BackendMatchTactic = {
  preset?: string
  points?: Record<string, TacticalPoint>
}

function readBackendTactic(match: MatchDetailsData): BackendMatchTactic | null {
  const source = (
    (match as MatchDetailsData & { tactic?: unknown }).tactic
    ?? (match as MatchDetailsData & { tactical?: unknown }).tactical
    ?? (match as MatchDetailsData & { tactique?: unknown }).tactique
  ) as BackendMatchTactic | undefined
  if (!source || typeof source !== 'object') return null
  return source
}

export default function MatchDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedTeamId } = useTeamScope()

  const [match, setMatch] = useState<MatchDetailsData | null>(null)
  const [plateauDateISO, setPlateauDateISO] = useState<string>('')
  const [clubName, setClubName] = useState<string>('Club')
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauPlayerIds, setPlateauPlayerIds] = useState<string[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<MatchDraft | null>(null)
  const [editHomeScore, setEditHomeScore] = useState(0)
  const [editAwayScore, setEditAwayScore] = useState(0)
  const [editIsPlayed, setEditIsPlayed] = useState(false)
  const [selectedHomeScorer, setSelectedHomeScorer] = useState('')
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([])
  const [tacticalPresetValue, setTacticalPresetValue] = useState(`formation:${TACTICAL_DEFAULT_FORMATION}`)
  const [tacticalPoints, setTacticalPoints] = useState<Record<string, TacticalPoint>>(
    () => getFormationPointsMap(TACTICAL_DEFAULT_FORMATION),
  )
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({})
  const [dragState, setDragState] = useState<{
    playerId: string
    pointerId: number
    x: number
    y: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const tacticalDragRootRef = useRef<HTMLDivElement | null>(null)

  const loadMatch = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [payload, club, roster] = await Promise.all([
      apiGet<MatchDetailsData>(apiRoutes.matches.byId(id)),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Player[]>(apiRoutes.players.list).catch(() => []),
    ])

    let nextPlateauDateISO = ''
    let nextPlateauPlayerIds: string[] = []
    if (payload.plateauId) {
      const [plateau, attendanceRows] = await Promise.all([
        apiGet<Plateau>(apiRoutes.plateaus.byId(payload.plateauId)).catch(() => null),
        apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('PLATEAU', payload.plateauId)).catch(() => []),
      ])
      nextPlateauDateISO = plateau?.date || ''
      nextPlateauPlayerIds = Array.from(new Set(
        attendanceRows
          .map((row) => row.playerId)
          .filter((playerId): playerId is string => Boolean(playerId)),
      ))
    }

    if (isCancelled()) return
    setMatch(payload)
    setDraft(buildDraft(payload))
    const backendTactic = readBackendTactic(payload)
    const nextPreset = typeof backendTactic?.preset === 'string' && backendTactic.preset.trim()
      ? backendTactic.preset
      : `formation:${TACTICAL_DEFAULT_FORMATION}`
    const nextPoints = backendTactic?.points && typeof backendTactic.points === 'object'
      ? buildPointsMap(TACTICAL_TOKENS.map((tokenId) => backendTactic.points?.[tokenId] || { x: 50, y: 50 }))
      : getFormationPointsMap(TACTICAL_DEFAULT_FORMATION)
    setTacticalPresetValue(nextPreset)
    setTacticalPoints(nextPoints)
    setPlayers(roster)
    setPlateauDateISO(nextPlateauDateISO)
    setPlateauPlayerIds(nextPlateauPlayerIds)
    if (club?.name?.trim()) setClubName(club.name.trim())
  }, [id])

  const { loading, error } = useAsyncLoader(loadMatch)

  useEffect(() => {
    const libraryKey = `izifoot.tactical.library.${selectedTeamId || 'all'}`
    const rawLibrary = window.localStorage.getItem(libraryKey)
    if (!rawLibrary) {
      setSavedTactics([])
      return
    }
    try {
      const parsed = JSON.parse(rawLibrary) as SavedTactic[]
      if (Array.isArray(parsed)) {
        setSavedTactics(parsed)
      } else {
        setSavedTactics([])
      }
    } catch {
      setSavedTactics([])
    }
  }, [selectedTeamId])

  useEffect(() => {
    if (!isEditModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isEditModalOpen])

  const home = useMemo(() => (match ? getTeam(match, 'home') : undefined), [match])
  const away = useMemo(() => (match ? getTeam(match, 'away') : undefined), [match])
  const homeScore = home?.score ?? 0
  const awayScore = away?.score ?? 0
  const pending = match ? isMatchNotPlayed(match, { referenceDate: plateauDateISO || null }) : false
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
  const sortedPlayers = useMemo(() => players.slice().sort((a, b) => a.name.localeCompare(b.name)), [players])
  const viewDraft = draft ?? { home: { starters: [], subs: [] }, away: { starters: [], subs: [] }, scorers: [] }
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p] as const)), [players])

  const compositionPlayers = useMemo(() => {
    const allowedIds = plateauPlayerIds.length > 0 ? plateauPlayerIds : sortedPlayers.map((player) => player.id)
    const allowedSet = new Set(allowedIds)
    return sortedPlayers.filter((player) => allowedSet.has(player.id))
  }, [plateauPlayerIds, sortedPlayers])

  const compositionPlayerIds = useMemo(() => {
    const ids = plateauPlayerIds.length > 0
      ? plateauPlayerIds
      : sortedPlayers.map((player) => player.id)
    const unique = new Set(ids)
    for (const playerId of [...viewDraft.home.starters, ...viewDraft.home.subs]) {
      unique.add(playerId)
    }
    return Array.from(unique)
  }, [plateauPlayerIds, sortedPlayers, viewDraft.home.starters, viewDraft.home.subs])

  const heroHomeScorers = useMemo(
    () => viewDraft.scorers
      .filter((s) => s.side === 'home')
      .map((s) => playerNameById.get(s.playerId) || s.playerId),
    [viewDraft.scorers, playerNameById],
  )

  const tacticalSlots = useMemo(() => {
    const counters: Record<string, number> = {}
    return TACTICAL_TOKENS.map((tokenId) => {
      const point = tacticalPoints[tokenId] || { x: 50, y: 50 }
      const role = getRole(point)
      counters[role] = (counters[role] || 0) + 1
      const roleIndex = counters[role]
      return {
        id: tokenId,
        point,
        label: role === 'GARDIEN' ? roleLabel(role) : `${roleLabel(role)} ${roleIndex}`,
      }
    })
  }, [tacticalPoints])
  const assignedPlayerIds = useMemo(
    () => Array.from(new Set(Object.values(slotAssignments).filter((playerId): playerId is string => Boolean(playerId)))),
    [slotAssignments],
  )
  const benchPlayers = useMemo(
    () => compositionPlayers.filter((player) => !assignedPlayerIds.includes(player.id)),
    [compositionPlayers, assignedPlayerIds],
  )

  const rebuildHomeCompositionFromAssignments = useCallback((
    assignments: Record<string, string>,
    availablePlayerIds: string[],
  ) => {
    setDraft((prev) => {
      if (!prev) return prev
      const starters = Array.from(new Set(
        TACTICAL_TOKENS
          .map((tokenId) => assignments[tokenId])
          .filter((playerId): playerId is string => Boolean(playerId)),
      ))
      const starterSet = new Set(starters)
      const subs = availablePlayerIds.filter((playerId) => !starterSet.has(playerId))
      return {
        ...prev,
        home: {
          starters,
          subs,
        },
      }
    })
  }, [])

  function openEditModal() {
    setMenuOpen(false)
    if (match) {
      const nextDraft = buildDraft(match)
      setDraft(nextDraft)
      const initialAssignments: Record<string, string> = {}
      TACTICAL_TOKENS.forEach((tokenId, index) => {
        initialAssignments[tokenId] = nextDraft.home.starters[index] || ''
      })
      setSlotAssignments(initialAssignments)
      rebuildHomeCompositionFromAssignments(initialAssignments, compositionPlayerIds)
    }
    setEditHomeScore(homeScore)
    setEditAwayScore(awayScore)
    setEditIsPlayed(!pending)
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

  function handleTacticPresetChange(value: string) {
    setTacticalPresetValue(value)
    if (value.startsWith('formation:')) {
      const formationKey = value.replace('formation:', '') as FormationKey
      setTacticalPoints(getFormationPointsMap(formationKey))
      return
    }
    if (value.startsWith('tactic:')) {
      const tacticName = value.replace('tactic:', '')
      const saved = savedTactics.find((item) => item.name === tacticName)
      if (!saved) return
      setTacticalPoints(buildPointsMap(TACTICAL_TOKENS.map((tokenId) => saved.points[tokenId] || { x: 50, y: 50 })))
    }
  }

  function assignPlayerToSlot(slotId: string, playerId: string) {
    setSlotAssignments((prev) => {
      const next = { ...prev, [slotId]: playerId }
      if (playerId) {
        for (const tokenId of TACTICAL_TOKENS) {
          if (tokenId !== slotId && next[tokenId] === playerId) {
            next[tokenId] = ''
          }
        }
      }
      rebuildHomeCompositionFromAssignments(next, compositionPlayerIds)
      return next
    })
  }

  function unassignPlayer(playerId: string) {
    if (!playerId) return
    setSlotAssignments((prev) => {
      const next = { ...prev }
      let changed = false
      for (const tokenId of TACTICAL_TOKENS) {
        if (next[tokenId] === playerId) {
          next[tokenId] = ''
          changed = true
        }
      }
      if (!changed) return prev
      rebuildHomeCompositionFromAssignments(next, compositionPlayerIds)
      return next
    })
  }

  function applyDrop(playerId: string, clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const slotTarget = target?.closest<HTMLElement>('[data-slot-id]')
    if (slotTarget) {
      const slotId = slotTarget.dataset.slotId
      if (slotId) {
        assignPlayerToSlot(slotId, playerId)
        return
      }
    }
    const benchTarget = target?.closest<HTMLElement>('[data-bench-drop="true"]')
    if (benchTarget) {
      unassignPlayer(playerId)
    }
  }

  function handleTokenPointerDown(event: ReactPointerEvent<HTMLElement>, playerId: string) {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const rect = target.getBoundingClientRect()
    const rootRect = tacticalDragRootRef.current?.getBoundingClientRect()
    const rootScrollLeft = tacticalDragRootRef.current?.scrollLeft || 0
    const rootScrollTop = tacticalDragRootRef.current?.scrollTop || 0
    const relativeX = rootRect ? event.clientX - rootRect.left + rootScrollLeft : event.clientX
    const relativeY = rootRect ? event.clientY - rootRect.top + rootScrollTop : event.clientY
    setDragState({
      playerId,
      pointerId: event.pointerId,
      x: relativeX,
      y: relativeY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    })
  }

  function handleTokenPointerMove(event: ReactPointerEvent<HTMLElement>) {
    setDragState((prev) => {
      if (!prev || prev.pointerId !== event.pointerId) return prev
      const rootRect = tacticalDragRootRef.current?.getBoundingClientRect()
      const rootScrollLeft = tacticalDragRootRef.current?.scrollLeft || 0
      const rootScrollTop = tacticalDragRootRef.current?.scrollTop || 0
      const relativeX = rootRect ? event.clientX - rootRect.left + rootScrollLeft : event.clientX
      const relativeY = rootRect ? event.clientY - rootRect.top + rootScrollTop : event.clientY
      return { ...prev, x: relativeX, y: relativeY }
    })
  }

  function handleTokenPointerUp(event: ReactPointerEvent<HTMLElement>) {
    setDragState((prev) => {
      if (!prev || prev.pointerId !== event.pointerId) return prev
      applyDrop(prev.playerId, event.clientX, event.clientY)
      return null
    })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function addScorer(playerId: string) {
    if (!playerId || !editIsPlayed) return
    setDraft((prev) => (prev
      ? {
        ...prev,
        scorers: [...prev.scorers.filter((s) => s.side === 'home'), { side: 'home', playerId }],
      }
      : prev))
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
        played: editIsPlayed,
        tactic: {
          preset: tacticalPresetValue,
          points: tacticalPoints,
        },
      })
      setMatch(updated)
      setDraft(buildDraft(updated))
      const updatedTactic = readBackendTactic(updated)
      const updatedPreset = typeof updatedTactic?.preset === 'string' && updatedTactic.preset.trim()
        ? updatedTactic.preset
        : `formation:${TACTICAL_DEFAULT_FORMATION}`
      const updatedPoints = updatedTactic?.points && typeof updatedTactic.points === 'object'
        ? buildPointsMap(TACTICAL_TOKENS.map((tokenId) => updatedTactic.points?.[tokenId] || { x: 50, y: 50 }))
        : getFormationPointsMap(TACTICAL_DEFAULT_FORMATION)
      setTacticalPresetValue(updatedPreset)
      setTacticalPoints(updatedPoints)
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
                  const maybeAvatar = getAvatarUrl(player)
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
                  const maybeAvatar = getAvatarUrl(player)
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
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditHomeScore((v) => Math.max(0, v - 1))}>-</button>
                    <strong>{editHomeScore}</strong>
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditHomeScore((v) => v + 1)}>+</button>
                  </div>
                </div>
                <div className="modal-score-item">
                  <span>Adversaire</span>
                  <div className="modal-score-controls">
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditAwayScore((v) => Math.max(0, v - 1))}>-</button>
                    <strong>{editAwayScore}</strong>
                    <button type="button" disabled={!editIsPlayed} onClick={() => setEditAwayScore((v) => v + 1)}>+</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lineup-stack">
              <p>Composition tactique</p>
              <div className="match-tactical-head">
                <label htmlFor="match-tactic-select">Tactique</label>
                <select
                  id="match-tactic-select"
                  value={tacticalPresetValue}
                  onChange={(event) => handleTacticPresetChange(event.target.value)}
                >
                  <optgroup label="Formations">
                    {TACTICAL_FORMATIONS.map((formation) => (
                      <option key={formation.key} value={`formation:${formation.key}`}>
                        {formation.label}
                      </option>
                    ))}
                  </optgroup>
                  {savedTactics.length > 0 && (
                    <optgroup label="Tactiques sauvegardées">
                      {savedTactics.map((saved) => (
                        <option key={saved.name} value={`tactic:${saved.name}`}>
                          {saved.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div ref={tacticalDragRootRef} className="match-tactical-layout">
                <div className="match-tactical-roster">
                  <p>Joueurs (glisser vers un poste)</p>
                  <div
                    data-bench-drop="true"
                    className={`match-bench-grid ${dragState ? 'is-drop-active' : ''}`}
                  >
                    {benchPlayers.map((player) => {
                      const avatar = getAvatarUrl(player)
                      return (
                        <button
                          key={`bench-${player.id}`}
                          type="button"
                          className="match-player-avatar-token"
                          title={player.name}
                          onPointerDown={(event) => handleTokenPointerDown(event, player.id)}
                          onPointerMove={handleTokenPointerMove}
                          onPointerUp={handleTokenPointerUp}
                          onPointerCancel={handleTokenPointerUp}
                        >
                          {avatar ? (
                            <img src={avatar} alt={player.name} />
                          ) : (
                            <span style={{ background: colorFromName(player.name) }}>{getInitials(player.name)}</span>
                          )}
                        </button>
                      )
                    })}
                    {benchPlayers.length === 0 && <p className="muted-inline">Tous les joueurs sont placés.</p>}
                  </div>
                </div>

                <div className="match-tactical-pitch" role="group" aria-label="Composition tactique">
                  <div className="match-tactical-center-line" />
                  <div className="match-tactical-center-circle" />
                  {tacticalSlots.map((slot) => {
                    const assignedPlayerId = slotAssignments[slot.id] || ''
                    const assignedPlayer = assignedPlayerId ? playerById.get(assignedPlayerId) : undefined
                    const assignedAvatar = getAvatarUrl(assignedPlayer)
                    const assignedName = assignedPlayer?.name || assignedPlayerId
                    return (
                      <div
                        key={slot.id}
                        data-slot-id={slot.id}
                        className={`match-tactical-slot ${assignedPlayerId ? 'is-filled' : ''}`}
                        style={{
                          left: `calc(${slot.point.x}% - 40px)`,
                          top: `calc(${slot.point.y}% - 40px)`,
                        }}
                      >
                        <span>{slot.label}</span>
                        <div className="match-tactical-slot-token">
                          {assignedPlayerId ? (
                            <button
                              type="button"
                              className="match-player-avatar-token"
                              title={assignedName}
                              onPointerDown={(event) => handleTokenPointerDown(event, assignedPlayerId)}
                              onPointerMove={handleTokenPointerMove}
                              onPointerUp={handleTokenPointerUp}
                              onPointerCancel={handleTokenPointerUp}
                              onDoubleClick={() => unassignPlayer(assignedPlayerId)}
                            >
                              {assignedAvatar ? (
                                <img src={assignedAvatar} alt={assignedName} />
                              ) : (
                                <span style={{ background: colorFromName(assignedName) }}>{getInitials(assignedName)}</span>
                              )}
                            </button>
                          ) : (
                            <span className="match-slot-placeholder">Drop</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {dragState && (
                  <div
                    className="match-drag-ghost"
                    style={{
                      left: dragState.x - dragState.offsetX,
                      top: dragState.y - dragState.offsetY,
                    }}
                    aria-hidden="true"
                  >
                    {(() => {
                      const player = playerById.get(dragState.playerId)
                      const avatar = getAvatarUrl(player)
                      const name = player?.name || dragState.playerId
                      return avatar ? (
                        <img src={avatar} alt={name} />
                      ) : (
                        <span style={{ background: colorFromName(name) }}>{getInitials(name)}</span>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="lineup-stack">
                <p>Titulaires</p>
                <ul>
                  {viewDraft.home.starters.map((playerId, index) => (
                    <li key={`modal-home-starter-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                    </li>
                  ))}
                  {viewDraft.home.starters.length === 0 && <li>Aucun joueur</li>}
                </ul>
              </div>

              <div className="lineup-stack">
                <p>Remplaçants automatiques</p>
                <ul>
                  {viewDraft.home.subs.map((playerId, index) => (
                    <li key={`modal-home-sub-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                    </li>
                  ))}
                  {viewDraft.home.subs.length === 0 && <li>Aucun remplaçant</li>}
                </ul>
              </div>
            </div>

            <div className="lineup-stack">
              <p>Buteurs</p>
              <div className="editor-inline-row is-short">
                <select value={selectedHomeScorer} onChange={(e) => setSelectedHomeScorer(e.target.value)} disabled={!editIsPlayed}>
                  <option value="">Joueur...</option>
                  {compositionPlayers.map((player) => (
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
