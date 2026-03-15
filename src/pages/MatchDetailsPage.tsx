import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiDelete, apiGet, apiPut, apiUrl } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { buildPointsMap, buildTacticalFormations, buildTacticalTokens, type TacticalPoint } from '../features/tactical'
import { playersOnFieldFromGameFormat } from '../features/teamFormat'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { isMatchNotPlayed } from '../matchStatus'
import type { ClubMe, MatchLite, MatchTeamLite, Plateau, Player } from '../types/api'
import { uiAlert } from '../ui'
import { useTeamScope } from '../useTeamScope'
import './MatchDetailsPage.css'
import './TrainingDetailsPage.css'

type MatchDetailsData = MatchLite & {
  playersById?: Record<string, Player>
}

type PlateauConvocation = {
  player: Player
  status?: 'present' | 'absent' | 'convoque' | 'non_convoque'
  present?: boolean
}

type PlateauSummaryResponse = {
  plateau: Plateau
  convocations: PlateauConvocation[]
  playersById?: Record<string, Player>
}

type SavedTactic = {
  name: string
  formation: string
  points: Record<string, TacticalPoint>
  savedAt: string
  playersOnField?: number
}

type SideDraft = {
  starters: string[]
  subs: string[]
}

type MatchDraft = {
  home: SideDraft
  away: SideDraft
  scorers: Array<{ playerId: string; side: 'home' | 'away'; assistId?: string }>
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

function readScorerAssistId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const scorer = raw as {
    assistId?: unknown
    assistPlayerId?: unknown
    passeurId?: unknown
    passerId?: unknown
  }
  const candidate = scorer.assistId ?? scorer.assistPlayerId ?? scorer.passeurId ?? scorer.passerId
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
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
    scorers: match.scorers.map((s) => ({
      playerId: s.playerId,
      side: s.side,
      assistId: readScorerAssistId(s),
    })),
  }
}

function getFormationPointsMap(tokens: string[], key: string, formations: Array<{ key: string; points: TacticalPoint[] }>) {
  const formation = formations.find((item) => item.key === key)
  return buildPointsMap(tokens, formation?.points || [])
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

type LiveEventType = 'GOAL_FOR' | 'GOAL_AGAINST' | 'SUBSTITUTION'

type LiveMatchEvent = {
  id: string
  minute: number
  type: LiveEventType
  scorerId?: string
  assistId?: string
  slotId?: string
  inPlayerId?: string
  outPlayerId?: string
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

type WakeLockSentinelLike = {
  release: () => Promise<void>
  released?: boolean
}

export default function MatchDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedTeamId, selectedTeamFormat } = useTeamScope()
  const playersOnField = useMemo(() => playersOnFieldFromGameFormat(selectedTeamFormat, 5), [selectedTeamFormat])
  const tacticalTokens = useMemo(() => buildTacticalTokens(playersOnField), [playersOnField])
  const tacticalFormations = useMemo(() => buildTacticalFormations(playersOnField), [playersOnField])
  const defaultFormation = tacticalFormations[0]

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
  const [tacticalPresetValue, setTacticalPresetValue] = useState(defaultFormation ? `formation:${defaultFormation.key}` : '')
  const [tacticalPoints, setTacticalPoints] = useState<Record<string, TacticalPoint>>(
    () => getFormationPointsMap(tacticalTokens, defaultFormation?.key || '', tacticalFormations),
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
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const [isPlayOverlayOpen, setIsPlayOverlayOpen] = useState(false)
  const [playPhase, setPlayPhase] = useState<'setup' | 'running' | 'ended'>('setup')
  const [playDurationMinutes, setPlayDurationMinutes] = useState(10)
  const [playRemainingSeconds, setPlayRemainingSeconds] = useState(10 * 60)
  const [playHomeScore, setPlayHomeScore] = useState(0)
  const [playAwayScore, setPlayAwayScore] = useState(0)
  const [liveEvents, setLiveEvents] = useState<LiveMatchEvent[]>([])
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [goalScorerId, setGoalScorerId] = useState('')
  const [goalAssistId, setGoalAssistId] = useState('')
  const [liveSaving, setLiveSaving] = useState(false)

  const loadMatch = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [payload, club, roster] = await Promise.all([
      apiGet<MatchDetailsData>(apiRoutes.matches.byId(id)),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Player[]>(apiRoutes.players.list).catch(() => []),
    ])

    let plateauSummary: PlateauSummaryResponse | null = null
    let nextPlateauDateISO = ''
    let nextPlateauPlayerIds: string[] = []
    if (payload.plateauId) {
      plateauSummary = await apiGet<PlateauSummaryResponse>(apiRoutes.plateaus.summary(payload.plateauId)).catch(() => null)
      if (plateauSummary?.plateau?.date) nextPlateauDateISO = plateauSummary.plateau.date
      nextPlateauPlayerIds = Array.from(new Set(
        (plateauSummary?.convocations || [])
          .filter((convocation) => {
            const status = convocation.status ?? (convocation.present ? 'present' : 'non_convoque')
            return status === 'present' || status === 'convoque'
          })
          .map((convocation) => convocation.player?.id)
          .filter((playerId): playerId is string => Boolean(playerId)),
      ))
    }

    if (isCancelled()) return
    setMatch(payload)
    setDraft(buildDraft(payload))
    const backendTactic = readBackendTactic(payload)
    const fallbackFormationKey = defaultFormation?.key || ''
    const nextPreset = typeof backendTactic?.preset === 'string' && backendTactic.preset.trim()
      ? backendTactic.preset
      : `formation:${fallbackFormationKey}`
    const nextPoints = backendTactic?.points && typeof backendTactic.points === 'object'
      ? buildPointsMap(tacticalTokens, tacticalTokens.map((tokenId) => backendTactic.points?.[tokenId] || { x: 50, y: 50 }))
      : getFormationPointsMap(tacticalTokens, fallbackFormationKey, tacticalFormations)
    setTacticalPresetValue(nextPreset)
    setTacticalPoints(nextPoints)
    const playersMap = new Map<string, Player>()
    for (const player of roster) playersMap.set(player.id, player)
    for (const convocation of plateauSummary?.convocations || []) {
      if (convocation.player?.id) playersMap.set(convocation.player.id, convocation.player)
    }
    for (const player of Object.values(payload.playersById || {})) {
      if (player?.id) playersMap.set(player.id, player)
    }
    for (const team of payload.teams || []) {
      for (const row of team.players || []) {
        if (row.player?.id) playersMap.set(row.player.id, row.player)
      }
    }
    setPlayers(Array.from(playersMap.values()))
    setPlateauDateISO(nextPlateauDateISO)
    setPlateauPlayerIds(nextPlateauPlayerIds)
    if (club?.name?.trim()) setClubName(club.name.trim())
  }, [defaultFormation?.key, id, tacticalFormations, tacticalTokens])

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
        setSavedTactics(parsed.filter((item) => !item.playersOnField || item.playersOnField === playersOnField))
      } else {
        setSavedTactics([])
      }
    } catch {
      setSavedTactics([])
    }
  }, [playersOnField, selectedTeamId])

  useEffect(() => {
    if (!isEditModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isEditModalOpen])

  useEffect(() => {
    let cancelled = false

    async function requestWakeLock() {
      if (!isPlayOverlayOpen) return
      if (typeof navigator === 'undefined') return
      const wakeLockApi = (navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }).wakeLock
      if (!wakeLockApi?.request) return
      try {
        const sentinel = await wakeLockApi.request('screen')
        if (cancelled) {
          await sentinel.release().catch(() => undefined)
          return
        }
        wakeLockRef.current = sentinel
      } catch {
        // Wake lock non supporté / refusé: on ignore.
      }
    }

    async function releaseWakeLock() {
      const current = wakeLockRef.current
      wakeLockRef.current = null
      if (!current) return
      await current.release().catch(() => undefined)
    }

    function onVisibilityChange() {
      if (!isPlayOverlayOpen) return
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
      }
    }

    if (isPlayOverlayOpen) {
      void requestWakeLock()
      document.addEventListener('visibilitychange', onVisibilityChange)
    } else {
      void releaseWakeLock()
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void releaseWakeLock()
    }
  }, [isPlayOverlayOpen])

  useEffect(() => {
    if (!isPlayOverlayOpen || playPhase !== 'running') return
    const intervalId = window.setInterval(() => {
      setPlayRemainingSeconds((prev) => {
        if (prev <= 1) {
          setPlayPhase('ended')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [isPlayOverlayOpen, playPhase])

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

  const usePlateauEligibility = Boolean(match?.plateauId)
  const compositionPlayers = useMemo(() => {
    const allowedIds = usePlateauEligibility ? plateauPlayerIds : sortedPlayers.map((player) => player.id)
    const allowedSet = new Set(allowedIds)
    return sortedPlayers.filter((player) => allowedSet.has(player.id))
  }, [usePlateauEligibility, plateauPlayerIds, sortedPlayers])
  const eligiblePlayerIds = useMemo(
    () => compositionPlayers.map((player) => player.id),
    [compositionPlayers],
  )
  const eligiblePlayerIdSet = useMemo(
    () => new Set(eligiblePlayerIds),
    [eligiblePlayerIds],
  )

  const compositionPlayerIds = useMemo(() => {
    const ids = usePlateauEligibility ? plateauPlayerIds : sortedPlayers.map((player) => player.id)
    const unique = new Set(ids)
    if (!usePlateauEligibility) {
      for (const playerId of [...viewDraft.home.starters, ...viewDraft.home.subs]) {
        unique.add(playerId)
      }
    }
    return Array.from(unique)
  }, [usePlateauEligibility, plateauPlayerIds, sortedPlayers, viewDraft.home.starters, viewDraft.home.subs])
  const displayedHomeStarters = useMemo(
    () => (
      usePlateauEligibility
        ? viewDraft.home.starters.filter((playerId) => eligiblePlayerIdSet.has(playerId)).slice(0, tacticalTokens.length)
        : viewDraft.home.starters.slice(0, tacticalTokens.length)
    ),
    [eligiblePlayerIdSet, tacticalTokens.length, usePlateauEligibility, viewDraft.home.starters],
  )
  const displayedHomeSubs = useMemo(() => {
    if (!usePlateauEligibility) return viewDraft.home.subs
    const startersSet = new Set(displayedHomeStarters)
    return viewDraft.home.subs.filter((playerId) => eligiblePlayerIdSet.has(playerId) && !startersSet.has(playerId))
  }, [usePlateauEligibility, viewDraft.home.subs, displayedHomeStarters, eligiblePlayerIdSet])

  const heroHomeScorers = useMemo(
    () => viewDraft.scorers
      .filter((s) => s.side === 'home')
      .map((s) => {
        const scorerName = playerNameById.get(s.playerId) || s.playerId
        if (!s.assistId) return scorerName
        const assistName = playerNameById.get(s.assistId) || s.assistId
        return `${scorerName} (${assistName})`
      }),
    [viewDraft.scorers, playerNameById],
  )

  const tacticalSlots = useMemo(() => {
    const counters: Record<string, number> = {}
    return tacticalTokens.map((tokenId) => {
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
  }, [tacticalPoints, tacticalTokens])
  const assignedPlayerIds = useMemo(
    () => Array.from(new Set(Object.values(slotAssignments).filter((playerId): playerId is string => Boolean(playerId)))),
    [slotAssignments],
  )
  const benchPlayers = useMemo(
    () => compositionPlayers.filter((player) => !assignedPlayerIds.includes(player.id)),
    [compositionPlayers, assignedPlayerIds],
  )
  const liveMinute = useMemo(() => {
    const elapsed = Math.max(0, playDurationMinutes * 60 - playRemainingSeconds)
    return Math.max(1, Math.floor(elapsed / 60) + 1)
  }, [playDurationMinutes, playRemainingSeconds])
  const liveAssignedPlayers = useMemo(
    () => compositionPlayers.filter((player) => assignedPlayerIds.includes(player.id)),
    [compositionPlayers, assignedPlayerIds],
  )

  const rebuildHomeCompositionFromAssignments = useCallback((
    assignments: Record<string, string>,
    availablePlayerIds: string[],
  ) => {
    setDraft((prev) => {
      if (!prev) return prev
      const availableSet = new Set(availablePlayerIds)
      const starters = Array.from(new Set(
        tacticalTokens
          .map((tokenId) => assignments[tokenId])
          .filter((playerId): playerId is string => Boolean(playerId) && availableSet.has(playerId)),
      )).slice(0, tacticalTokens.length)
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
  }, [tacticalTokens])

  function openEditModal() {
    setMenuOpen(false)
    if (match) {
      const nextDraft = buildDraft(match)
      const sanitizedStarters = nextDraft.home.starters
        .filter((playerId) => eligiblePlayerIdSet.has(playerId))
        .slice(0, tacticalTokens.length)
      const startersSet = new Set(sanitizedStarters)
      const sanitizedSubs = nextDraft.home.subs
        .filter((playerId) => eligiblePlayerIdSet.has(playerId) && !startersSet.has(playerId))
      setDraft({
        ...nextDraft,
        home: {
          starters: sanitizedStarters,
          subs: sanitizedSubs,
        },
      })
      const initialAssignments: Record<string, string> = {}
      tacticalTokens.forEach((tokenId, index) => {
        initialAssignments[tokenId] = sanitizedStarters[index] || ''
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

  function formatClock(totalSeconds: number) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  async function persistLiveEvent(event: LiveMatchEvent) {
    if (!id) return
    try {
      const res = await fetch(apiUrl(`${apiRoutes.matches.byId(id)}/events`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })
      if (!res.ok) {
        // Endpoint backend non disponible pour l'instant.
        console.info('[live-match] events endpoint not ready', res.status)
      }
    } catch {
      // Endpoint backend non disponible pour l'instant.
    }
  }

  function pushLiveEvent(event: Omit<LiveMatchEvent, 'id' | 'minute'>) {
    const nextEvent: LiveMatchEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      minute: liveMinute,
    }
    setLiveEvents((prev) => [...prev, nextEvent])
    void persistLiveEvent(nextEvent)
  }

  function openPlayOverlay() {
    if (!match) return
    const nextDraft = buildDraft(match)
    const sanitizedStarters = nextDraft.home.starters
      .filter((playerId) => eligiblePlayerIdSet.has(playerId))
      .slice(0, tacticalTokens.length)
    const startersSet = new Set(sanitizedStarters)
    const sanitizedSubs = nextDraft.home.subs
      .filter((playerId) => eligiblePlayerIdSet.has(playerId) && !startersSet.has(playerId))
    setDraft({
      ...nextDraft,
      home: {
        starters: sanitizedStarters,
        subs: sanitizedSubs,
      },
    })
    const initialAssignments: Record<string, string> = {}
    tacticalTokens.forEach((tokenId, index) => {
      initialAssignments[tokenId] = sanitizedStarters[index] || ''
    })
    setSlotAssignments(initialAssignments)
    rebuildHomeCompositionFromAssignments(initialAssignments, compositionPlayerIds)
    setPlayDurationMinutes(10)
    setPlayRemainingSeconds(10 * 60)
    setPlayHomeScore(0)
    setPlayAwayScore(0)
    setLiveEvents([])
    setPlayPhase('setup')
    setGoalScorerId('')
    setGoalAssistId('')
    setGoalModalOpen(false)
    setIsPlayOverlayOpen(true)
  }

  function startKickoff() {
    setPlayRemainingSeconds(Math.max(60, playDurationMinutes * 60))
    setPlayPhase('running')
  }

  function recordGoalAgainst() {
    if (playPhase !== 'running') return
    setPlayAwayScore((prev) => prev + 1)
    pushLiveEvent({ type: 'GOAL_AGAINST' })
  }

  function openGoalForModal() {
    if (playPhase !== 'running') return
    const defaultScorer = liveAssignedPlayers[0]?.id || ''
    setGoalScorerId(defaultScorer)
    setGoalAssistId('')
    setGoalModalOpen(true)
  }

  function confirmGoalFor() {
    if (!goalScorerId || playPhase !== 'running') return
    setPlayHomeScore((prev) => prev + 1)
    setDraft((prev) => (prev
      ? { ...prev, scorers: [...prev.scorers, { side: 'home', playerId: goalScorerId, assistId: goalAssistId || undefined }] }
      : prev))
    pushLiveEvent({
      type: 'GOAL_FOR',
      scorerId: goalScorerId,
      assistId: goalAssistId || undefined,
    })
    setGoalModalOpen(false)
    setGoalScorerId('')
    setGoalAssistId('')
  }

  async function closePlayOverlay() {
    if (!match || !id || !draft) {
      setIsPlayOverlayOpen(false)
      return
    }
    if (playPhase !== 'ended') {
      setIsPlayOverlayOpen(false)
      return
    }
    setLiveSaving(true)
    try {
      const sanitizedHomeStarters = draft.home.starters
        .filter((playerId) => eligiblePlayerIdSet.has(playerId))
        .slice(0, tacticalTokens.length)
      const sanitizedStarterSet = new Set(sanitizedHomeStarters)
      const sanitizedHomeSubs = draft.home.subs
        .filter((playerId) => eligiblePlayerIdSet.has(playerId) && !sanitizedStarterSet.has(playerId))
      const updated = await apiPut<MatchDetailsData>(apiRoutes.matches.byId(id), {
        type: match.type,
        plateauId: match.plateauId ?? undefined,
        sides: {
          home: { starters: sanitizedHomeStarters, subs: sanitizedHomeSubs },
          away: {
            starters: draft.away.starters,
            subs: draft.away.subs,
          },
        },
        score: {
          home: playHomeScore,
          away: playAwayScore,
        },
        buteurs: draft.scorers
          .filter((s) => s.side === 'home')
          .map((s) => ({ side: s.side, playerId: s.playerId, assistId: s.assistId })),
        opponentName: match.opponentName ?? '',
        played: true,
        tactic: {
          preset: tacticalPresetValue,
          points: tacticalPoints,
        },
      })
      setMatch(updated)
      setDraft(buildDraft(updated))
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour du match: ${toErrorMessage(err)}`)
      return
    } finally {
      setLiveSaving(false)
    }
    setIsPlayOverlayOpen(false)
  }

  function handleTacticPresetChange(value: string) {
    setTacticalPresetValue(value)
    if (value.startsWith('formation:')) {
      const formationKey = value.replace('formation:', '')
      setTacticalPoints(getFormationPointsMap(tacticalTokens, formationKey, tacticalFormations))
      return
    }
    if (value.startsWith('tactic:')) {
      const tacticName = value.replace('tactic:', '')
      const saved = savedTactics.find((item) => item.name === tacticName)
      if (!saved) return
      setTacticalPoints(buildPointsMap(tacticalTokens, tacticalTokens.map((tokenId) => saved.points[tokenId] || { x: 50, y: 50 })))
    }
  }

  function assignPlayerToSlot(slotId: string, playerId: string) {
    setSlotAssignments((prev) => {
      const next = { ...prev, [slotId]: playerId }
      if (playerId) {
        for (const tokenId of tacticalTokens) {
          if (tokenId !== slotId && next[tokenId] === playerId) {
            next[tokenId] = ''
          }
        }
      }
      if (isPlayOverlayOpen && playPhase === 'running') {
        const previousPlayerId = prev[slotId] || ''
        if (previousPlayerId !== playerId) {
          pushLiveEvent({
            type: 'SUBSTITUTION',
            slotId,
            inPlayerId: playerId || undefined,
            outPlayerId: previousPlayerId || undefined,
          })
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
      for (const tokenId of tacticalTokens) {
        if (next[tokenId] === playerId) {
          if (isPlayOverlayOpen && playPhase === 'running') {
            pushLiveEvent({
              type: 'SUBSTITUTION',
              slotId: tokenId,
              outPlayerId: playerId,
            })
          }
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
      const sanitizedHomeStarters = draft.home.starters
        .filter((playerId) => eligiblePlayerIdSet.has(playerId))
        .slice(0, tacticalTokens.length)
      const sanitizedStarterSet = new Set(sanitizedHomeStarters)
      const sanitizedHomeSubs = draft.home.subs
        .filter((playerId) => eligiblePlayerIdSet.has(playerId) && !sanitizedStarterSet.has(playerId))
      const updated = await apiPut<MatchDetailsData>(apiRoutes.matches.byId(id), {
        type: match.type,
        plateauId: match.plateauId ?? undefined,
        sides: {
          home: {
            starters: sanitizedHomeStarters,
            subs: sanitizedHomeSubs,
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
            .map((s) => ({ side: s.side, playerId: s.playerId, assistId: s.assistId }))
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
      const fallbackFormationKey = defaultFormation?.key || ''
      const updatedPreset = typeof updatedTactic?.preset === 'string' && updatedTactic.preset.trim()
        ? updatedTactic.preset
        : `formation:${fallbackFormationKey}`
      const updatedPoints = updatedTactic?.points && typeof updatedTactic.points === 'object'
        ? buildPointsMap(tacticalTokens, tacticalTokens.map((tokenId) => updatedTactic.points?.[tokenId] || { x: 50, y: 50 }))
        : getFormationPointsMap(tacticalTokens, fallbackFormationKey, tacticalFormations)
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
        {pending && (
          <div className="match-result-row">
            <button type="button" className="edit-primary live-start-btn" onClick={openPlayOverlay}>
              Jouer le match
            </button>
          </div>
        )}
        {matchDate && <p className="match-meta-line">{matchDate}</p>}
      </section>

      <section className="match-content-grid">
        <article className="match-card">
          <h3>Composition</h3>
          <div className="lineup-stack">
            <div className="compo-line-list">
              {displayedHomeStarters.length > 0 ? (
                displayedHomeStarters.map((playerId, index) => {
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
          {displayedHomeSubs.length > 0 && (
            <div className="lineup-stack">
              <p>Remplaçants</p>
              <div className="compo-line-list">
                {displayedHomeSubs.map((playerId, index) => {
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

      {isPlayOverlayOpen && (
        <div className="live-overlay" role="dialog" aria-modal="true" aria-label="Jouer le match">
          <div className="live-overlay-head">
            <h2>Match en direct</h2>
            <button type="button" onClick={() => { void closePlayOverlay() }} disabled={liveSaving}>
              {playPhase === 'ended' ? 'Fermer' : 'Quitter'}
            </button>
          </div>

          {playPhase === 'setup' && (
            <section className="live-setup-card">
              <h3>Préparation</h3>
              <div className="live-duration-picker">
                <span>Durée du match</span>
                <div className="live-duration-controls">
                  <button
                    type="button"
                    onClick={() => setPlayDurationMinutes((prev) => Math.max(1, prev - 1))}
                  >
                    -
                  </button>
                  <strong>{playDurationMinutes} min</strong>
                  <button
                    type="button"
                    onClick={() => setPlayDurationMinutes((prev) => Math.min(60, prev + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="live-tactical-card">
            <div ref={tacticalDragRootRef} className="match-tactical-layout">
              <div className="match-tactical-roster">
                <p>Joueurs (glisser vers un poste)</p>
                <div data-bench-drop="true" className={`match-bench-grid ${dragState ? 'is-drop-active' : ''}`}>
                  {benchPlayers.map((player) => {
                    const avatar = getAvatarUrl(player)
                    return (
                      <button
                        key={`live-bench-${player.id}`}
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

              <div className="match-tactical-pitch" role="group" aria-label="Composition tactique en direct">
                <div className="match-tactical-center-line" />
                <div className="match-tactical-center-circle" />
                {tacticalSlots.map((slot) => {
                  const assignedPlayerId = slotAssignments[slot.id] || ''
                  const assignedPlayer = assignedPlayerId ? playerById.get(assignedPlayerId) : undefined
                  const assignedAvatar = getAvatarUrl(assignedPlayer)
                  const assignedName = assignedPlayer?.name || assignedPlayerId
                  return (
                    <div
                      key={`live-slot-${slot.id}`}
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
          </section>

          {playPhase === 'setup' && (
            <div className="live-action-row">
              <button type="button" className="edit-primary live-cta" onClick={startKickoff}>
                Coup d'envoi
              </button>
            </div>
          )}

          {playPhase === 'running' && (
            <>
              <section className="live-running-card">
                <div className="live-score-line">
                  <strong>{playHomeScore}</strong>
                  <span>-</span>
                  <strong>{playAwayScore}</strong>
                </div>
                <div className="live-clock">{formatClock(playRemainingSeconds)}</div>
                <p className="muted-inline">{liveEvents.length} événement(s)</p>
              </section>
              <div className="live-action-row">
                <button type="button" className="edit-primary live-goal-btn" onClick={openGoalForModal}>
                  But marqué
                </button>
                <button type="button" className="edit-secondary live-goal-btn" onClick={recordGoalAgainst}>
                  But encaissé
                </button>
              </div>
            </>
          )}

          {playPhase === 'ended' && (
            <section className="live-end-card">
              <p className="live-end-result">
                {playHomeScore > playAwayScore ? 'Victoire' : playHomeScore < playAwayScore ? 'Défaite' : 'Match nul'}
              </p>
              <p className="live-end-score">{playHomeScore} - {playAwayScore}</p>
              <p className="muted-inline">{liveEvents.length} événement(s) enregistrés</p>
              <button type="button" className="edit-primary live-cta" onClick={() => { void closePlayOverlay() }} disabled={liveSaving}>
                {liveSaving ? 'Enregistrement...' : 'Retour au match'}
              </button>
            </section>
          )}

          {goalModalOpen && (
            <>
              <div className="modal-overlay" onClick={() => setGoalModalOpen(false)} />
              <div className="live-goal-modal" role="dialog" aria-modal="true" aria-label="Enregistrer but marqué">
                <div className="drill-modal-head">
                  <h3>But marqué ( {liveMinute}' )</h3>
                  <button type="button" onClick={() => setGoalModalOpen(false)}>✕</button>
                </div>
                <div className="lineup-stack">
                  <p>Buteur</p>
                  <select value={goalScorerId} onChange={(event) => setGoalScorerId(event.target.value)}>
                    <option value="">Choisir un joueur</option>
                    {liveAssignedPlayers.map((player) => (
                      <option key={`goal-scorer-${player.id}`} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                </div>
                <div className="lineup-stack">
                  <p>Passeur décisif (optionnel)</p>
                  <select value={goalAssistId} onChange={(event) => setGoalAssistId(event.target.value)}>
                    <option value="">Aucun</option>
                    {liveAssignedPlayers
                      .filter((player) => player.id !== goalScorerId)
                      .map((player) => (
                        <option key={`goal-assist-${player.id}`} value={player.id}>{player.name}</option>
                      ))}
                  </select>
                </div>
                <div className="edit-action-group">
                  <button type="button" className="edit-secondary" onClick={() => setGoalModalOpen(false)}>Annuler</button>
                  <button type="button" className="edit-primary" onClick={confirmGoalFor} disabled={!goalScorerId}>Valider</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

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
                    {tacticalFormations.map((formation) => (
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
                  {displayedHomeStarters.map((playerId, index) => (
                    <li key={`modal-home-starter-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                    </li>
                  ))}
                  {displayedHomeStarters.length === 0 && <li>Aucun joueur</li>}
                </ul>
              </div>

              <div className="lineup-stack">
                <p>Remplaçants automatiques</p>
                <ul>
                  {displayedHomeSubs.map((playerId, index) => (
                    <li key={`modal-home-sub-${playerId}-${index}`}>
                      <span>{playerNameById.get(playerId) || playerId}</span>
                    </li>
                  ))}
                  {displayedHomeSubs.length === 0 && <li>Aucun remplaçant</li>}
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
                      <span>
                        {playerNameById.get(scorer.playerId) || scorer.playerId}
                        {scorer.assistId ? ` (${playerNameById.get(scorer.assistId) || scorer.assistId})` : ''}
                      </span>
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
