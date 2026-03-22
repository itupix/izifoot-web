import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, type Planning } from '../api'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import type { PlanningData } from '../components/PlanningEditor'
import { PlateauInfoSection, PlateauPageHeader, PlateauRotationContent } from '../components/PlateauSharedSections'
import PlanningModal from '../components/PlanningModal'
import PlayersPresenceSection from '../components/PlayersPresenceSection'
import CtaButton from '../components/CtaButton'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { applyAttendanceValue, extractPresentPlayerIds, persistAttendanceToggle } from '../features/attendance'
import { readDefaultTactic } from '../features/defaultTactic'
import { detectMatchdayMode } from '../features/matchdayMode'
import { linkRotationSlotsToMatches } from '../features/rotationLinking'
import { playersOnFieldFromGameFormat } from '../features/teamFormat'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import {
  getStoredCancelledMatchIds,
  isMatchCancelled,
  isMatchNotPlayed as isPendingMatch,
  setStoredMatchCancelled,
} from '../matchStatus'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, ClubMe, MatchLite, Matchday, Player } from '../types/api'
import './TrainingDetailsPage.css'

const TEAM_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c2410c',
  '#9333ea', '#0f766e', '#be123c', '#1d4ed8', '#15803d',
  '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4338ca',
]

const MATCHDAY_PLANNING_MAP_KEY = 'izifoot.matchdayPlanningMap'
const MATCHDAY_ROTATION_TEAM_FILTER_KEY = 'izifoot.matchdayRotationTeamFilter'
const LEGACY_PLATEAU_PLANNING_MAP_KEY = 'izifoot.plateauPlanningMap'
const LEGACY_PLATEAU_ROTATION_TEAM_FILTER_KEY = 'izifoot.plateauRotationTeamFilter'

function readPlateauPlanningMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>
  try {
    const parseMap = (raw: string | null) => {
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed as Record<string, string>
    }
    const nextMap = parseMap(window.localStorage.getItem(MATCHDAY_PLANNING_MAP_KEY))
    if (nextMap) return nextMap
    const legacyMap = parseMap(window.localStorage.getItem(LEGACY_PLATEAU_PLANNING_MAP_KEY))
    if (legacyMap) {
      window.localStorage.setItem(MATCHDAY_PLANNING_MAP_KEY, JSON.stringify(legacyMap))
      window.localStorage.removeItem(LEGACY_PLATEAU_PLANNING_MAP_KEY)
      return legacyMap
    }
    return {}
  } catch {
    return {}
  }
}

function writePlateauPlanningMap(next: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MATCHDAY_PLANNING_MAP_KEY, JSON.stringify(next))
  window.localStorage.removeItem(LEGACY_PLATEAU_PLANNING_MAP_KEY)
}

function setPlateauPlanningLink(matchdayId: string, planningId: string) {
  const current = readPlateauPlanningMap()
  writePlateauPlanningMap({ ...current, [matchdayId]: planningId })
}

function getPlateauPlanningLink(matchdayId: string) {
  const current = readPlateauPlanningMap()
  return current[matchdayId] || ''
}

function clearPlateauPlanningLink(matchdayId: string) {
  const current = readPlateauPlanningMap()
  if (!current[matchdayId]) return
  const rest = { ...current }
  delete rest[matchdayId]
  writePlateauPlanningMap(rest)
}

function readPlateauRotationTeamFilterMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>
  try {
    const parseMap = (raw: string | null) => {
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed as Record<string, string>
    }
    const nextMap = parseMap(window.localStorage.getItem(MATCHDAY_ROTATION_TEAM_FILTER_KEY))
    if (nextMap) return nextMap
    const legacyMap = parseMap(window.localStorage.getItem(LEGACY_PLATEAU_ROTATION_TEAM_FILTER_KEY))
    if (legacyMap) {
      window.localStorage.setItem(MATCHDAY_ROTATION_TEAM_FILTER_KEY, JSON.stringify(legacyMap))
      window.localStorage.removeItem(LEGACY_PLATEAU_ROTATION_TEAM_FILTER_KEY)
      return legacyMap
    }
    return {}
  } catch {
    return {}
  }
}

function writePlateauRotationTeamFilterMap(next: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MATCHDAY_ROTATION_TEAM_FILTER_KEY, JSON.stringify(next))
  window.localStorage.removeItem(LEGACY_PLATEAU_ROTATION_TEAM_FILTER_KEY)
}

function getPlateauRotationTeamFilter(matchdayId: string) {
  const current = readPlateauRotationTeamFilterMap()
  return current[matchdayId] || ''
}

function setPlateauRotationTeamFilter(matchdayId: string, teamLabel: string) {
  const current = readPlateauRotationTeamFilterMap()
  writePlateauRotationTeamFilterMap({ ...current, [matchdayId]: teamLabel })
}

function toPlanningUrl(dateISO?: string | null, fallbackDate?: string | null) {
  const date = dateISO ? new Date(dateISO) : null
  if (date && !Number.isNaN(date.getTime())) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `/planning?date=${y}-${m}-${day}`
  }

  if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
    return `/planning?date=${fallbackDate}`
  }

  return '/planning'
}

function normalizeTeamLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function findPlanningTeamLabel(labels: string[], preferredNames: string[]) {
  const cleanPreferred = preferredNames
    .map((name) => normalizeTeamLabel(name))
    .filter(Boolean)
  if (!cleanPreferred.length) return ''
  for (const preferred of cleanPreferred) {
    const found = labels.find((label) => {
      const current = normalizeTeamLabel(label)
      return current === preferred || current.includes(preferred) || preferred.includes(current)
    })
    if (found) return found
  }
  return ''
}

type PlanningTeamEntry = {
  label: string
  color?: string
  absent?: boolean
}

type MatchdaySummaryModeResponse = {
  mode?: 'ROTATION' | 'MANUAL' | string
  matches?: MatchLite[]
}

function buildSidesPayload(match: MatchLite) {
  const toPayload = (side: 'home' | 'away') => {
    const rows = match.teams.find((team) => team.side === side)?.players ?? []
    const starters = rows
      .filter((row) => row.role !== 'sub')
      .map((row) => row.playerId || row.player?.id)
      .filter((playerId): playerId is string => Boolean(playerId))
    const subs = rows
      .filter((row) => row.role === 'sub')
      .map((row) => row.playerId || row.player?.id)
      .filter((playerId): playerId is string => Boolean(playerId))
    return { starters, subs }
  }

  return {
    home: toPayload('home'),
    away: toPayload('away'),
  }
}

export default function PlateauDetailsPage() {
  const { me } = useAuth()
  const { selectedTeamId, selectedTeamFormat, requiresSelection, teamOptions } = useTeamScope()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [plateau, setPlateau] = useState<Matchday | null>(null)
  const [clubName, setClubName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauAttendance, setPlateauAttendance] = useState<Set<string>>(new Set())
  const [plateauMatches, setPlateauMatches] = useState<MatchLite[]>([])
  const [plateauPlannings, setPlateauPlannings] = useState<Planning[]>([])
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isDeletePlateauModalOpen, setIsDeletePlateauModalOpen] = useState(false)
  const [deletingPlateau, setDeletingPlateau] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [sharedPublicUrl, setSharedPublicUrl] = useState('')
  const [shareQrDataUrl, setShareQrDataUrl] = useState('')
  const [shareQrLoading, setShareQrLoading] = useState(false)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editingPlanning, setEditingPlanning] = useState<Planning | null>(null)
  const [selectedPlanningTeam, setSelectedPlanningTeam] = useState('')
  const [matchSourceMode, setMatchSourceMode] = useState<'MANUAL' | 'ROTATION'>('MANUAL')
  const [matchModeConfirm, setMatchModeConfirm] = useState<null | 'TO_MANUAL' | 'TO_ROTATION'>(null)
  const [planningModalOpenedFromSwitch, setPlanningModalOpenedFromSwitch] = useState(false)
  const [infoTab, setInfoTab] = useState<'LIEU' | 'HORAIRES'>('LIEU')
  const [infoModal, setInfoModal] = useState<null | 'ADDRESS' | 'START' | 'MEETING'>(null)
  const [addressDraft, setAddressDraft] = useState('')
  const [startTimeDraft, setStartTimeDraft] = useState('')
  const [meetingTimeDraft, setMeetingTimeDraft] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [absentTeamsSaving, setAbsentTeamsSaving] = useState<Set<string>>(new Set())
  const [localCancelledMatchIds, setLocalCancelledMatchIds] = useState<Set<string>>(() => getStoredCancelledMatchIds())

  const [homeScore, setHomeScore] = useState<number>(0)
  const [awayScore, setAwayScore] = useState<number>(0)
  const [scorers, setScorers] = useState<string[]>([])
  const [newScorerPlayerId, setNewScorerPlayerId] = useState<string>('')
  const [opponentName, setOpponentName] = useState<string>('')
  const [isMatchNotPlayed, setIsMatchNotPlayed] = useState<boolean>(true)
  const matchResult = homeScore > awayScore ? 'WIN' : homeScore < awayScore ? 'LOSS' : 'DRAW'
  const matchResultLabel = isMatchNotPlayed
    ? 'Pas encore joué'
    : matchResult === 'WIN'
      ? 'Victoire'
      : matchResult === 'LOSS'
        ? 'Défaite'
        : 'Nul'

  const loadPlateau = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!id) return
    const [p, ps, matches, attends, plannings, club, summary] = await Promise.all([
      apiGet<Matchday>(apiRoutes.matchday.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<MatchLite[]>(apiRoutes.matches.byMatchday(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('PLATEAU', id)),
      api.listPlannings(),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
      apiGet<MatchdaySummaryModeResponse>(apiRoutes.matchday.summary(id)).catch(() => null),
    ])
    if (isCancelled()) return
    setPlateau(p)
    setClubName(club?.name?.trim() || '')
    setPlayers(ps)
    const sourceMatches = (summary?.matches && summary.matches.length > 0) ? summary.matches : matches
    setPlateauMatches(sourceMatches)
    setMatchSourceMode(detectMatchdayMode(summary?.mode, sourceMatches))
    setPlateauAttendance(extractPresentPlayerIds(attends))
    const linkedPlanningId = getPlateauPlanningLink(p.id)
    const linkedPlanning = linkedPlanningId ? plannings.find((planning) => planning.id === linkedPlanningId) ?? null : null
    setPlateauPlannings(linkedPlanning ? [linkedPlanning] : [])
  }, [id])

  const { loading, error } = useAsyncLoader(loadPlateau)

  const dateLabel = useMemo(() => {
    if (!plateau?.date) return ''
    return new Date(plateau.date).toLocaleDateString()
  }, [plateau])
  const backToPlanningUrl = useMemo(
    () => toPlanningUrl(plateau?.date, searchParams.get('date')),
    [plateau?.date, searchParams]
  )

  const plateauPlanning = useMemo(() => plateauPlannings[0] ?? null, [plateauPlannings])
  const plateauPlanningData = useMemo(
    () => (plateauPlanning?.data as PlanningData | undefined) ?? null,
    [plateauPlanning]
  )
  const plateauPlanningTeams = useMemo(() => {
    if (!plateauPlanningData?.slots?.length) return [] as string[]
    const labels = new Set<string>()
    for (const slot of plateauPlanningData.slots) {
      for (const game of slot.games) {
        labels.add(game.A)
        labels.add(game.B)
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [plateauPlanningData])
  const plateauPlanningTeamColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const savedEntries = Array.isArray(plateauPlanningData?.teams) ? plateauPlanningData?.teams : []
    for (const entry of savedEntries ?? []) {
      if (entry?.label && entry?.color) map.set(entry.label, entry.color)
    }
    for (const [index, label] of plateauPlanningTeams.entries()) {
      if (!map.has(label)) map.set(label, TEAM_COLORS[index % TEAM_COLORS.length])
    }
    return map
  }, [plateauPlanningData, plateauPlanningTeams])
  const visiblePlanningSlots = useMemo(() => {
    if (!plateauPlanningData?.slots?.length) return []
    return plateauPlanningData.slots
      .map((slot) => {
        const games = selectedPlanningTeam
          ? slot.games.filter((game) => game.A === selectedPlanningTeam || game.B === selectedPlanningTeam)
          : slot.games
        return { ...slot, games }
      })
      .filter((slot) => slot.games.length > 0)
  }, [plateauPlanningData, selectedPlanningTeam])
  const visibleRotationMatches = useMemo(() => {
    const activePlateauTeamName = (() => {
      const activeId = selectedTeamId || plateau?.teamId
      if (!activeId) return ''
      return teamOptions.find((team) => team.id === activeId)?.name || ''
    })()
    const clubPlanningTeam = findPlanningTeamLabel(plateauPlanningTeams, [clubName, activePlateauTeamName])
    const linked = linkRotationSlotsToMatches({
      slots: visiblePlanningSlots,
      matches: plateauMatches,
      clubPlanningTeam,
    })
    return linked.slots
  }, [clubName, plateau?.teamId, plateauMatches, plateauPlanningTeams, selectedTeamId, teamOptions, visiblePlanningSlots])
  const matchedRotationGames = useMemo(
    () => visibleRotationMatches.flatMap((slot) => slot.games).filter((game) => game.isClubGame && Boolean(game.linkedMatch)).length,
    [visibleRotationMatches],
  )
  const unmatchedRotationDisplaySlots = useMemo(() => {
    if (matchSourceMode !== 'ROTATION' || plateauMatches.length === 0) return []
    const linkedIds = new Set(
      visibleRotationMatches
        .flatMap((slot) => slot.games)
        .map((game) => game.linkedMatch?.id)
        .filter((matchId): matchId is string => Boolean(matchId)),
    )
    const unmatched = plateauMatches.filter((match) => !linkedIds.has(match.id))
    if (unmatched.length === 0) return []
    const activePlateauTeamName = (() => {
      const activeId = selectedTeamId || plateau?.teamId
      if (!activeId) return ''
      return teamOptions.find((team) => team.id === activeId)?.name || ''
    })()
    return [{
      key: 'rotation-unmatched',
      games: unmatched.map((match) => {
        const home = match.teams.find((team) => team.side === 'home')
        const away = match.teams.find((team) => team.side === 'away')
        const homeScoreValue = home?.score ?? 0
        const awayScoreValue = away?.score ?? 0
        const cancelled = isMatchCancelled(match, { localCancelledIds: localCancelledMatchIds })
        const isNotPlayed = isPendingMatch(match, { referenceDate: plateau?.date ?? null, localCancelledIds: localCancelledMatchIds })
        return {
          key: match.id,
          teamA: clubName || activePlateauTeamName || 'Nous',
          teamB: match.opponentName || 'Adversaire',
          teamAColor: '#1d4ed8',
          teamBColor: '#64748b',
          isClickable: true,
          showLinkIndicator: false,
          isCancelled: cancelled,
          scoreLabel: cancelled || isNotPlayed ? null : `${homeScoreValue} - ${awayScoreValue}`,
          onOpen: () => navigate(`/match/${match.id}`),
        }
      }),
    }]
  }, [clubName, localCancelledMatchIds, matchSourceMode, navigate, plateau?.date, plateau?.teamId, plateauMatches, selectedTeamId, teamOptions, visibleRotationMatches])
  const absentTeamLabels = useMemo(() => {
    const teams = Array.isArray(plateauPlanningData?.teams)
      ? (plateauPlanningData?.teams as PlanningTeamEntry[])
      : []
    return new Set(
      teams
        .filter((entry) => Boolean(entry?.label) && Boolean(entry?.absent))
        .map((entry) => entry.label.trim())
        .filter(Boolean)
    )
  }, [plateauPlanningData?.teams])
  const rotationMatchIdsByTeam = useMemo(() => {
    const byTeam = new Map<string, Set<string>>()
    if (!plateauPlanningData?.slots?.length) return byTeam
    const activePlateauTeamName = (() => {
      const activeId = selectedTeamId || plateau?.teamId
      if (!activeId) return ''
      return teamOptions.find((team) => team.id === activeId)?.name || ''
    })()
    const clubPlanningTeam = findPlanningTeamLabel(plateauPlanningTeams, [clubName, activePlateauTeamName])
    if (!clubPlanningTeam) return byTeam
    const opponentSeenCount = new Map<string, number>()
    const matchesByOpponent = new Map<string, MatchLite[]>()
    for (const match of plateauMatches) {
      const key = (match.opponentName || '').trim()
      if (!matchesByOpponent.has(key)) matchesByOpponent.set(key, [])
      matchesByOpponent.get(key)?.push(match)
    }
    for (const slot of plateauPlanningData.slots) {
      for (const game of slot.games) {
        if (game.A !== clubPlanningTeam && game.B !== clubPlanningTeam) continue
        const opponent = game.A === clubPlanningTeam ? game.B : game.A
        const occurrence = opponentSeenCount.get(opponent) ?? 0
        opponentSeenCount.set(opponent, occurrence + 1)
        const linkedMatch = matchesByOpponent.get(opponent)?.[occurrence]
        if (!linkedMatch?.id) continue
        for (const teamLabel of [game.A, game.B]) {
          if (!byTeam.has(teamLabel)) byTeam.set(teamLabel, new Set())
          byTeam.get(teamLabel)?.add(linkedMatch.id)
        }
      }
    }
    return byTeam
  }, [clubName, plateau?.teamId, plateauMatches, plateauPlanningData, plateauPlanningTeams, selectedTeamId, teamOptions])

  useEffect(() => {
    if (!id) return
    const saved = getPlateauRotationTeamFilter(id)
    if (!saved) return
    setSelectedPlanningTeam(saved)
  }, [id])

  useEffect(() => {
    if (!id) return
    setPlateauRotationTeamFilter(id, selectedPlanningTeam)
  }, [id, selectedPlanningTeam])
  const defaultMatchTactic = useMemo(() => {
    const teamId = selectedTeamId || plateau?.teamId || null
    const playersOnField = playersOnFieldFromGameFormat(selectedTeamFormat, 5)
    const saved = readDefaultTactic(teamId, playersOnField)
    if (!saved) return undefined
    return {
      preset: saved.preset,
      points: saved.points,
    }
  }, [plateau?.teamId, selectedTeamFormat, selectedTeamId])
  const rotationDisplaySlots = useMemo(() => (
    visibleRotationMatches.map((slot) => ({
      key: slot.time,
      time: slot.time,
      games: slot.games.map((game) => {
        const cancelledByAbsence = absentTeamLabels.has(game.A) || absentTeamLabels.has(game.B)
        const cancelledByMatchStatus = game.isClubGame && Boolean(game.linkedMatch) && isMatchCancelled(game.linkedMatch as MatchLite, {
          localCancelledIds: localCancelledMatchIds,
        })
        const isCancelled = cancelledByAbsence || cancelledByMatchStatus
        return {
          key: `${slot.time}-${game.pitch}-${game.A}-${game.B}`,
          pitch: game.pitch,
          teamA: game.A,
          teamB: game.B,
          teamAColor: plateauPlanningTeamColorMap.get(game.A) ?? TEAM_COLORS[0],
          teamBColor: plateauPlanningTeamColorMap.get(game.B) ?? TEAM_COLORS[1],
          isClickable: game.isClubGame && Boolean(game.linkedMatch) && !isCancelled,
          showLinkIndicator: game.isClubGame && Boolean(game.linkedMatch) && !isCancelled,
          isCancelled,
          scoreLabel: game.isClubGame
            && game.linkedMatch
            && !isCancelled
            && !isPendingMatch(game.linkedMatch, { referenceDate: plateau?.date ?? null, localCancelledIds: localCancelledMatchIds })
            ? `${game.linkedMatch.teams.find((team) => team.side === 'home')?.score ?? 0} - ${game.linkedMatch.teams.find((team) => team.side === 'away')?.score ?? 0}`
            : null,
          onOpen: game.isClubGame && game.linkedMatch && !isCancelled ? () => navigate(`/match/${game.linkedMatch?.id}`) : undefined,
        }
      }),
    }))
  ), [absentTeamLabels, localCancelledMatchIds, navigate, plateau?.date, plateauPlanningTeamColorMap, visibleRotationMatches])
  const manualDisplaySlots = useMemo(() => {
    if (matchSourceMode !== 'MANUAL' || plateauMatches.length === 0) return []
    const activePlateauTeamName = (() => {
      const activeId = selectedTeamId || plateau?.teamId
      if (!activeId) return ''
      return teamOptions.find((team) => team.id === activeId)?.name || ''
    })()
    return [{
      key: 'manual-matches',
      games: plateauMatches.map((match) => {
        const home = match.teams.find((team) => team.side === 'home')
        const away = match.teams.find((team) => team.side === 'away')
        const homeScoreValue = home?.score ?? 0
        const awayScoreValue = away?.score ?? 0
        const cancelled = isMatchCancelled(match, { localCancelledIds: localCancelledMatchIds })
        const isNotPlayed = isPendingMatch(match, { referenceDate: plateau?.date ?? null, localCancelledIds: localCancelledMatchIds })
        return {
          key: match.id,
          teamA: clubName || activePlateauTeamName || 'Nous',
          teamB: match.opponentName || 'Adversaire',
          teamAColor: '#1d4ed8',
          teamBColor: '#64748b',
          isClickable: true,
          showLinkIndicator: false,
          isCancelled: cancelled,
          scoreLabel: cancelled || isNotPlayed ? null : `${homeScoreValue} - ${awayScoreValue}`,
          onOpen: () => navigate(`/match/${match.id}`),
        }
      }),
    }]
  }, [clubName, localCancelledMatchIds, matchSourceMode, navigate, plateau?.date, plateau?.teamId, plateauMatches, selectedTeamId, teamOptions])
  const activeTeamName = useMemo(() => {
    const activeId = selectedTeamId || plateau?.teamId
    if (!activeId) return ''
    return teamOptions.find((team) => team.id === activeId)?.name || ''
  }, [plateau?.teamId, selectedTeamId, teamOptions])
  const inferredPlanningTeamLabel = useMemo(() => {
    if (plateauPlanningTeams.length === 0) return ''
    return findPlanningTeamLabel(plateauPlanningTeams, [clubName, activeTeamName])
  }, [activeTeamName, clubName, plateauPlanningTeams])
  const plateauStartTimeLabel = useMemo(() => {
    if (plateau?.startTime) return plateau.startTime
    if (plateauPlanningData?.start) return plateauPlanningData.start
    if (!plateau?.date) return 'À définir'
    const date = new Date(plateau.date)
    if (Number.isNaN(date.getTime())) return 'À définir'
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    if (hh === '00' && mm === '00') return 'À définir'
    return `${hh}:${mm}`
  }, [plateau?.date, plateau?.startTime, plateauPlanningData?.start])
  const plateauAddressLabel = useMemo(() => plateau?.address?.trim() || plateau?.lieu || 'À définir', [plateau?.address, plateau?.lieu])
  const rendezVousTimeLabel = useMemo(() => {
    if (plateau?.meetingTime) return plateau.meetingTime
    const fromPlanning = plateauPlanningData?.start ?? null
    const fromPlateauDate = plateau?.date ? (() => {
      const d = new Date(plateau.date)
      if (Number.isNaN(d.getTime())) return null
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return hh === '00' && mm === '00' ? null : `${hh}:${mm}`
    })() : null
    const source = fromPlanning || fromPlateauDate
    if (!source) return 'À définir'
    const match = source.match(/^(\d{2}):(\d{2})$/)
    if (!match) return 'À définir'
    const hour = Number(match[1])
    const minute = Number(match[2])
    const total = Math.max(0, hour * 60 + minute - 30)
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }, [plateau?.date, plateau?.meetingTime, plateauPlanningData?.start])
  const publicPlateauUrl = useMemo(() => sharedPublicUrl, [sharedPublicUrl])
  const writable = me ? canWrite(me.role) && (!requiresSelection || Boolean(selectedTeamId)) : false

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (matchSourceMode !== 'ROTATION') return
    if (plateauMatches.length === 0) return
    if (matchedRotationGames > 0) return
    const sampleKeys = plateauMatches
      .map((match) => match.rotationGameKey)
      .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
      .slice(0, 5)
    console.warn('[matchday][rotation] no games matched; fallback applied', {
      mode: matchSourceMode,
      matches: plateauMatches.length,
      matchedGames: matchedRotationGames,
      rotationGameKeySample: sampleKeys,
    })
  }, [matchSourceMode, matchedRotationGames, plateauMatches])

  useEffect(() => {
    let cancelled = false
    if (!isShareModalOpen || !publicPlateauUrl) {
      setShareQrDataUrl('')
      setShareQrLoading(false)
      return
    }
    setShareQrLoading(true)
    void QRCode.toDataURL(publicPlateauUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl: string) => {
        if (cancelled) return
        setShareQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (cancelled) return
        setShareQrDataUrl('')
      })
      .finally(() => {
        if (cancelled) return
        setShareQrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isShareModalOpen, publicPlateauUrl])

  async function togglePlateauPresence(playerId: string, present: boolean) {
    if (!writable) return
    if (!id) return
    const previousPresent = plateauAttendance.has(playerId)
    setPlateauAttendance((prev) => applyAttendanceValue(prev, playerId, present))
    try {
      const payload = await persistAttendanceToggle(apiPost, {
        sessionType: 'PLATEAU',
        sessionId: id,
        playerId,
        present,
      })
      console.debug('[attendance][plateau] POST /attendance payload', payload)
    } catch (err: unknown) {
      setPlateauAttendance((prev) => applyAttendanceValue(prev, playerId, previousPresent))
      uiAlert(`Erreur présence (plateau): ${toErrorMessage(err)}`)
    }
  }

  async function deletePlateau() {
    if (!writable) return
    if (!id) return
    setDeletingPlateau(true)
    try {
      await apiDelete(apiRoutes.matchday.byId(id))
      navigate(backToPlanningUrl)
    } catch (err: unknown) {
      uiAlert(`Erreur suppression plateau: ${toErrorMessage(err)}`)
    } finally {
      setDeletingPlateau(false)
      setIsDeletePlateauModalOpen(false)
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
    setScorers([])
    setNewScorerPlayerId('')
    setOpponentName('')
    setIsMatchNotPlayed(true)
  }

  function setHomeScoreFromControls(next: number) {
    setIsMatchNotPlayed(false)
    setHomeScore(Math.max(0, next))
  }

  function setAwayScoreFromControls(next: number) {
    setIsMatchNotPlayed(false)
    setAwayScore(Math.max(0, next))
  }

  function toggleMatchNotPlayed(checked: boolean) {
    setIsMatchNotPlayed(checked)
    if (checked) {
      setHomeScore(0)
      setAwayScore(0)
    }
  }

  function closeMatchModal() {
    setIsMatchModalOpen(false)
    resetMatchForm()
  }

  function openCreateMatchModal() {
    resetMatchForm()
    setIsMatchModalOpen(true)
  }

  function openAddressModal() {
    setAddressDraft(plateauAddressLabel === 'À définir' ? '' : plateauAddressLabel)
    setInfoModal('ADDRESS')
  }

  function openStartTimeModal() {
    setStartTimeDraft(plateau?.startTime || '')
    setInfoModal('START')
  }

  function openMeetingTimeModal() {
    setMeetingTimeDraft(plateau?.meetingTime || '')
    setInfoModal('MEETING')
  }

  function closeInfoModal() {
    if (savingInfo) return
    setInfoModal(null)
  }

  async function updatePlateauInfo(patch: { address?: string | null; startTime?: string | null; meetingTime?: string | null }) {
    if (!id || !plateau || !writable) return
    setSavingInfo(true)
    try {
      const updated = await apiPut<Matchday>(apiRoutes.matchday.byId(id), patch)
      setPlateau(updated)
      setInfoModal(null)
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour des informations: ${toErrorMessage(err)}`)
    } finally {
      setSavingInfo(false)
    }
  }

  function openEditPlanningModal(planning: Planning) {
    if (!writable) return
    setEditingPlanning(planning)
    setPlanningModalOpenedFromSwitch(false)
    setIsPlanningModalOpen(true)
  }

  function closePlanningModal() {
    setIsPlanningModalOpen(false)
    setEditingPlanning(null)
    if (planningModalOpenedFromSwitch) {
      setMatchSourceMode('MANUAL')
      setPlanningModalOpenedFromSwitch(false)
    }
  }

  async function openShareModal() {
    if (!writable) return
    if (!id) return
    setShareCopied(false)
    setShareLoading(true)
    setIsShareModalOpen(true)
    try {
      const data = await apiPost<{ token: string; url?: string }>(apiRoutes.matchday.share(id), {})
      const fallbackUrl = `${window.location.origin}/matchday/public/${encodeURIComponent(data.token)}`
      setSharedPublicUrl(data.url || fallbackUrl)
    } catch (err: unknown) {
      setSharedPublicUrl('')
      uiAlert(`Erreur génération du lien public: ${toErrorMessage(err)}`)
    } finally {
      setShareLoading(false)
    }
  }

  function closeShareModal() {
    setIsShareModalOpen(false)
    setShareCopied(false)
    setShareQrDataUrl('')
    setShareQrLoading(false)
  }

  function openDeletePlateauModal() {
    if (!writable) return
    setActionsMenuOpen(false)
    setIsDeletePlateauModalOpen(true)
  }

  function closeDeletePlateauModal() {
    if (deletingPlateau) return
    setIsDeletePlateauModalOpen(false)
  }

  async function copyShareLink() {
    if (!publicPlateauUrl) return
    try {
      await navigator.clipboard.writeText(publicPlateauUrl)
      setShareCopied(true)
    } catch {
      uiAlert("Impossible de copier automatiquement le lien.")
    }
  }

  function upsertPlanning(savedPlanning: Planning) {
    if (id) setPlateauPlanningLink(id, savedPlanning.id)
    setPlateauPlannings([savedPlanning])
    setMatchSourceMode('ROTATION')
    setPlanningModalOpenedFromSwitch(false)
    setSelectedPlanningTeam('')
    void generateMatchesFromRotation(savedPlanning)
  }

  async function deletePlanningItem(planningId: string, options?: { skipConfirm?: boolean }) {
    if (!writable) return
    if (!options?.skipConfirm && !uiConfirm('Supprimer cette rotation ?')) return
    try {
      await api.deletePlanning(planningId)
      if (id) clearPlateauPlanningLink(id)
      setPlateauPlannings([])
      setSelectedPlanningTeam('')
      setMatchSourceMode('MANUAL')
    } catch (err: unknown) {
      uiAlert(`Erreur suppression rotation: ${toErrorMessage(err)}`)
    }
  }

  async function syncTeamAbsence(teamLabel: string, absent: boolean) {
    if (!writable) return
    if (!plateauPlanning || !plateauPlanningData) return
    const normalizedLabel = teamLabel.trim()
    if (!normalizedLabel) return
    setAbsentTeamsSaving((prev) => new Set(prev).add(normalizedLabel))
    try {
      const currentEntries = Array.isArray(plateauPlanningData.teams)
        ? (plateauPlanningData.teams as PlanningTeamEntry[])
        : []
      const entriesByLabel = new Map(currentEntries.map((entry) => [entry.label, entry] as const))
      const nextTeams = plateauPlanningTeams.map((label, index) => {
        const existing = entriesByLabel.get(label)
        return {
          label,
          color: existing?.color || TEAM_COLORS[index % TEAM_COLORS.length],
          absent: label === normalizedLabel ? absent : Boolean(existing?.absent),
        }
      })
      const savedPlanning = await api.updatePlanning(plateauPlanning.id, {
        ...plateauPlanningData,
        teams: nextTeams,
      })
      setPlateauPlannings([savedPlanning])

      const affectedMatchIds = Array.from(rotationMatchIdsByTeam.get(normalizedLabel) ?? [])
      if (!affectedMatchIds.length) return
      const updatedMatches = await Promise.all(affectedMatchIds.map(async (matchId) => {
        const source = plateauMatches.find((item) => item.id === matchId)
        if (!source) return null
        const payload = {
          type: source.type,
          matchdayId: source.matchdayId ?? undefined,
          sides: buildSidesPayload(source),
          score: {
            home: source.teams.find((team) => team.side === 'home')?.score ?? 0,
            away: source.teams.find((team) => team.side === 'away')?.score ?? 0,
          },
          buteurs: (source.scorers || []).map((scorer) => ({
            playerId: scorer.playerId,
            side: scorer.side,
          })),
          opponentName: source.opponentName || '',
          played: absent ? false : source.played,
          status: absent ? 'CANCELLED' : 'PLANNED',
        }
        const updated = await apiPut<MatchLite>(apiRoutes.matches.byId(matchId), payload)
        return updated
      }))
      const validUpdated = updatedMatches.filter((item): item is MatchLite => Boolean(item))
      if (!validUpdated.length) return
      const updatedMap = new Map(validUpdated.map((item) => [item.id, item] as const))
      setPlateauMatches((prev) => prev.map((item) => {
        const updated = updatedMap.get(item.id)
        if (!updated) return item
        if (absent) return { ...updated, status: updated.status || 'CANCELLED' }
        return updated
      }))
      setLocalCancelledMatchIds((prev) => {
        const next = new Set(prev)
        for (const matchId of affectedMatchIds) {
          if (absent) next.add(matchId)
          else next.delete(matchId)
          setStoredMatchCancelled(matchId, absent)
        }
        return next
      })
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour absences équipe: ${toErrorMessage(err)}`)
    } finally {
      setAbsentTeamsSaving((prev) => {
        const next = new Set(prev)
        next.delete(normalizedLabel)
        return next
      })
    }
  }

  async function generateMatchesFromRotation(planningArg?: Planning | null) {
    if (!writable) return
    if (!id) return
    const planningData = (planningArg?.data as PlanningData | undefined) ?? plateauPlanningData
    if (!planningData?.slots?.length) {
      uiAlert('Aucune rotation disponible pour générer des matchs.')
      return
    }
    const planningTeams = Array.from(new Set(planningData.slots.flatMap((slot) => slot.games.flatMap((game) => [game.A, game.B]))))
    const inferredFromCurrentPlanning = findPlanningTeamLabel(planningTeams, [clubName, activeTeamName])
    const teamLabel = selectedPlanningTeam || inferredPlanningTeamLabel || inferredFromCurrentPlanning
    if (!teamLabel) {
      uiAlert('Sélectionnez votre équipe dans la rotation avant de générer les matchs.')
      return
    }
    const generated = planningData.slots.flatMap((slot) =>
      slot.games
        .filter((game) => game.A === teamLabel || game.B === teamLabel)
        .map((game) => ({ opponent: game.A === teamLabel ? game.B : game.A }))
    )
    if (!generated.length) {
      uiAlert(`Aucun match de l'équipe "${teamLabel}" trouvé dans la rotation.`)
      return
    }

    try {
      if (plateauMatches.length > 0) {
        await Promise.all(plateauMatches.map((match) => apiDelete(apiRoutes.matches.byId(match.id))))
      }
      const created = await Promise.all(
        generated.map((matchItem) =>
          apiPost<MatchLite>(apiRoutes.matches.list, {
            type: 'PLATEAU' as const,
            matchdayId: id,
            sides: {
              home: { starters: [], subs: [] },
              away: { starters: [], subs: [] },
            },
            score: { home: 0, away: 0 },
            buteurs: [],
            opponentName: matchItem.opponent,
            played: false,
            tactic: defaultMatchTactic,
          })
        )
      )
      setPlateauMatches(created)
      setMatchSourceMode('ROTATION')
    } catch (err: unknown) {
      uiAlert(`Erreur génération des matchs depuis la rotation: ${toErrorMessage(err)}`)
    }
  }

  async function switchToManualMode() {
    if (!writable) return
    if (matchSourceMode === 'MANUAL') return
    if (plateauPlanning) {
      setMatchModeConfirm('TO_MANUAL')
      return
    }
    setMatchSourceMode('MANUAL')
  }

  async function switchToRotationMode() {
    if (!writable) return
    if (matchSourceMode === 'ROTATION') return
    if (
      matchSourceMode === 'MANUAL'
      && plateauMatches.length > 0
    ) {
      setMatchModeConfirm('TO_ROTATION')
      return
    }
    setMatchSourceMode('ROTATION')
    setPlanningModalOpenedFromSwitch(true)
    setEditingPlanning(plateauPlanning)
    setIsPlanningModalOpen(true)
  }

  function closeMatchModeConfirmModal() {
    setMatchModeConfirm(null)
  }

  async function confirmMatchModeSwitch() {
    if (!writable || !matchModeConfirm) return
    const currentAction = matchModeConfirm
    setMatchModeConfirm(null)
    if (currentAction === 'TO_MANUAL') {
      if (plateauMatches.length > 0) {
        await Promise.all(plateauMatches.map((match) => apiDelete(apiRoutes.matches.byId(match.id))))
        setPlateauMatches([])
      }
      if (plateauPlanning) {
        await deletePlanningItem(plateauPlanning.id, { skipConfirm: true })
      }
      setMatchSourceMode('MANUAL')
      return
    }
    setMatchSourceMode('ROTATION')
    setPlanningModalOpenedFromSwitch(true)
    setEditingPlanning(plateauPlanning)
    setIsPlanningModalOpen(true)
  }

  async function submitMatchForm(e: React.FormEvent) {
    if (!writable) return
    e.preventDefault()
    if (!id) return
    if (!opponentName.trim()) {
      uiAlert('Merci de renseigner le nom de l’adversaire.')
      return
    }
    try {
      const payload = {
        type: 'PLATEAU' as const,
        matchdayId: id,
        sides: {
          home: { starters: [], subs: [] },
          away: { starters: [], subs: [] },
        },
        score: { home: isMatchNotPlayed ? 0 : homeScore, away: isMatchNotPlayed ? 0 : awayScore },
        buteurs: isMatchNotPlayed ? [] : scorers.map((playerId) => ({ playerId, side: 'home' as const })),
        opponentName: opponentName.trim(),
        played: !isMatchNotPlayed,
        ...(!editingMatchId ? { tactic: defaultMatchTactic } : {}),
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
      <PlateauPageHeader
        title="Plateau"
        subtitle={dateLabel}
        backAction={(
          <button type="button" className="back-link-button" onClick={() => navigate(backToPlanningUrl)}>
            <ChevronLeftIcon size={18} />
            <span>Retour au planning</span>
          </button>
        )}
        action={writable ? (
          <>
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
                    onClick={() => {
                      setActionsMenuOpen(false)
                      void openShareModal()
                    }}
                  >
                    Partager le plateau
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      openDeletePlateauModal()
                    }}
                  >
                    Supprimer le plateau
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
      />

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}

      {plateau && (
        <>
          {!writable && <p className="muted-line">Mode lecture seule: actions de modification désactivées.</p>}
          <div className="training-details-grid">
            <PlateauInfoSection
              tab={infoTab}
              onTabChange={setInfoTab}
              addressLabel={plateauAddressLabel}
              startTimeLabel={plateauStartTimeLabel}
              meetingTimeLabel={rendezVousTimeLabel}
              addressAction={writable ? (
                <button type="button" className="info-edit-button" onClick={openAddressModal}>
                  Modifier
                </button>
              ) : undefined}
              startTimeAction={writable ? (
                <button type="button" className="info-edit-button" onClick={openStartTimeModal}>
                  Modifier
                </button>
              ) : undefined}
              meetingTimeAction={writable ? (
                <button type="button" className="info-edit-button" onClick={openMeetingTimeModal}>
                  Modifier
                </button>
              ) : undefined}
            />

            <PlayersPresenceSection
              players={players}
              presentPlayerIds={plateauAttendance}
              onTogglePresence={togglePlateauPresence}
              cardDisabled={!writable}
              selectionDisabled={!writable}
              selectionDisabledMessage={!writable ? <p className="muted-line">Mode lecture seule: sélection indisponible.</p> : undefined}
            />
          </div>

          <section className="details-card">
            <div className="card-head matches-card-head">
              <h3>Matchs</h3>
              <div className="head-actions">
                <div className="match-source-toggle" role="tablist" aria-label="Mode de gestion des matchs">
                  <span
                    className={`match-source-toggle-thumb ${matchSourceMode === 'ROTATION' ? 'is-rotation' : ''}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={matchSourceMode === 'MANUAL'}
                    onClick={() => { void switchToManualMode() }}
                    disabled={!writable}
                    className={`match-source-toggle-btn ${matchSourceMode === 'MANUAL' ? 'is-active' : ''}`}
                  >
                    Manuel
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={matchSourceMode === 'ROTATION'}
                    onClick={() => { void switchToRotationMode() }}
                    disabled={!writable}
                    className={`match-source-toggle-btn ${matchSourceMode === 'ROTATION' ? 'is-active' : ''}`}
                  >
                    Rotation
                  </button>
                </div>
              </div>
            </div>
            <div className="matches-section-body">
              {matchSourceMode === 'ROTATION' && (
                <>
                  {plateauPlanningTeams.length > 0 && (
                    <div className="rotation-team-absences">
                      <div className="rotation-team-absences-head">
                        <strong>Équipes absentes</strong>
                        <span>Tous les matchs liés à une équipe absente sont annulés.</span>
                      </div>
                      <div className="rotation-team-absences-list">
                        {plateauPlanningTeams.map((teamLabel) => {
                          const checked = absentTeamLabels.has(teamLabel)
                          const saving = absentTeamsSaving.has(teamLabel)
                          return (
                            <label key={`absent-${teamLabel}`} className={`rotation-team-absent-item ${checked ? 'is-checked' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!writable || saving}
                                onChange={(event) => { void syncTeamAbsence(teamLabel, event.target.checked) }}
                              />
                              <span>{teamLabel}</span>
                              {saving ? <small>…</small> : null}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {plateauPlanning ? (
                    <>
                      <PlateauRotationContent
                        updatedAtLabel={`Mise à jour le ${new Date(plateauPlanning.updatedAt).toLocaleString()}`}
                        filterValue={selectedPlanningTeam}
                        filterOptions={plateauPlanningTeams}
                        onFilterChange={setSelectedPlanningTeam}
                        slots={rotationDisplaySlots}
                        emptyMessage={selectedPlanningTeam ? 'Aucun créneau pour cette équipe.' : 'Aucun créneau disponible.'}
                        topAction={writable ? (
                          <button type="button" className="rotation-edit-link" onClick={() => openEditPlanningModal(plateauPlanning)}>
                            Modifier
                          </button>
                        ) : undefined}
                      />
                      {unmatchedRotationDisplaySlots.length > 0 && (
                        <PlateauRotationContent
                          updatedAtLabel="Matchs non rattachés à la grille"
                          filterValue=""
                          filterOptions={[]}
                          onFilterChange={() => {}}
                          slots={unmatchedRotationDisplaySlots}
                          emptyMessage="Aucun match."
                        />
                      )}
                    </>
                  ) : (
                    <div className="matches-section-body">
                      {plateauMatches.length > 0 ? (
                        <PlateauRotationContent
                          updatedAtLabel="Matchs disponibles"
                          filterValue=""
                          filterOptions={[]}
                          onFilterChange={() => {}}
                          slots={unmatchedRotationDisplaySlots.length > 0 ? unmatchedRotationDisplaySlots : manualDisplaySlots}
                          emptyMessage="Aucun match."
                        />
                      ) : (
                        <div className="rotation-empty-state">Aucune rotation enregistrée pour ce plateau.</div>
                      )}
                    </div>
                  )}
                </>
              )}
              {matchSourceMode === 'MANUAL' && plateauMatches.length > 0 && (
                <PlateauRotationContent
                  filterValue=""
                  filterOptions={[]}
                  onFilterChange={() => {}}
                  slots={manualDisplaySlots}
                  emptyMessage="Aucun match encore enregistré pour ce plateau."
                />
              )}
              {plateauMatches.length === 0 && (
                <div className="matches-empty-state">
                  {matchSourceMode === 'ROTATION'
                    ? 'Aucun match généré depuis la rotation pour le moment.'
                    : 'Aucun match encore enregistré pour ce plateau.'}
                </div>
              )}
              {matchSourceMode === 'MANUAL' && writable && (
                <CtaButton
                  type="button"
                  onClick={openCreateMatchModal}
                  style={{ width: '100%' }}
                >
                  Ajouter un match
                </CtaButton>
              )}
            </div>
          </section>
        </>
      )}

      {writable && isMatchModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeMatchModal} />
          <div className="drill-modal match-modal" role="dialog" aria-modal="true">
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
              <label className="match-not-played-toggle">
                <input
                  type="checkbox"
                  checked={!isMatchNotPlayed}
                  onChange={(e) => toggleMatchNotPlayed(!e.target.checked)}
                />
                <span>Match joué</span>
              </label>
              <div className="match-score-grid">
                <div className="match-score-card">
                  <span className="match-score-label">Nos buts</span>
                  <div className="match-score-controls">
                    <button
                      type="button"
                      className="match-score-btn"
                      onClick={() => setHomeScoreFromControls(homeScore - 1)}
                      disabled={isMatchNotPlayed}
                      aria-label="Retirer un but à notre score"
                    >
                      −
                    </button>
                    <span className="match-score-value" aria-live="polite">{homeScore}</span>
                    <button
                      type="button"
                      className="match-score-btn"
                      onClick={() => setHomeScoreFromControls(homeScore + 1)}
                      disabled={isMatchNotPlayed}
                      aria-label="Ajouter un but à notre score"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="match-score-card">
                  <span className="match-score-label">Buts adverses</span>
                  <div className="match-score-controls">
                    <button
                      type="button"
                      className="match-score-btn"
                      onClick={() => setAwayScoreFromControls(awayScore - 1)}
                      disabled={isMatchNotPlayed}
                      aria-label="Retirer un but au score adverse"
                    >
                      −
                    </button>
                    <span className="match-score-value" aria-live="polite">{awayScore}</span>
                    <button
                      type="button"
                      className="match-score-btn"
                      onClick={() => setAwayScoreFromControls(awayScore + 1)}
                      disabled={isMatchNotPlayed}
                      aria-label="Ajouter un but au score adverse"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Résultat</span>
                <div className={`match-result-chip ${isMatchNotPlayed ? 'is-pending' : matchResult === 'WIN' ? 'is-win' : matchResult === 'LOSS' ? 'is-loss' : 'is-draw'}`}>
                  {matchResultLabel}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Buteurs</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <select
                    value={newScorerPlayerId}
                    onChange={e => setNewScorerPlayerId(e.target.value)}
                    disabled={isMatchNotPlayed}
                    style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                  >
                    <option value="">— Choisir un joueur —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={addScorer}
                    disabled={isMatchNotPlayed}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}
                  >
                    Ajouter
                  </button>
                </div>
                {isMatchNotPlayed && (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Active le switch pour saisir le score et les buteurs.
                  </span>
                )}
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

      {writable && infoModal && (
        <>
          <div className="modal-overlay" onClick={closeInfoModal} />
          <div className="drill-modal" role="dialog" aria-modal="true">
            <div className="drill-modal-head">
              <h3>
                {infoModal === 'ADDRESS'
                  ? "Modifier l'adresse"
                  : infoModal === 'START'
                    ? "Modifier l'horaire de début"
                    : "Modifier l'horaire de rendez-vous"}
              </h3>
              <button type="button" onClick={closeInfoModal} disabled={savingInfo}>✕</button>
            </div>
            {infoModal === 'ADDRESS' ? (
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="info-label">Adresse</span>
                <input
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                  placeholder="Adresse du lieu"
                  disabled={savingInfo}
                />
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="info-label">{infoModal === 'START' ? 'Début du plateau' : 'Rendez-vous sur le lieu'}</span>
                <input
                  type="time"
                  value={infoModal === 'START' ? startTimeDraft : meetingTimeDraft}
                  onChange={(e) => (infoModal === 'START' ? setStartTimeDraft(e.target.value) : setMeetingTimeDraft(e.target.value))}
                  disabled={savingInfo}
                />
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={closeInfoModal}
                disabled={savingInfo}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', padding: '8px 12px' }}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingInfo}
                style={{ border: '1px solid #1d4ed8', borderRadius: 8, background: '#2563eb', color: '#fff', padding: '8px 12px' }}
                onClick={() => {
                  if (infoModal === 'ADDRESS') {
                    void updatePlateauInfo({ address: addressDraft.trim() || null })
                    return
                  }
                  if (infoModal === 'START') {
                    void updatePlateauInfo({ startTime: startTimeDraft || null })
                    return
                  }
                  void updatePlateauInfo({ meetingTime: meetingTimeDraft || null })
                }}
              >
                {savingInfo ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </>
      )}

      {writable && isPlanningModalOpen && plateau?.date && (
        <PlanningModal
          dateISO={plateau.date}
          planning={editingPlanning}
          initialTeamLabel={clubName || activeTeamName}
          onClose={closePlanningModal}
          onSaved={upsertPlanning}
        />
      )}

      {writable && isShareModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeShareModal} />
          <div className="drill-modal share-modal" role="dialog" aria-modal="true" aria-label="Partager le plateau">
            <div className="drill-modal-head">
              <h3>Partager le plateau</h3>
              <button type="button" onClick={closeShareModal}>✕</button>
            </div>
            <div className="share-content">
              <p className="muted-line">
                Ce lien ouvre la version publique du plateau avec les blocs titre/date, informations et rotation.
              </p>
              <label className="share-url-block">
                <span>Lien public</span>
                <input type="text" readOnly value={shareLoading ? 'Génération du lien…' : publicPlateauUrl} />
              </label>
              <div className="share-actions">
                <button type="button" onClick={() => void copyShareLink()} disabled={shareLoading || !publicPlateauUrl}>
                  {shareCopied ? 'Lien copié' : 'Copier le lien'}
                </button>
                <a
                  href={publicPlateauUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!publicPlateauUrl) e.preventDefault()
                  }}
                  aria-disabled={!publicPlateauUrl}
                >
                  Ouvrir le lien
                </a>
              </div>
              {shareQrLoading && <p className="muted-line">Génération du QR code…</p>}
              {shareQrDataUrl && (
                <div className="share-qr-wrap">
                  <img src={shareQrDataUrl} alt="QR code du lien public du plateau" width={220} height={220} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {writable && isDeletePlateauModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeDeletePlateauModal} />
          <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Confirmer la suppression du plateau">
            <div className="drill-modal-head">
              <h3>Supprimer le plateau ?</h3>
              <button type="button" onClick={closeDeletePlateauModal} disabled={deletingPlateau}>✕</button>
            </div>
            <p className="muted-line">
              Cette action est définitive. Tous les matchs liés à ce plateau seront supprimés.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={closeDeletePlateauModal}
                disabled={deletingPlateau}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', padding: '8px 12px' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void deletePlateau()}
                disabled={deletingPlateau}
                style={{ border: '1px solid #ef4444', borderRadius: 8, background: '#ef4444', color: '#fff', padding: '8px 12px' }}
              >
                {deletingPlateau ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}

      {writable && matchModeConfirm && (
        <>
          <div className="modal-overlay" onClick={closeMatchModeConfirmModal} />
          <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Confirmer le changement de mode des matchs">
            <div className="drill-modal-head">
              <h3>{matchModeConfirm === 'TO_MANUAL' ? 'Passer en manuel ?' : 'Passer en rotation ?'}</h3>
              <button type="button" onClick={closeMatchModeConfirmModal}>✕</button>
            </div>
            <p className="muted-line">
              {matchModeConfirm === 'TO_MANUAL'
                ? 'La rotation actuelle sera supprimée pour revenir à une gestion manuelle des matchs.'
                : 'Les matchs manuels actuels seront remplacés par les matchs issus de la rotation.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={closeMatchModeConfirmModal}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', padding: '8px 12px' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmMatchModeSwitch()}
                style={{ border: '1px solid #0b65c2', borderRadius: 8, background: '#0b65c2', color: '#fff', padding: '8px 12px' }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
