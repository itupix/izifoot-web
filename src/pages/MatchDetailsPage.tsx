import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  matches?: MatchLite[]
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

const LIVE_MATCH_STATE_STORAGE_KEY = 'izifoot.liveMatchStateByMatchId'
const PLAYTIME_DOCK_COLLAPSED_STORAGE_KEY = 'izifoot.playtimeDockCollapsed'

const STARTER_LOAD_WEIGHT = 1
const SUB_LOAD_WEIGHT = 0.45

function toDayKey(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function computePlayerDayLoad(otherMatches: MatchLite[], eligiblePlayerIds: Set<string>) {
  const loadByPlayerId = new Map<string, number>()
  for (const playerId of eligiblePlayerIds) {
    loadByPlayerId.set(playerId, 0)
  }

  for (const match of otherMatches) {
    const matchLoad = new Map<string, number>()
    for (const team of match.teams || []) {
      for (const row of team.players || []) {
        const playerId = row.playerId || row.player?.id
        if (!playerId || !eligiblePlayerIds.has(playerId)) continue
        const contribution = row.role === 'sub' ? SUB_LOAD_WEIGHT : STARTER_LOAD_WEIGHT
        const previous = matchLoad.get(playerId) ?? 0
        if (contribution > previous) matchLoad.set(playerId, contribution)
      }
    }
    for (const [playerId, contribution] of matchLoad.entries()) {
      loadByPlayerId.set(playerId, (loadByPlayerId.get(playerId) ?? 0) + contribution)
    }
  }

  return loadByPlayerId
}

function buildBalancedComposition(
  eligiblePlayers: Player[],
  otherMatches: MatchLite[],
  startersTargetCount: number,
  preferredGoalkeeperId?: string,
) {
  const isGoalkeeper = (player: Player | undefined) => (player?.primary_position || '').trim().toUpperCase() === 'GARDIEN'
  const eligibleSet = new Set(eligiblePlayers.map((player) => player.id))
  const loadByPlayerId = computePlayerDayLoad(otherMatches, eligibleSet)
  const ordered = eligiblePlayers
    .slice()
    .sort((a, b) => {
      const aLoad = loadByPlayerId.get(a.id) ?? 0
      const bLoad = loadByPlayerId.get(b.id) ?? 0
      if (aLoad !== bLoad) return aLoad - bLoad
      return a.name.localeCompare(b.name)
    })

  const goalkeeperCandidates = ordered.filter((player) => isGoalkeeper(player))
  const preferredGoalkeeper = preferredGoalkeeperId
    ? eligiblePlayers.find((player) => player.id === preferredGoalkeeperId)
    : undefined
  const selectedGoalkeeper = (
    (preferredGoalkeeper && isGoalkeeper(preferredGoalkeeper) ? preferredGoalkeeper : undefined)
    ?? goalkeeperCandidates[0]
    ?? preferredGoalkeeper
  )

  const startersPool = selectedGoalkeeper
    ? ordered.filter((player) => player.id !== selectedGoalkeeper.id)
    : ordered
  const starters = [
    ...(selectedGoalkeeper ? [selectedGoalkeeper.id] : []),
    ...startersPool.slice(0, Math.max(0, startersTargetCount - (selectedGoalkeeper ? 1 : 0))).map((player) => player.id),
  ].slice(0, startersTargetCount)
  const starterSet = new Set(starters)
  const subs = ordered
    .filter((player) => !starterSet.has(player.id))
    .map((player) => player.id)

  return { starters, subs, goalkeeperId: selectedGoalkeeper?.id }
}

type PersistedLiveMatchState = {
  isOpen: boolean
  phase: 'setup' | 'running' | 'ended'
  durationMinutes: number
  remainingSeconds: number
  homeScore: number
  awayScore: number
  events: LiveMatchEvent[]
  slotAssignments: Record<string, string>
  homeStarters: string[]
  homeSubs: string[]
  scorers: Array<{ playerId: string; side: 'home' | 'away'; assistId?: string }>
  savedAt: number
}

type MatchPageSnapshot = {
  match: MatchDetailsData
  draft: MatchDraft
  players: Player[]
  plateauDateISO: string
  plateauPlayerIds: string[]
  plateauPresentPlayerIds: string[]
  matchesOfDay: MatchLite[]
  tacticalPresetValue: string
  tacticalPoints: Record<string, TacticalPoint>
  clubName: string
}

type PlayerPlaytimeRow = {
  playerId: string
  name: string
  minutes: number
  percent: number
}

function readLiveMatchStateMap() {
  if (typeof window === 'undefined') return {} as Record<string, PersistedLiveMatchState>
  try {
    const raw = window.localStorage.getItem(LIVE_MATCH_STATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, PersistedLiveMatchState>
  } catch {
    return {}
  }
}

function writeLiveMatchStateMap(next: Record<string, PersistedLiveMatchState>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LIVE_MATCH_STATE_STORAGE_KEY, JSON.stringify(next))
}

function getPersistedLiveMatchState(matchId: string): PersistedLiveMatchState | null {
  const current = readLiveMatchStateMap()
  return current[matchId] || null
}

function setPersistedLiveMatchState(matchId: string, value: PersistedLiveMatchState) {
  const current = readLiveMatchStateMap()
  writeLiveMatchStateMap({ ...current, [matchId]: value })
}

function clearPersistedLiveMatchState(matchId: string) {
  const current = readLiveMatchStateMap()
  if (!current[matchId]) return
  const next = { ...current }
  delete next[matchId]
  writeLiveMatchStateMap(next)
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
  const [matchesOfDay, setMatchesOfDay] = useState<MatchLite[]>([])
  const [plateauMatchOrderIds, setPlateauMatchOrderIds] = useState<string[]>([])
  const [clubName, setClubName] = useState<string>('Club')
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauPlayerIds, setPlateauPlayerIds] = useState<string[]>([])
  const [plateauPresentPlayerIds, setPlateauPresentPlayerIds] = useState<string[]>([])
  const [visibleSwipeMatchId, setVisibleSwipeMatchId] = useState<string>('')
  const [isPlaytimeDockCollapsed, setIsPlaytimeDockCollapsed] = useState(false)
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
  const swipeTrackRef = useRef<HTMLDivElement | null>(null)
  const swipeNavigationLockRef = useRef(false)
  const swipeUnlockTimeoutRef = useRef<number | null>(null)
  const swipeScrollRafRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const matchSnapshotCacheRef = useRef<Map<string, MatchPageSnapshot>>(new Map())
  const liveRestoreAttemptedRef = useRef<string | null>(null)
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
  const [isLiveQuitConfirmOpen, setIsLiveQuitConfirmOpen] = useState(false)
  const [autoComposing, setAutoComposing] = useState(false)
  const [autoComposeError, setAutoComposeError] = useState<string | null>(null)
  const [compositionSaving, setCompositionSaving] = useState(false)
  const lastCompositionSignatureRef = useRef<string | null>(null)

  const applySnapshot = useCallback((snapshot: MatchPageSnapshot) => {
    setMatch(snapshot.match)
    setDraft(snapshot.draft)
    setPlayers(snapshot.players)
    setPlateauDateISO(snapshot.plateauDateISO)
    setPlateauPlayerIds(snapshot.plateauPlayerIds)
    setPlateauPresentPlayerIds(snapshot.plateauPresentPlayerIds)
    setMatchesOfDay(snapshot.matchesOfDay)
    setTacticalPresetValue(snapshot.tacticalPresetValue)
    setTacticalPoints(snapshot.tacticalPoints)
    if (snapshot.clubName.trim()) setClubName(snapshot.clubName.trim())
  }, [])

  useLayoutEffect(() => {
    if (!id) return
    setVisibleSwipeMatchId(id)
    const cached = matchSnapshotCacheRef.current.get(id)
    if (!cached) return
    applySnapshot(cached)
  }, [applySnapshot, id])

  const loadMatch = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const cached = matchSnapshotCacheRef.current.get(id)
    if (cached) {
      applySnapshot(cached)
    }
    const [payload, club, roster] = await Promise.all([
      apiGet<MatchDetailsData>(apiRoutes.matches.byId(id)),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<Player[]>(apiRoutes.players.list).catch(() => []),
    ])

    let plateauSummary: PlateauSummaryResponse | null = null
    let nextPlateauDateISO = ''
    let nextPlateauPlayerIds: string[] = []
    let nextPlateauPresentPlayerIds: string[] = []
    let nextPlateauMatchOrderIds: string[] = []
    let matchesById = new Map<string, MatchLite>([[payload.id, payload]])
    let allMatchesOfDay: MatchLite[] = []
    if (payload.plateauId) {
      plateauSummary = await apiGet<PlateauSummaryResponse>(apiRoutes.plateaus.summary(payload.plateauId)).catch(() => null)
      if (plateauSummary?.plateau?.date) nextPlateauDateISO = plateauSummary.plateau.date
      nextPlateauMatchOrderIds = (plateauSummary?.matches || []).map((matchItem) => matchItem.id).filter(Boolean)
      nextPlateauPlayerIds = Array.from(new Set(
        (plateauSummary?.convocations || [])
          .filter((convocation) => {
            const status = convocation.status ?? (convocation.present ? 'present' : 'non_convoque')
            return status === 'present' || status === 'convoque'
          })
          .map((convocation) => convocation.player?.id)
          .filter((playerId): playerId is string => Boolean(playerId)),
      ))
      nextPlateauPresentPlayerIds = Array.from(new Set(
        (plateauSummary?.convocations || [])
          .filter((convocation) => {
            const status = convocation.status ?? (convocation.present ? 'present' : 'non_convoque')
            return status === 'present' || convocation.present === true
          })
          .map((convocation) => convocation.player?.id)
          .filter((playerId): playerId is string => Boolean(playerId)),
      ))
      allMatchesOfDay = plateauSummary?.matches || []
      for (const matchItem of allMatchesOfDay) {
        if (matchItem?.id) matchesById.set(matchItem.id, matchItem)
      }
      const missingIds = nextPlateauMatchOrderIds.filter((matchId) => !matchSnapshotCacheRef.current.has(matchId))
      if (missingIds.length > 0) {
        const detailedMatches = await Promise.all(
          missingIds.map((matchId) => apiGet<MatchDetailsData>(apiRoutes.matches.byId(matchId)).catch(() => null)),
        )
        for (const detailed of detailedMatches) {
          if (detailed?.id) matchesById.set(detailed.id, detailed)
        }
      }
    } else {
      const allMatches = await apiGet<MatchLite[]>(apiRoutes.matches.list).catch(() => [])
      const dayKey = toDayKey(payload.createdAt)
      allMatchesOfDay = allMatches.filter((matchItem) => toDayKey(matchItem.createdAt) === dayKey)
      for (const matchItem of allMatchesOfDay) {
        if (matchItem?.id) matchesById.set(matchItem.id, matchItem)
      }
    }

    if (isCancelled()) return
    const fallbackFormationKey = defaultFormation?.key || ''

    const basePlayersMap = new Map<string, Player>()
    for (const player of roster) basePlayersMap.set(player.id, player)
    for (const convocation of plateauSummary?.convocations || []) {
      if (convocation.player?.id) basePlayersMap.set(convocation.player.id, convocation.player)
    }

    const orderedMatchIds = nextPlateauMatchOrderIds.length > 0
      ? nextPlateauMatchOrderIds
      : [payload.id]
    const orderedMatches = orderedMatchIds
      .map((matchId) => matchesById.get(matchId))
      .filter((matchItem): matchItem is MatchLite => Boolean(matchItem))
    const fallbackMatches = orderedMatches.length > 0 ? orderedMatches : allMatchesOfDay

    for (const orderedMatch of orderedMatches) {
      const detailedMatch = matchesById.get(orderedMatch.id)
      if (!detailedMatch) continue
      const detailsAsMatch = detailedMatch as MatchDetailsData
      const backendTactic = readBackendTactic(detailsAsMatch)
      const nextPreset = typeof backendTactic?.preset === 'string' && backendTactic.preset.trim()
        ? backendTactic.preset
        : `formation:${fallbackFormationKey}`
      const nextPoints = backendTactic?.points && typeof backendTactic.points === 'object'
        ? buildPointsMap(tacticalTokens, tacticalTokens.map((tokenId) => backendTactic.points?.[tokenId] || { x: 50, y: 50 }))
        : getFormationPointsMap(tacticalTokens, fallbackFormationKey, tacticalFormations)

      const playersMap = new Map<string, Player>(basePlayersMap)
      for (const player of Object.values(detailsAsMatch.playersById || {})) {
        if (player?.id) playersMap.set(player.id, player)
      }
      for (const team of detailsAsMatch.teams || []) {
        for (const row of team.players || []) {
          if (row.player?.id) playersMap.set(row.player.id, row.player)
        }
      }

      const snapshot: MatchPageSnapshot = {
        match: detailsAsMatch,
        draft: buildDraft(detailsAsMatch),
        players: Array.from(playersMap.values()),
        plateauDateISO: nextPlateauDateISO,
        plateauPlayerIds: nextPlateauPlayerIds,
        plateauPresentPlayerIds: nextPlateauPresentPlayerIds,
        matchesOfDay: fallbackMatches.filter((matchItem) => matchItem.id !== detailsAsMatch.id),
        tacticalPresetValue: nextPreset,
        tacticalPoints: nextPoints,
        clubName: club?.name?.trim() || clubName,
      }
      matchSnapshotCacheRef.current.set(detailsAsMatch.id, snapshot)
    }

    setPlateauMatchOrderIds(nextPlateauMatchOrderIds)
    const activeSnapshot = matchSnapshotCacheRef.current.get(payload.id)
    if (activeSnapshot) {
      applySnapshot(activeSnapshot)
      return
    }

    const payloadAsMatch = payload as MatchDetailsData
    const backendTactic = readBackendTactic(payloadAsMatch)
    const nextPreset = typeof backendTactic?.preset === 'string' && backendTactic.preset.trim()
      ? backendTactic.preset
      : `formation:${fallbackFormationKey}`
    const nextPoints = backendTactic?.points && typeof backendTactic.points === 'object'
      ? buildPointsMap(tacticalTokens, tacticalTokens.map((tokenId) => backendTactic.points?.[tokenId] || { x: 50, y: 50 }))
      : getFormationPointsMap(tacticalTokens, fallbackFormationKey, tacticalFormations)
    const playersMap = new Map<string, Player>(basePlayersMap)
    for (const player of Object.values(payloadAsMatch.playersById || {})) {
      if (player?.id) playersMap.set(player.id, player)
    }
    for (const team of payloadAsMatch.teams || []) {
      for (const row of team.players || []) {
        if (row.player?.id) playersMap.set(row.player.id, row.player)
      }
    }
    const snapshot: MatchPageSnapshot = {
      match: payloadAsMatch,
      draft: buildDraft(payloadAsMatch),
      players: Array.from(playersMap.values()),
      plateauDateISO: nextPlateauDateISO,
      plateauPlayerIds: nextPlateauPlayerIds,
      plateauPresentPlayerIds: nextPlateauPresentPlayerIds,
      matchesOfDay: fallbackMatches.filter((matchItem) => matchItem.id !== payloadAsMatch.id),
      tacticalPresetValue: nextPreset,
      tacticalPoints: nextPoints,
      clubName: club?.name?.trim() || clubName,
    }
    matchSnapshotCacheRef.current.set(payloadAsMatch.id, snapshot)
    applySnapshot(snapshot)
  }, [applySnapshot, clubName, defaultFormation?.key, id, tacticalFormations, tacticalTokens])

  const { loading, error } = useAsyncLoader(loadMatch)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(PLAYTIME_DOCK_COLLAPSED_STORAGE_KEY)
    setIsPlaytimeDockCollapsed(raw === '1')
  }, [])

  const togglePlaytimeDock = useCallback(() => {
    setIsPlaytimeDockCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PLAYTIME_DOCK_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      }
      return next
    })
  }, [])

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
  const swipeMatchById = useMemo(() => {
    const map = new Map<string, MatchLite>()
    if (match?.id) map.set(match.id, match)
    for (const matchItem of matchesOfDay) {
      if (matchItem?.id) map.set(matchItem.id, matchItem)
    }
    return map
  }, [match, matchesOfDay])
  const swipeMatchIds = useMemo(() => {
    if (!id) return [] as string[]
    if (!match?.plateauId) return [id]
    const ordered = plateauMatchOrderIds.filter((matchId) => swipeMatchById.has(matchId))
    if (!ordered.includes(id)) ordered.push(id)
    return ordered
  }, [id, match?.plateauId, plateauMatchOrderIds, swipeMatchById])
  const isPlateauSwipeEnabled = Boolean(match?.plateauId) && swipeMatchIds.length > 1
  const activeSwipeIndex = useMemo(() => {
    if (!id) return 0
    const index = swipeMatchIds.indexOf(id)
    return index >= 0 ? index : 0
  }, [id, swipeMatchIds])

  useEffect(() => {
    if (!isPlateauSwipeEnabled) return
    const track = swipeTrackRef.current
    if (!track) return
    const width = track.clientWidth
    if (width <= 0) return
    if (swipeUnlockTimeoutRef.current) window.clearTimeout(swipeUnlockTimeoutRef.current)
    swipeNavigationLockRef.current = true
    track.scrollTo({ left: activeSwipeIndex * width, behavior: 'auto' })
    swipeUnlockTimeoutRef.current = window.setTimeout(() => {
      swipeNavigationLockRef.current = false
      swipeUnlockTimeoutRef.current = null
    }, 120)
  }, [activeSwipeIndex, isPlateauSwipeEnabled, swipeMatchIds.length])

  useEffect(() => () => {
    if (swipeUnlockTimeoutRef.current) window.clearTimeout(swipeUnlockTimeoutRef.current)
    if (swipeScrollRafRef.current) window.cancelAnimationFrame(swipeScrollRafRef.current)
  }, [])

  const handleSwipeTrackScroll = useCallback(() => {
    if (!isPlateauSwipeEnabled) return
    const track = swipeTrackRef.current
    if (!track || swipeNavigationLockRef.current) return
    if (swipeScrollRafRef.current) window.cancelAnimationFrame(swipeScrollRafRef.current)
    swipeScrollRafRef.current = window.requestAnimationFrame(() => {
      swipeScrollRafRef.current = null
      const width = track.clientWidth
      if (!width) return
      const nextIndex = Math.max(0, Math.min(swipeMatchIds.length - 1, Math.round(track.scrollLeft / width)))
      const nextMatchId = swipeMatchIds[nextIndex]
      if (!nextMatchId || nextMatchId === id) return
      setVisibleSwipeMatchId(nextMatchId)
      const cachedNext = matchSnapshotCacheRef.current.get(nextMatchId)
      if (cachedNext) applySnapshot(cachedNext)
      navigate(`/match/${nextMatchId}`, { replace: true })
    })
  }, [applySnapshot, id, isPlateauSwipeEnabled, navigate, swipeMatchIds])

  const tacticalSlots = useMemo(() => {
    const counters: Record<string, number> = {}
    return tacticalTokens.map((tokenId) => {
      const point = tacticalPoints[tokenId] || { x: 50, y: 50 }
      const role = getRole(point)
      counters[role] = (counters[role] || 0) + 1
      const roleIndex = counters[role]
      return {
        id: tokenId,
        role,
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
  const liveEventsChrono = useMemo(() => liveEvents.slice().sort((a, b) => a.minute - b.minute), [liveEvents])
  const compositionSaveSnapshot = useMemo(() => {
    if (!draft) return null
    const sanitizedHomeStarters = draft.home.starters
      .filter((playerId) => eligiblePlayerIdSet.has(playerId))
      .slice(0, tacticalTokens.length)
    const sanitizedStarterSet = new Set(sanitizedHomeStarters)
    const sanitizedHomeSubs = draft.home.subs
      .filter((playerId) => eligiblePlayerIdSet.has(playerId) && !sanitizedStarterSet.has(playerId))
    const signature = JSON.stringify({
      home: {
        starters: sanitizedHomeStarters,
        subs: sanitizedHomeSubs,
      },
      tactic: {
        preset: tacticalPresetValue,
        points: tacticalPoints,
      },
    })
    return {
      signature,
      homeStarters: sanitizedHomeStarters,
      homeSubs: sanitizedHomeSubs,
      awayStarters: draft.away.starters,
      awaySubs: draft.away.subs,
      scorers: draft.scorers,
    }
  }, [draft, eligiblePlayerIdSet, tacticalTokens.length, tacticalPresetValue, tacticalPoints])

  useEffect(() => {
    if (!id || !match || !draft) return
    if (liveRestoreAttemptedRef.current === id) return
    liveRestoreAttemptedRef.current = id
    const persisted = getPersistedLiveMatchState(id)
    if (!persisted?.isOpen) return

    const elapsedSeconds = persisted.phase === 'running'
      ? Math.max(0, Math.floor((Date.now() - (persisted.savedAt || Date.now())) / 1000))
      : 0
    const restoredRemaining = persisted.phase === 'running'
      ? Math.max(0, persisted.remainingSeconds - elapsedSeconds)
      : persisted.remainingSeconds
    const restoredPhase: 'setup' | 'running' | 'ended' =
      persisted.phase === 'running' && restoredRemaining <= 0
        ? 'ended'
        : persisted.phase

    const availableSet = new Set(compositionPlayerIds)
    const starters = Array.from(new Set(
      tacticalTokens
        .map((tokenId) => persisted.slotAssignments?.[tokenId])
        .filter((playerId): playerId is string => Boolean(playerId) && availableSet.has(playerId)),
    )).slice(0, tacticalTokens.length)
    const starterSet = new Set(starters)
    const subs = compositionPlayerIds.filter((playerId) => !starterSet.has(playerId))

    setDraft((prev) => ({
      home: { starters, subs },
      away: prev?.away ?? draft.away,
      scorers: Array.isArray(persisted.scorers) ? persisted.scorers : (prev?.scorers ?? []),
    }))
    setSlotAssignments(persisted.slotAssignments || {})
    setPlayDurationMinutes(Math.max(1, persisted.durationMinutes || 10))
    setPlayRemainingSeconds(restoredRemaining)
    setPlayHomeScore(Math.max(0, persisted.homeScore || 0))
    setPlayAwayScore(Math.max(0, persisted.awayScore || 0))
    setLiveEvents(Array.isArray(persisted.events) ? persisted.events : [])
    setPlayPhase(restoredPhase)
    setGoalScorerId('')
    setGoalAssistId('')
    setGoalModalOpen(false)
    setIsLiveQuitConfirmOpen(false)
    setIsPlayOverlayOpen(true)
  }, [compositionPlayerIds, draft, id, match, tacticalTokens])

  useEffect(() => {
    if (!id || !draft || !isPlayOverlayOpen) return
    setPersistedLiveMatchState(id, {
      isOpen: true,
      phase: playPhase,
      durationMinutes: playDurationMinutes,
      remainingSeconds: playRemainingSeconds,
      homeScore: playHomeScore,
      awayScore: playAwayScore,
      events: liveEvents,
      slotAssignments,
      homeStarters: draft.home.starters,
      homeSubs: draft.home.subs,
      scorers: draft.scorers,
      savedAt: Date.now(),
    })
  }, [
    draft,
    id,
    isPlayOverlayOpen,
    liveEvents,
    playAwayScore,
    playDurationMinutes,
    playHomeScore,
    playPhase,
    playRemainingSeconds,
    slotAssignments,
  ])

  useEffect(() => {
    setSlotAssignments((prev) => {
      const next: Record<string, string> = {}
      tacticalTokens.forEach((tokenId, index) => {
        next[tokenId] = displayedHomeStarters[index] || ''
      })
      const changed = tacticalTokens.some((tokenId) => (prev[tokenId] || '') !== (next[tokenId] || ''))
      if (!changed && Object.keys(prev).length === tacticalTokens.length) return prev
      return next
    })
  }, [displayedHomeStarters, tacticalTokens])

  useEffect(() => {
    if (!match || !id || !compositionSaveSnapshot) return
    if (lastCompositionSignatureRef.current === null) {
      lastCompositionSignatureRef.current = compositionSaveSnapshot.signature
      return
    }
    if (compositionSaveSnapshot.signature === lastCompositionSignatureRef.current) return

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setCompositionSaving(true)
        try {
          const updated = await apiPut<MatchDetailsData>(apiRoutes.matches.byId(id), {
            type: match.type,
            plateauId: match.plateauId ?? undefined,
            sides: {
              home: {
                starters: compositionSaveSnapshot.homeStarters,
                subs: compositionSaveSnapshot.homeSubs,
              },
              away: {
                starters: compositionSaveSnapshot.awayStarters,
                subs: compositionSaveSnapshot.awaySubs,
              },
            },
            score: {
              home: homeScore,
              away: awayScore,
            },
            buteurs: compositionSaveSnapshot.scorers
              .filter((s) => s.side === 'home')
              .map((s) => ({ side: s.side, playerId: s.playerId, assistId: s.assistId })),
            opponentName: match.opponentName ?? '',
            played: typeof match.played === 'boolean' ? match.played : !pending,
            tactic: {
              preset: tacticalPresetValue,
              points: tacticalPoints,
            },
          })
          setMatch(updated)
          setDraft(buildDraft(updated))
          lastCompositionSignatureRef.current = compositionSaveSnapshot.signature
        } catch (err: unknown) {
          uiAlert(`Erreur enregistrement composition: ${toErrorMessage(err)}`)
        } finally {
          setCompositionSaving(false)
        }
      })()
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [compositionSaveSnapshot, homeScore, awayScore, id, match, pending, tacticalPoints, tacticalPresetValue])

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
      setDraft({
        ...nextDraft,
        home: {
          starters: nextDraft.home.starters,
          subs: nextDraft.home.subs,
        },
      })
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
    setIsLiveQuitConfirmOpen(false)
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

  async function closePlayOverlay(options?: { markAsPlayed?: boolean }) {
    const markAsPlayed = options?.markAsPlayed === true
    if (!match || !id || !draft) {
      setIsLiveQuitConfirmOpen(false)
      setIsPlayOverlayOpen(false)
      return
    }
    if (!markAsPlayed) {
      setIsLiveQuitConfirmOpen(false)
      setIsPlayOverlayOpen(false)
      clearPersistedLiveMatchState(id)
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
    setIsLiveQuitConfirmOpen(false)
    setIsPlayOverlayOpen(false)
    clearPersistedLiveMatchState(id)
  }

  function handleLiveCloseAction() {
    if (liveSaving) return
    if (playPhase === 'ended') {
      void closePlayOverlay({ markAsPlayed: true })
      return
    }
    if (playPhase === 'setup') {
      void closePlayOverlay()
      return
    }
    setIsLiveQuitConfirmOpen(true)
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
      const sourceSlotId = tacticalTokens.find((tokenId) => prev[tokenId] === playerId)
      const targetPreviousPlayerId = prev[slotId] || ''

      // Drag d'un joueur deja place vers un slot occupe: on fait un swap.
      if (sourceSlotId && sourceSlotId !== slotId && targetPreviousPlayerId && targetPreviousPlayerId !== playerId) {
        next[sourceSlotId] = targetPreviousPlayerId
      }

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

  async function autoCompose() {
    if (!match || compositionPlayers.length === 0) return
    setAutoComposeError(null)
    setAutoComposing(true)
    try {
      let otherMatches = matchesOfDay
      if (match.plateauId) {
        const summary = await apiGet<PlateauSummaryResponse>(apiRoutes.plateaus.summary(match.plateauId)).catch(() => null)
        if (summary?.matches) {
          otherMatches = summary.matches.filter((matchItem) => matchItem.id !== match.id)
        }
      } else {
        const allMatches = await apiGet<MatchLite[]>(apiRoutes.matches.list).catch(() => [])
        const dayKey = toDayKey(match.createdAt)
        otherMatches = allMatches.filter((matchItem) => matchItem.id !== match.id && toDayKey(matchItem.createdAt) === dayKey)
      }

      const currentDraft = draft ?? buildDraft(match)
      const isGoalkeeperId = (playerId: string) => (playerById.get(playerId)?.primary_position || '').trim().toUpperCase() === 'GARDIEN'
      const preferredGoalkeeperId = currentDraft.home.starters.find((playerId) => isGoalkeeperId(playerId))
      const nextHome = buildBalancedComposition(compositionPlayers, otherMatches, tacticalTokens.length, preferredGoalkeeperId)
      const nextAssignments: Record<string, string> = {}
      for (const tokenId of tacticalTokens) nextAssignments[tokenId] = ''
      const remainingStarters = nextHome.starters.slice()
      const goalkeeperSlot = tacticalSlots.find((slot) => slot.role === 'GARDIEN')
      if (goalkeeperSlot && nextHome.goalkeeperId) {
        nextAssignments[goalkeeperSlot.id] = nextHome.goalkeeperId
      }
      const remainingAfterGoalkeeper = remainingStarters.filter((playerId) => playerId !== nextHome.goalkeeperId)
      let remainingIndex = 0
      tacticalTokens.forEach((tokenId) => {
        if (nextAssignments[tokenId]) return
        nextAssignments[tokenId] = remainingAfterGoalkeeper[remainingIndex] || ''
        remainingIndex += 1
      })
      setSlotAssignments(nextAssignments)
      rebuildHomeCompositionFromAssignments(nextAssignments, compositionPlayerIds)
      setMatchesOfDay(otherMatches)
    } catch (err: unknown) {
      setAutoComposeError(`Erreur composition auto: ${toErrorMessage(err)}`)
    } finally {
      setAutoComposing(false)
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

  function renderLoadedSwipeSlide(matchId: string) {
    const snapshot = matchSnapshotCacheRef.current.get(matchId)
    if (!snapshot) {
      return <div className="match-swipe-loading-hint">Chargement du match…</div>
    }

    const previewMatch = snapshot.match
    const previewHome = getTeam(previewMatch, 'home')
    const previewAway = getTeam(previewMatch, 'away')
    const previewPending = isMatchNotPlayed(previewMatch, { referenceDate: snapshot.plateauDateISO || null })
    const previewHomeScore = previewHome?.score ?? 0
    const previewAwayScore = previewAway?.score ?? 0
    const previewOpponent = previewMatch.opponentName || 'Adversaire'
    const previewDateSource = snapshot.plateauDateISO || previewMatch.createdAt
    const previewDateLabel = previewDateSource
      ? new Date(previewDateSource).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      : ''
    const previewPlayerById = new Map(snapshot.players.map((player) => [player.id, player] as const))
    const previewNameById = new Map(snapshot.players.map((player) => [player.id, player.name] as const))
    const previewAllowedSet = new Set(
      snapshot.plateauPlayerIds.length > 0 ? snapshot.plateauPlayerIds : snapshot.players.map((player) => player.id),
    )
    const previewStarters = snapshot.draft.home.starters
      .filter((playerId) => previewAllowedSet.has(playerId))
      .slice(0, tacticalTokens.length)
    const previewStarterSet = new Set(previewStarters)
    const previewBenchPlayers = snapshot.players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((player) => previewAllowedSet.has(player.id) && !previewStarterSet.has(player.id))
    const previewScorers = snapshot.draft.scorers
      .filter((scorer) => scorer.side === 'home')
      .map((scorer) => {
        const scorerName = previewNameById.get(scorer.playerId) || scorer.playerId
        if (!scorer.assistId) return scorerName
        const assistName = previewNameById.get(scorer.assistId) || scorer.assistId
        return `${scorerName} (${assistName})`
      })
    const previewTacticalSlots = (() => {
      const counters: Record<string, number> = {}
      return tacticalTokens.map((tokenId) => {
        const point = snapshot.tacticalPoints[tokenId] || { x: 50, y: 50 }
        const role = getRole(point)
        counters[role] = (counters[role] || 0) + 1
        const roleIndex = counters[role]
        return {
          id: tokenId,
          role,
          point,
          label: role === 'GARDIEN' ? roleLabel(role) : `${roleLabel(role)} ${roleIndex}`,
        }
      })
    })()

    return (
      <div
        role="button"
        tabIndex={0}
        className="match-swipe-preview-full"
        onClick={() => {
          setVisibleSwipeMatchId(matchId)
          applySnapshot(snapshot)
          navigate(`/match/${matchId}`, { replace: true })
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setVisibleSwipeMatchId(matchId)
          applySnapshot(snapshot)
          navigate(`/match/${matchId}`, { replace: true })
        }}
      >
        <div className="match-swipe-slide-layout">
        <header className="match-details-topbar match-swipe-preview-topbar" aria-hidden="true">
          <span className="back-link-button match-swipe-preview-nav-item">
            <ChevronLeftIcon size={18} />
            <span>Retour</span>
          </span>
          <div className="topbar-menu-wrap">
            <RoundIconButton ariaLabel="Menu" className="menu-dots-button match-swipe-preview-nav-item">
              <DotsHorizontalIcon size={18} />
            </RoundIconButton>
          </div>
        </header>

        <div className="match-hero">
          <div className="match-hero-row">
            <div className="match-team-block is-home">
              <div className="match-team-content">
                <div className="team-name">{clubName}</div>
              </div>
            </div>
            <div className="match-scoreboard">
              <div className="score-line">
                {previewPending ? (
                  <span>vs</span>
                ) : (
                  <>
                    <span>{previewHomeScore}</span>
                    <span>-</span>
                    <span>{previewAwayScore}</span>
                  </>
                )}
              </div>
            </div>
            <div className="match-team-block is-away">
              <div className="match-team-content">
                <div className="team-name">{previewOpponent}</div>
              </div>
            </div>
          </div>
          <div className="hero-scorers-row">
            <div className="hero-scorers-col">
              {previewScorers.map((name, idx) => (
                <div className="hero-scorer-line" key={`hero-preview-scorer-${idx}-${name}`}>
                  <span className="hero-scorer-ball" aria-hidden="true">⚽</span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <div />
            <div className="hero-scorers-col" />
          </div>
          <div className="match-result-row">
            <div className={`result-pill ${previewPending ? 'pending' : previewHomeScore > previewAwayScore ? 'win' : previewHomeScore < previewAwayScore ? 'loss' : 'draw'}`}>
              {previewPending ? 'Pas encore joué' : previewHomeScore > previewAwayScore ? 'Victoire' : previewHomeScore < previewAwayScore ? 'Défaite' : 'Nul'}
            </div>
          </div>
          {previewPending && (
            <div className="match-result-row">
              <button
                type="button"
                className="edit-primary live-start-btn"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setVisibleSwipeMatchId(matchId)
                  applySnapshot(snapshot)
                  navigate(`/match/${matchId}`, { replace: true })
                }}
              >
                Jouer le match
              </button>
            </div>
          )}
          {previewDateLabel && <p className="match-meta-line">{previewDateLabel}</p>}
        </div>

        <section className="match-content-grid">
          <article className="match-card">
            <div className="match-details-topbar">
              <h3>Composition</h3>
              <button
                type="button"
                className="edit-secondary"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setVisibleSwipeMatchId(matchId)
                  applySnapshot(snapshot)
                  navigate(`/match/${matchId}`, { replace: true })
                }}
              >
                Auto
              </button>
            </div>
            <div className="lineup-stack">
              <div className="match-tactical-head">
                <label htmlFor={`match-tactic-select-preview-${matchId}`}>Tactique</label>
                <select
                  id={`match-tactic-select-preview-${matchId}`}
                  value={snapshot.tacticalPresetValue}
                  disabled
                >
                  <optgroup label="Formations">
                    {tacticalFormations.map((formation) => (
                      <option key={`preview-formation-${matchId}-${formation.key}`} value={`formation:${formation.key}`}>
                        {formation.label}
                      </option>
                    ))}
                  </optgroup>
                  {savedTactics.length > 0 && (
                    <optgroup label="Tactiques sauvegardées">
                      {savedTactics.map((saved) => (
                        <option key={`preview-saved-${matchId}-${saved.name}`} value={`tactic:${saved.name}`}>
                          {saved.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="match-tactical-layout">
                <div className="match-tactical-roster">
                  <p>Remplaçants</p>
                  <div className="match-bench-grid">
                    {previewBenchPlayers.map((player) => {
                      const avatar = getAvatarUrl(player)
                      return (
                        <div
                          key={`preview-bench-${matchId}-${player.id}`}
                          className="match-player-avatar-token is-static"
                          title={player.name}
                        >
                          {avatar ? (
                            <img src={avatar} alt={player.name} />
                          ) : (
                            <span style={{ background: colorFromName(player.name) }}>{getInitials(player.name)}</span>
                          )}
                        </div>
                      )
                    })}
                    {previewBenchPlayers.length === 0 && <p className="muted-inline">Tous les joueurs sont placés.</p>}
                  </div>
                </div>

                <div className="match-tactical-pitch match-tactical-pitch--compact" role="img" aria-label="Composition tactique du match voisin">
                  <div className="match-tactical-center-line" />
                  <div className="match-tactical-center-circle" />
                  {previewTacticalSlots.map((slot, index) => {
                    const assignedPlayerId = previewStarters[index] || ''
                    const assignedPlayer = assignedPlayerId ? previewPlayerById.get(assignedPlayerId) : undefined
                    const assignedAvatar = getAvatarUrl(assignedPlayer)
                    const assignedName = assignedPlayer?.name || assignedPlayerId
                    return (
                      <div
                        key={`preview-slot-${matchId}-${slot.id}`}
                        className={`match-tactical-slot ${assignedPlayerId ? 'is-filled' : ''}`}
                        style={{
                          left: `calc(${slot.point.x}% - 40px)`,
                          top: `calc(${slot.point.y}% - 40px)`,
                        }}
                      >
                        <span>{slot.label}</span>
                        <div className="match-tactical-slot-token">
                          {assignedPlayerId ? (
                            <div className="match-player-avatar-token is-static" title={assignedName}>
                              {assignedAvatar ? (
                                <img src={assignedAvatar} alt={assignedName} />
                              ) : (
                                <span style={{ background: colorFromName(assignedName) }}>{getInitials(assignedName)}</span>
                              )}
                            </div>
                          ) : (
                            <span className="match-slot-placeholder">Drop</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </article>
        </section>
        </div>
      </div>
    )
  }

  if (loading && !match) return <div style={{ padding: 20 }}>Chargement…</div>
  if (error) return <div style={{ padding: 20, color: '#b91c1c' }}>Erreur: {toErrorMessage(error)}</div>
  if (!match) return <div style={{ padding: 20 }}>Match introuvable.</div>
  const activeViewMatchId = visibleSwipeMatchId || id || ''
  const isCurrentMatchReady = Boolean(activeViewMatchId && match.id === activeViewMatchId)
  const hasRouteSnapshotCached = Boolean(activeViewMatchId && matchSnapshotCacheRef.current.has(activeViewMatchId))
  const canRenderCurrentRoute = isCurrentMatchReady || hasRouteSnapshotCached
  const isPageBusy = loading || compositionSaving || saving || liveSaving || autoComposing
  if (!canRenderCurrentRoute && !isPlateauSwipeEnabled) return <div style={{ padding: 20 }}>Chargement…</div>

  const playtimeRows = (() => {
    if (!match?.plateauId) return [] as PlayerPlaytimeRow[]

    const persistedByMatchId = readLiveMatchStateMap()
    const totalMinutesByPlayerId = new Map<string, number>()
    const playerNameByPlayerId = new Map<string, string>()

    const activeMatchSnapshot: MatchPageSnapshot = {
      match,
      draft: draft ?? buildDraft(match),
      players,
      plateauDateISO,
      plateauPlayerIds,
      plateauPresentPlayerIds,
      matchesOfDay,
      tacticalPresetValue,
      tacticalPoints,
      clubName,
    }

    const relevantMatchIds = plateauMatchOrderIds.length > 0 ? plateauMatchOrderIds : (swipeMatchIds.length > 0 ? swipeMatchIds : [match.id])
    let plateauTotalMinutes = 0
    const presentPlayerSet = new Set<string>(plateauPresentPlayerIds)

    for (const relevantMatchId of relevantMatchIds) {
      const snapshot = relevantMatchId === match.id
        ? activeMatchSnapshot
        : matchSnapshotCacheRef.current.get(relevantMatchId)
      if (!snapshot) continue

      for (const player of snapshot.players) {
        if (player?.id && presentPlayerSet.has(player.id)) {
          playerNameByPlayerId.set(player.id, player.name)
        }
      }

      const pendingMatch = isMatchNotPlayed(snapshot.match, { referenceDate: snapshot.plateauDateISO || plateauDateISO || null })
      const isCurrentMatchScope = relevantMatchId === match.id
      if (pendingMatch && !isCurrentMatchScope) continue

      const persisted = persistedByMatchId[relevantMatchId]
      const currentDurationMinutes = isCurrentMatchScope
        ? Math.max(1, isPlayOverlayOpen ? playDurationMinutes : (persisted?.durationMinutes || 10))
        : Math.max(1, persisted?.durationMinutes || 10)
      const durationMinutes = currentDurationMinutes
      plateauTotalMinutes += durationMinutes

      const eligibleSet = new Set(
        snapshot.plateauPresentPlayerIds.length > 0
          ? snapshot.plateauPresentPlayerIds
          : Array.from(presentPlayerSet),
      )
      const starters = snapshot.draft.home.starters
        .filter((playerId) => eligibleSet.has(playerId))
        .slice(0, tacticalTokens.length)
      const onField = new Set(starters)
      const substitutions = (persisted?.events || [])
        .filter((event) => event.type === 'SUBSTITUTION')
        .slice()
        .sort((a, b) => a.minute - b.minute)
      const effectiveSubstitutions = (isCurrentMatchScope && isPlayOverlayOpen ? liveEvents : substitutions)
        .filter((event) => event.type === 'SUBSTITUTION')
        .slice()
        .sort((a, b) => a.minute - b.minute)

      for (const starterId of starters) {
        totalMinutesByPlayerId.set(starterId, (totalMinutesByPlayerId.get(starterId) || 0) + durationMinutes)
      }

      for (const event of effectiveSubstitutions) {
        const clampedMinute = Math.max(0, Math.min(durationMinutes, event.minute))
        const progress = Math.max(0, Math.min(1, clampedMinute / durationMinutes))
        const remainingMinutes = (1 - progress) * durationMinutes
        if (remainingMinutes <= 0) continue

        if (event.outPlayerId && onField.has(event.outPlayerId)) {
          const previous = totalMinutesByPlayerId.get(event.outPlayerId) || 0
          totalMinutesByPlayerId.set(event.outPlayerId, Math.max(0, previous - remainingMinutes))
          onField.delete(event.outPlayerId)
        }
        if (event.inPlayerId && !onField.has(event.inPlayerId)) {
          totalMinutesByPlayerId.set(event.inPlayerId, (totalMinutesByPlayerId.get(event.inPlayerId) || 0) + remainingMinutes)
          onField.add(event.inPlayerId)
        }
      }
    }

    for (const presentPlayerId of presentPlayerSet) {
      if (!totalMinutesByPlayerId.has(presentPlayerId)) totalMinutesByPlayerId.set(presentPlayerId, 0)
    }

    const denominator = plateauTotalMinutes > 0 ? plateauTotalMinutes : 1
    return Array.from(totalMinutesByPlayerId.entries())
      .map(([playerId, minutes]) => ({
        playerId,
        name: playerNameByPlayerId.get(playerId) || playerId,
        minutes,
        percent: Math.max(0, Math.min(100, (minutes / denominator) * 100)),
      }))
      .sort((a, b) => {
        if (b.minutes !== a.minutes) return b.minutes - a.minutes
        return a.name.localeCompare(b.name)
      })
  })()
  const showPlaytimeDock = Boolean(match?.plateauId)

  const activeMatchView = (
    <>
      <header className="match-details-topbar">
        <button type="button" className="back-link-button" onClick={() => navigate(-1)}>
          <ChevronLeftIcon size={18} />
          <span>Retour</span>
        </button>
        <div className="topbar-menu-wrap">
          {isPageBusy && (
            <span
              className="match-inline-spinner"
              aria-hidden="true"
            />
          )}
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
          <div className="match-details-topbar">
            <h3>Composition</h3>
            <button type="button" className="edit-secondary" onClick={() => { void autoCompose() }} disabled={autoComposing || compositionPlayers.length === 0}>
              {autoComposing ? '...' : 'Auto'}
            </button>
          </div>
          <div className="lineup-stack">
            <div className="match-tactical-head">
              <label htmlFor="match-tactic-select-inline">Tactique</label>
              <select
                id="match-tactic-select-inline"
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
                <p>Remplaçants</p>
                <div
                  data-bench-drop="true"
                  className={`match-bench-grid ${dragState ? 'is-drop-active' : ''}`}
                >
                  {benchPlayers.map((player) => {
                    const avatar = getAvatarUrl(player)
                    return (
                      <button
                        key={`page-bench-${player.id}`}
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
                      key={`page-slot-${slot.id}`}
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

          </div>
        </article>
      </section>

      {showPlaytimeDock && (
        <aside className={`match-playtime-dock ${isPlaytimeDockCollapsed ? 'is-collapsed' : ''}`} aria-label="Temps de jeu des joueurs du plateau">
          <div className="match-playtime-dock-head">
            <strong>Temps de jeu plateau</strong>
            <button type="button" className="match-playtime-toggle" onClick={togglePlaytimeDock}>
              {isPlaytimeDockCollapsed ? 'Ouvrir' : 'Reduire'}
            </button>
          </div>
          {!isPlaytimeDockCollapsed && (
            <div className="match-playtime-dock-list">
            {playtimeRows.map((row) => (
              <div key={`playtime-${row.playerId}`} className="match-playtime-row">
                <div className="match-playtime-row-head">
                  <span>{row.name}</span>
                  <span>{Math.round(row.minutes)} min</span>
                </div>
                <div className="match-playtime-bar-track" role="presentation">
                  <div className="match-playtime-bar-fill" style={{ width: `${row.percent}%` }} />
                </div>
              </div>
            ))}
            {playtimeRows.length === 0 && (
              <p className="muted-inline">Aucun temps de jeu enregistré pour le moment.</p>
            )}
            </div>
          )}
        </aside>
      )}

      {isPlayOverlayOpen && (
        <div className="live-overlay" role="dialog" aria-modal="true" aria-label="Jouer le match">
          <div className="live-overlay-head">
            <h2>Match en direct</h2>
            <button type="button" onClick={handleLiveCloseAction} disabled={liveSaving}>
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

          {(playPhase === 'running' || playPhase === 'ended') && (
            <section className="live-events-card">
              <h3>Événements</h3>
              {liveEventsChrono.length === 0 ? (
                <p className="muted-inline">Aucun événement pour le moment.</p>
              ) : (
                <ul className="live-events-list">
                  {liveEventsChrono.map((event) => {
                    if (event.type === 'SUBSTITUTION') {
                      const outName = event.outPlayerId ? (playerNameById.get(event.outPlayerId) || event.outPlayerId) : ''
                      const inName = event.inPlayerId ? (playerNameById.get(event.inPlayerId) || event.inPlayerId) : ''
                      return (
                        <li key={event.id} className="live-event-item">
                          <span className="live-event-minute">{event.minute}'</span>
                          <div className="live-event-content">
                            <strong>Changement</strong>
                            <div className="live-sub-row">
                              <span className="live-event-arrow is-out" aria-hidden="true">▼</span>
                              <span>{outName || 'Aucun sortant'}</span>
                            </div>
                            <div className="live-sub-row">
                              <span className="live-event-arrow is-in" aria-hidden="true">▲</span>
                              <span>{inName || 'Aucun entrant'}</span>
                            </div>
                          </div>
                        </li>
                      )
                    }

                    if (event.type === 'GOAL_FOR') {
                      const scorerName = event.scorerId ? (playerNameById.get(event.scorerId) || event.scorerId) : 'Nous'
                      const assistName = event.assistId ? (playerNameById.get(event.assistId) || event.assistId) : ''
                      return (
                        <li key={event.id} className="live-event-item">
                          <span className="live-event-minute">{event.minute}'</span>
                          <div className="live-event-content">
                            <strong>⚽ But marqué</strong>
                            <span>{assistName ? `${scorerName} (${assistName})` : scorerName}</span>
                          </div>
                        </li>
                      )
                    }

                    return (
                      <li key={event.id} className="live-event-item">
                        <span className="live-event-minute">{event.minute}'</span>
                        <div className="live-event-content">
                          <strong>But encaissé</strong>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="live-tactical-card">
            <div ref={tacticalDragRootRef} className="match-tactical-layout">
              <div className="match-tactical-roster">
                <p>Remplaçants</p>
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

          {playPhase === 'ended' && (
            <section className="live-end-card">
              <p className="live-end-result">
                {playHomeScore > playAwayScore ? 'Victoire' : playHomeScore < playAwayScore ? 'Défaite' : 'Match nul'}
              </p>
              <p className="live-end-score">{playHomeScore} - {playAwayScore}</p>
              <button type="button" className="edit-primary live-cta" onClick={() => { void closePlayOverlay({ markAsPlayed: true }) }} disabled={liveSaving}>
                Retour au match
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

          {isLiveQuitConfirmOpen && (
            <>
              <div className="modal-overlay" onClick={() => setIsLiveQuitConfirmOpen(false)} />
              <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Confirmer la sortie du match live">
                <div className="drill-modal-head">
                  <h3>Quitter le match ?</h3>
                  <button type="button" onClick={() => setIsLiveQuitConfirmOpen(false)} disabled={liveSaving}>✕</button>
                </div>
                <p className="muted-line">Si vous confirmez, le match sera considéré comme joué et enregistré.</p>
                <div className="edit-action-group">
                  <button type="button" className="edit-secondary" onClick={() => setIsLiveQuitConfirmOpen(false)} disabled={liveSaving}>Annuler</button>
                  <button type="button" className="edit-primary" onClick={() => { void closePlayOverlay({ markAsPlayed: true }) }} disabled={liveSaving}>
                    Confirmer
                  </button>
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
                Enregistrer
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

      {autoComposeError && (
        <>
          <div className="modal-overlay" onClick={() => setAutoComposeError(null)} />
          <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Erreur composition auto">
            <div className="drill-modal-head">
              <h3>Erreur</h3>
              <button type="button" onClick={() => setAutoComposeError(null)}>✕</button>
            </div>
            <p className="muted-line">{autoComposeError}</p>
            <div className="edit-action-group">
              <button type="button" className="edit-primary" onClick={() => setAutoComposeError(null)}>Fermer</button>
            </div>
          </div>
        </>
      )}
    </>
  )

  if (isPlateauSwipeEnabled) {
    return (
      <div className={`match-details-page match-details-page--swipe ${showPlaytimeDock ? (isPlaytimeDockCollapsed ? 'has-playtime-dock-collapsed' : 'has-playtime-dock') : ''}`}>
        <div
          ref={swipeTrackRef}
          className="match-swipe-track"
          onScroll={handleSwipeTrackScroll}
          aria-label="Navigation entre les matchs du plateau"
        >
          {swipeMatchIds.map((matchId) => {
            const isActiveSlide = matchId === activeViewMatchId
            return (
              <section key={matchId} className="match-swipe-slide" data-match-id={matchId} aria-current={isActiveSlide ? 'page' : undefined}>
                {isActiveSlide ? (
                  canRenderCurrentRoute
                    ? <div className="match-swipe-slide-layout">{activeMatchView}</div>
                    : (
                      <div className="match-swipe-slide-layout">
                        <header className="match-details-topbar">
                          <button type="button" className="back-link-button" disabled>
                            <ChevronLeftIcon size={18} />
                            <span>Retour</span>
                          </button>
                          <div className="topbar-menu-wrap">
                            <span className="match-inline-spinner" aria-hidden="true" />
                            <RoundIconButton ariaLabel="Menu" className="menu-dots-button" disabled>
                              <DotsHorizontalIcon size={18} />
                            </RoundIconButton>
                          </div>
                        </header>
                      </div>
                    )
                ) : (
                  renderLoadedSwipeSlide(matchId)
                )}
              </section>
            )
          })}
        </div>
      </div>
    )
  }

  return <div className={`match-details-page ${showPlaytimeDock ? (isPlaytimeDockCollapsed ? 'has-playtime-dock-collapsed' : 'has-playtime-dock') : ''}`}>{activeMatchView}</div>
}
