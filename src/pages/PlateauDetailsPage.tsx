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
import CtaButton from '../components/CtaButton'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert, uiConfirm } from '../ui'
import type { AttendanceRow, ClubMe, MatchLite, Plateau, Player } from '../types/api'
import './TrainingDetailsPage.css'

const TEAM_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c2410c',
  '#9333ea', '#0f766e', '#be123c', '#1d4ed8', '#15803d',
  '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4338ca',
]

const PLATEAU_PLANNING_MAP_KEY = 'izifoot.plateauPlanningMap'

function readPlateauPlanningMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>
  try {
    const raw = window.localStorage.getItem(PLATEAU_PLANNING_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writePlateauPlanningMap(next: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PLATEAU_PLANNING_MAP_KEY, JSON.stringify(next))
}

function setPlateauPlanningLink(plateauId: string, planningId: string) {
  const current = readPlateauPlanningMap()
  writePlateauPlanningMap({ ...current, [plateauId]: planningId })
}

function getPlateauPlanningLink(plateauId: string) {
  const current = readPlateauPlanningMap()
  return current[plateauId] || ''
}

function clearPlateauPlanningLink(plateauId: string) {
  const current = readPlateauPlanningMap()
  if (!current[plateauId]) return
  const { [plateauId]: _deleted, ...rest } = current
  writePlateauPlanningMap(rest)
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
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

export default function PlateauDetailsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection, teamOptions } = useTeamScope()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [clubName, setClubName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [plateauAttendance, setPlateauAttendance] = useState<Set<string>>(new Set())
  const [plateauMatches, setPlateauMatches] = useState<MatchLite[]>([])
  const [plateauPlannings, setPlateauPlannings] = useState<Planning[]>([])
  const [isPlayersModalOpen, setIsPlayersModalOpen] = useState(false)
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
    const [p, ps, matches, attends, plannings, club] = await Promise.all([
      apiGet<Plateau>(apiRoutes.plateaus.byId(id)),
      apiGet<Player[]>(apiRoutes.players.list),
      apiGet<MatchLite[]>(apiRoutes.matches.byPlateau(id)),
      apiGet<AttendanceRow[]>(apiRoutes.attendance.bySession('PLATEAU', id)),
      api.listPlannings(),
      apiGet<ClubMe>(apiRoutes.clubs.me).catch(() => null),
    ])
    if (isCancelled()) return
    setPlateau(p)
    setClubName(club?.name?.trim() || '')
    setPlayers(ps)
    setPlateauMatches(matches)
    setPlateauAttendance(new Set(attends.map(a => a.playerId)))
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
    const opponentSeenCount = new Map<string, number>()
    const matchesByOpponent = new Map<string, MatchLite[]>()
    const activePlateauTeamName = (() => {
      const activeId = selectedTeamId || plateau?.teamId
      if (!activeId) return ''
      return teamOptions.find((team) => team.id === activeId)?.name || ''
    })()
    const clubPlanningTeam = findPlanningTeamLabel(plateauPlanningTeams, [clubName, activePlateauTeamName])
    for (const match of plateauMatches) {
      const key = (match.opponentName || '').trim()
      if (!matchesByOpponent.has(key)) matchesByOpponent.set(key, [])
      matchesByOpponent.get(key)?.push(match)
    }
    return visiblePlanningSlots.map((slot) => ({
      ...slot,
      games: slot.games.map((game) => {
        const isClubGame = Boolean(clubPlanningTeam) && (game.A === clubPlanningTeam || game.B === clubPlanningTeam)
        const opponent = isClubGame
          ? (game.A === clubPlanningTeam ? game.B : game.A)
          : ''
        let linkedMatch: MatchLite | null = null
        if (isClubGame) {
          const occurrence = opponentSeenCount.get(opponent) ?? 0
          opponentSeenCount.set(opponent, occurrence + 1)
          linkedMatch = matchesByOpponent.get(opponent)?.[occurrence] ?? null
        }
        return { ...game, isClubGame, opponent, linkedMatch }
      }),
    }))
  }, [clubName, plateau?.teamId, plateauMatches, plateauPlanningTeams, selectedTeamId, teamOptions, visiblePlanningSlots])
  const rotationDisplaySlots = useMemo(() => (
    visibleRotationMatches.map((slot) => ({
      key: slot.time,
      time: slot.time,
      games: slot.games.map((game) => ({
        key: `${slot.time}-${game.pitch}-${game.A}-${game.B}`,
        pitch: game.pitch,
        teamA: game.A,
        teamB: game.B,
        teamAColor: plateauPlanningTeamColorMap.get(game.A) ?? TEAM_COLORS[0],
        teamBColor: plateauPlanningTeamColorMap.get(game.B) ?? TEAM_COLORS[1],
        isClickable: game.isClubGame && Boolean(game.linkedMatch),
        showLinkIndicator: game.isClubGame && Boolean(game.linkedMatch),
        scoreLabel: game.isClubGame && game.linkedMatch && (
          (game.linkedMatch.teams.find((team) => team.side === 'home')?.score ?? 0) !== 0
          || (game.linkedMatch.teams.find((team) => team.side === 'away')?.score ?? 0) !== 0
          || (game.linkedMatch.scorers?.length ?? 0) > 0
        )
          ? `${game.linkedMatch.teams.find((team) => team.side === 'home')?.score ?? 0} - ${game.linkedMatch.teams.find((team) => team.side === 'away')?.score ?? 0}`
          : null,
        onOpen: game.isClubGame && game.linkedMatch ? () => navigate(`/match/${game.linkedMatch?.id}`) : undefined,
      })),
    }))
  ), [navigate, plateauPlanningTeamColorMap, visibleRotationMatches])
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
        const isNotPlayed = homeScoreValue === 0 && awayScoreValue === 0 && (match.scorers?.length ?? 0) === 0
        return {
          key: match.id,
          teamA: clubName || activePlateauTeamName || 'Nous',
          teamB: match.opponentName || 'Adversaire',
          teamAColor: '#1d4ed8',
          teamBColor: '#64748b',
          isClickable: true,
          showLinkIndicator: false,
          scoreLabel: isNotPlayed ? null : `${homeScoreValue} - ${awayScoreValue}`,
          onOpen: () => navigate(`/match/${match.id}`),
        }
      }),
    }]
  }, [clubName, matchSourceMode, navigate, plateau?.teamId, plateauMatches, selectedTeamId, teamOptions])
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
  const presentPlayers = useMemo(
    () => players.filter((p) => plateauAttendance.has(p.id)),
    [players, plateauAttendance]
  )
  const publicPlateauUrl = useMemo(() => sharedPublicUrl, [sharedPublicUrl])
  const writable = me ? canWrite(me.role) && (!requiresSelection || Boolean(selectedTeamId)) : false

  useEffect(() => {
    setMatchSourceMode(plateauPlanning ? 'ROTATION' : 'MANUAL')
  }, [plateauPlanning?.id])

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

  async function deletePlateau() {
    if (!writable) return
    if (!id) return
    setDeletingPlateau(true)
    try {
      await apiDelete(apiRoutes.plateaus.byId(id))
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
      const updated = await apiPut<Plateau>(apiRoutes.plateaus.byId(id), patch)
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
      const data = await apiPost<{ token: string; url?: string }>(apiRoutes.plateaus.share(id), {})
      const fallbackUrl = `${window.location.origin}/plateau/public/${encodeURIComponent(data.token)}`
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
            plateauId: id,
            sides: {
              home: { starters: [], subs: [] },
              away: { starters: [], subs: [] },
            },
            score: { home: 0, away: 0 },
            buteurs: [],
            opponentName: matchItem.opponent,
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
        plateauId: id,
        sides: {
          home: { starters: [], subs: [] },
          away: { starters: [], subs: [] },
        },
        score: { home: isMatchNotPlayed ? 0 : homeScore, away: isMatchNotPlayed ? 0 : awayScore },
        buteurs: isMatchNotPlayed ? [] : scorers.map((playerId) => ({ playerId, side: 'home' as const })),
        opponentName: opponentName.trim(),
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

            <section
              className={`details-card players-presence-card ${!writable ? 'is-disabled' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setIsPlayersModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsPlayersModalOpen(true)
                }
              }}
              aria-label="Ouvrir la sélection des joueurs présents"
            >
              <div className="card-head">
                <h3>Joueurs</h3>
                <div className="head-actions">
                  <span>{plateauAttendance.size}/{players.length}</span>
                </div>
              </div>
              <div className="players-avatar-stack">
                {presentPlayers.length === 0 ? (
                  <p className="muted-line">Aucun joueur présent.</p>
                ) : (
                  presentPlayers.slice(0, 12).map((player) => {
                    const maybeAvatar =
                      (player as Player & { avatarUrl?: string | null; avatar?: string | null; photoUrl?: string | null; imageUrl?: string | null }).avatarUrl
                      || (player as Player & { avatar?: string | null }).avatar
                      || (player as Player & { photoUrl?: string | null }).photoUrl
                      || (player as Player & { imageUrl?: string | null }).imageUrl
                    const initials = getInitials(player.name)
                    return (
                      <div key={player.id} className="player-avatar-chip" title={player.name}>
                        {maybeAvatar ? (
                          <img src={maybeAvatar} alt={player.name} />
                        ) : (
                          <span style={{ background: colorFromName(player.name) }}>{initials}</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
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
                  {plateauPlanning ? (
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
                  ) : (
                    <div className="matches-section-body">
                      <div className="rotation-empty-state">Aucune rotation enregistrée pour ce plateau.</div>
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

      {isPlayersModalOpen && (
        <>
          <div className="modal-overlay" onClick={() => setIsPlayersModalOpen(false)} />
          <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Sélection des joueurs présents">
            <div className="drill-modal-head">
              <h3>Joueurs présents</h3>
              <button type="button" onClick={() => setIsPlayersModalOpen(false)}>✕</button>
            </div>
            {!writable && <p className="muted-line">Mode lecture seule: sélection indisponible.</p>}
            <div className="attendance-list-simple">
              {players.map((p) => {
                const present = plateauAttendance.has(p.id)
                return (
                  <label key={p.id} className="attendance-row">
                    <span>{getFirstName(p.name)}</span>
                    <input
                      type="checkbox"
                      checked={present}
                      disabled={!writable}
                      onChange={(e) => void togglePlateauPresence(p.id, e.target.checked)}
                    />
                  </label>
                )
              })}
            </div>
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
