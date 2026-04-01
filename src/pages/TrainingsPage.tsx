import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { canLoadMore, mergeById, nextOffset, normalizePaginatedResponse, withPagination } from '../adapters/pagination'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import CtaButton from '../components/CtaButton'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SoccerBallIcon, TrophyIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import { uiAlert } from '../ui'
import type { Matchday, Training } from '../types/api'
import './TrainingsPage.css'

const LAST_PLANNING_DATE_KEY = 'izifoot.planning.lastDate'
const TRAININGS_PAGE_LIMIT = 30
const MATCHDAYS_PAGE_LIMIT = 30

function yyyyMmDd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toDateOnly(dateISO: string) {
  const d = new Date(dateISO)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, amount: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + amount)
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return parsed
}

function readStoredPlanningDate() {
  if (typeof window === 'undefined') return null
  return parseDateParam(window.localStorage.getItem(LAST_PLANNING_DATE_KEY))
}

function formatDateTitle(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function formatTrainingTimeLabel(dateISO: string) {
  const date = new Date(dateISO)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatTrainingTimeRange(dateISO: string, endTime?: string | null) {
  const startTime = formatTrainingTimeLabel(dateISO)
  if (!startTime) return null
  if (!endTime) return startTime
  return `${startTime} - ${endTime}`
}

export default function TrainingsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection, teamOptions } = useTeamScope()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [trainings, setTrainings] = useState<Training[]>([])
  const [matchdays, setMatchdays] = useState<Matchday[]>([])
  const [trainingsPagination, setTrainingsPagination] = useState({ limit: TRAININGS_PAGE_LIMIT, offset: 0, returned: 0 })
  const [matchdaysPagination, setMatchdaysPagination] = useState({ limit: MATCHDAYS_PAGE_LIMIT, offset: 0, returned: 0 })
  const [loadingMoreTrainings, setLoadingMoreTrainings] = useState(false)
  const [loadingMoreMatchdays, setLoadingMoreMatchdays] = useState(false)
  const [updatingIntentTrainingIds, setUpdatingIntentTrainingIds] = useState<Set<string>>(new Set())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isPlateauModalOpen, setIsPlateauModalOpen] = useState(false)
  const [plateauLocation, setPlateauLocation] = useState('')
  const [isCreatingPlateau, setIsCreatingPlateau] = useState(false)
  const [pickerMonth, setPickerMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const writable = me ? canWrite(me.role) : false
  const isReadOnlyPlanningRole = me?.role === 'PLAYER' || me?.role === 'PARENT'
  const teamScopedWritable = writable && (!requiresSelection || Boolean(selectedTeamId))
  const teamNameById = useMemo(() => new Map(teamOptions.map((team) => [team.id, team.name])), [teamOptions])
  const coachManagedTeams = useMemo(() => {
    if (!me || me.role !== 'COACH') return null
    return new Set(me.managedTeamIds)
  }, [me])
  const canLoadMoreTrainings = useMemo(() => canLoadMore(trainingsPagination), [trainingsPagination])
  const canLoadMoreMatchdays = useMemo(() => canLoadMore(matchdaysPagination), [matchdaysPagination])

  // Load trainings + matchdays
  const loadTrainings = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [rawTrainings, rawMatchdays] = await Promise.all([
      apiGet<unknown>(withPagination(apiRoutes.trainings.list, { limit: TRAININGS_PAGE_LIMIT, offset: 0 })),
      apiGet<unknown>(withPagination(apiRoutes.matchday.list, { limit: MATCHDAYS_PAGE_LIMIT, offset: 0 })),
    ])
    const trainingsPage = normalizePaginatedResponse<Training>(rawTrainings, { limit: TRAININGS_PAGE_LIMIT, offset: 0 })
    const matchdaysPage = normalizePaginatedResponse<Matchday>(rawMatchdays, { limit: MATCHDAYS_PAGE_LIMIT, offset: 0 })
    if (isCancelled()) return
    const filteredByCoachTrainings = coachManagedTeams
      ? trainingsPage.items.filter((training) => !training.teamId || coachManagedTeams.has(training.teamId))
      : trainingsPage.items
    const filteredByCoachMatchdays = coachManagedTeams
      ? matchdaysPage.items.filter((plateau) => !plateau.teamId || coachManagedTeams.has(plateau.teamId))
      : matchdaysPage.items

    const filteredTrainings = requiresSelection && !selectedTeamId
      ? []
      : selectedTeamId
        ? filteredByCoachTrainings.filter((training) => !training.teamId || training.teamId === selectedTeamId)
        : filteredByCoachTrainings
    const filteredMatchdays = requiresSelection && !selectedTeamId
      ? []
      : selectedTeamId
        ? filteredByCoachMatchdays.filter((plateau) => !plateau.teamId || plateau.teamId === selectedTeamId)
        : filteredByCoachMatchdays

    filteredTrainings.sort((a, b) => +new Date(b.date) - +new Date(a.date))
    setTrainings(filteredTrainings)
    setMatchdays(filteredMatchdays)
    setTrainingsPagination(trainingsPage.pagination)
    setMatchdaysPagination(matchdaysPage.pagination)
  }, [coachManagedTeams, requiresSelection, selectedTeamId])

  const { loading, error } = useAsyncLoader(loadTrainings)
  // Derived data for selected day
  const selectedDate = useMemo(
    () => parseDateParam(searchParams.get('date')) ?? readStoredPlanningDate() ?? new Date(),
    [searchParams]
  )
  const selectedDayKey = useMemo(() => yyyyMmDd(selectedDate), [selectedDate])
  const todayKey = useMemo(() => yyyyMmDd(new Date()), [])
  const isTodaySelected = selectedDayKey === todayKey

  useEffect(() => {
    window.localStorage.setItem(LAST_PLANNING_DATE_KEY, selectedDayKey)
  }, [selectedDayKey])

  useEffect(() => {
    const currentParam = searchParams.get('date')
    if (currentParam === selectedDayKey) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('date', selectedDayKey)
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, selectedDayKey, setSearchParams])

  function setSelectedDay(nextDate: Date) {
    const nextDayKey = yyyyMmDd(nextDate)
    if (nextDayKey === selectedDayKey) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('date', nextDayKey)
    setSearchParams(nextParams)
  }

  async function loadMoreTrainingsList() {
    if (loadingMoreTrainings || !canLoadMoreTrainings) return
    const offset = nextOffset(trainingsPagination)
    setLoadingMoreTrainings(true)
    try {
      const raw = await apiGet<unknown>(withPagination(apiRoutes.trainings.list, { limit: TRAININGS_PAGE_LIMIT, offset }))
      const page = normalizePaginatedResponse<Training>(raw, { limit: TRAININGS_PAGE_LIMIT, offset })
      const byCoach = coachManagedTeams
        ? page.items.filter((training) => !training.teamId || coachManagedTeams.has(training.teamId))
        : page.items
      const scoped = requiresSelection && !selectedTeamId
        ? []
        : selectedTeamId
          ? byCoach.filter((training) => !training.teamId || training.teamId === selectedTeamId)
          : byCoach
      setTrainings((prev) => {
        const merged = mergeById(prev, scoped)
        return merged.sort((a, b) => +new Date(b.date) - +new Date(a.date))
      })
      setTrainingsPagination(page.pagination)
    } catch (err: unknown) {
      uiAlert(`Erreur chargement entraînements: ${toErrorMessage(err)}`)
    } finally {
      setLoadingMoreTrainings(false)
    }
  }

  async function loadMoreMatchdaysList() {
    if (loadingMoreMatchdays || !canLoadMoreMatchdays) return
    const offset = nextOffset(matchdaysPagination)
    setLoadingMoreMatchdays(true)
    try {
      const raw = await apiGet<unknown>(withPagination(apiRoutes.matchday.list, { limit: MATCHDAYS_PAGE_LIMIT, offset }))
      const page = normalizePaginatedResponse<Matchday>(raw, { limit: MATCHDAYS_PAGE_LIMIT, offset })
      const byCoach = coachManagedTeams
        ? page.items.filter((plateau) => !plateau.teamId || coachManagedTeams.has(plateau.teamId))
        : page.items
      const scoped = requiresSelection && !selectedTeamId
        ? []
        : selectedTeamId
          ? byCoach.filter((plateau) => !plateau.teamId || plateau.teamId === selectedTeamId)
          : byCoach
      setMatchdays((prev) => mergeById(prev, scoped))
      setMatchdaysPagination(page.pagination)
    } catch (err: unknown) {
      uiAlert(`Erreur chargement plateaux: ${toErrorMessage(err)}`)
    } finally {
      setLoadingMoreMatchdays(false)
    }
  }

  const dayTrainings = useMemo(() => {
    return trainings.filter(t => yyyyMmDd(toDateOnly(t.date)) === selectedDayKey)
  }, [trainings, selectedDayKey])
  const dayMatchdays = useMemo(() => {
    return matchdays.filter(p => yyyyMmDd(toDateOnly(p.date)) === selectedDayKey)
  }, [matchdays, selectedDayKey])
  const trainingDayKeys = useMemo(() => {
    return new Set(trainings.map((t) => yyyyMmDd(toDateOnly(t.date))))
  }, [trainings])
  const matchdayDayKeys = useMemo(() => {
    return new Set(matchdays.map((p) => yyyyMmDd(toDateOnly(p.date))))
  }, [matchdays])
  const matchdayLocations = useMemo(() => {
    const uniqueLocations = new Set(
      matchdays
        .map((p) => p.lieu.trim())
        .filter(Boolean),
    )
    return Array.from(uniqueLocations).sort((a, b) => a.localeCompare(b, 'fr-FR'))
  }, [matchdays])
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
      }).format(pickerMonth),
    [pickerMonth],
  )
  const calendarCells = useMemo(() => {
    const firstDay = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1)
    const startOffset = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 0).getDate()
    return Array.from({ length: startOffset + daysInMonth }, (_, idx) => idx - startOffset + 1)
  }, [pickerMonth])

  // Auto-select not needed (details now on dedicated page)

  function openPlateauModal() {
    setPlateauLocation('')
    setIsPlateauModalOpen(true)
  }

  function closePlateauModal() {
    if (isCreatingPlateau) return
    setPlateauLocation('')
    setIsPlateauModalOpen(false)
  }

  async function createPlateauForDay(day: Date, lieu: string) {
    if (!teamScopedWritable) return
    const normalizedLieu = lieu.trim()
    if (!normalizedLieu) return
    setIsCreatingPlateau(true)
    try {
      const activeTeam = teamOptions.find((team) => team.id === selectedTeamId)
      const created = await apiPost<Matchday>(apiRoutes.matchday.list, {
        date: day.toISOString(),
        lieu: normalizedLieu,
        teamId: selectedTeamId || undefined,
        team_id: selectedTeamId || undefined,
        teamName: activeTeam?.name || undefined,
        activeTeamId: selectedTeamId || undefined,
        active_team_id: selectedTeamId || undefined,
      })
      setMatchdays(prev => [created, ...prev])
      setPlateauLocation('')
      setIsPlateauModalOpen(false)
      navigate(`/matchday/${created.id}?date=${selectedDayKey}`)
    } catch (err: unknown) {
      uiAlert(`Erreur création plateau: ${toErrorMessage(err)}`)
    } finally {
      setIsCreatingPlateau(false)
    }
  }

  // Plateau match helpers: edit, save, delete

  async function createTrainingForDay(day: Date) {
    if (!teamScopedWritable) return
    try {
      const activeTeam = teamOptions.find((team) => team.id === selectedTeamId)
      const created = await apiPost<Training>(apiRoutes.trainings.list, {
        date: day.toISOString(),
        teamId: selectedTeamId || undefined,
        team_id: selectedTeamId || undefined,
        teamName: activeTeam?.name || undefined,
        activeTeamId: selectedTeamId || undefined,
        active_team_id: selectedTeamId || undefined,
      })
      setTrainings(prev => [created, ...prev])
    } catch (err: unknown) {
      uiAlert(`Erreur création entraînement: ${toErrorMessage(err)}`)
    }
  }

  async function setTrainingIntent(trainingId: string, present: boolean) {
    setUpdatingIntentTrainingIds((prev) => new Set(prev).add(trainingId))
    const previousTrainings = trainings
    setTrainings((prev) => prev.map((training) => {
      if (training.id !== trainingId) return training
      const previousIntent = training.myTrainingIntent ?? null
      const previousSummary = training.intentSummary ?? null
      const nextIntent: Training['myTrainingIntent'] = present ? 'PRESENT' : 'ABSENT'
      let nextSummary = previousSummary
      if (previousSummary) {
        let presentCount = previousSummary.presentCount
        let absentCount = previousSummary.absentCount
        if (previousIntent === 'PRESENT') presentCount = Math.max(0, presentCount - 1)
        if (previousIntent === 'ABSENT') absentCount = Math.max(0, absentCount - 1)
        if (nextIntent === 'PRESENT') presentCount += 1
        if (nextIntent === 'ABSENT') absentCount += 1
        const unknownCount = Math.max(0, previousSummary.totalPlayers - presentCount - absentCount)
        nextSummary = { ...previousSummary, presentCount, absentCount, unknownCount }
      }
      return { ...training, myTrainingIntent: nextIntent, intentSummary: nextSummary }
    }))

    try {
      await apiPost(apiRoutes.trainings.intent(trainingId), { present })
    } catch (err: unknown) {
      setTrainings(previousTrainings)
      uiAlert(`Erreur intention de présence: ${toErrorMessage(err)}`)
    } finally {
      setUpdatingIntentTrainingIds((prev) => {
        const next = new Set(prev)
        next.delete(trainingId)
        return next
      })
    }
  }

  return (
    <div className="trainings-page">
      <div className="trainings-main">
        <header className="trainings-date-header">
          <div className="trainings-date-row">
            <RoundIconButton ariaLabel="Jour précédent" onClick={() => setSelectedDay(addDays(selectedDate, -1))}>
              <ChevronLeftIcon size={18} />
            </RoundIconButton>
            <button
              type="button"
              onClick={() => setSelectedDay(new Date())}
              aria-label="Revenir à aujourd'hui"
              className="trainings-date-title-btn"
            >
              {isTodaySelected ? "Aujourd'hui" : formatDateTitle(selectedDate)}
            </button>
            <div className="trainings-date-actions">
              <RoundIconButton ariaLabel="Jour suivant" onClick={() => setSelectedDay(addDays(selectedDate, 1))}>
                <ChevronRightIcon size={18} />
              </RoundIconButton>
              <RoundIconButton
                ariaLabel="Choisir une date"
                onClick={() => {
                  setPickerMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
                  setIsDatePickerOpen((prev) => !prev)
                }}
              >
                <CalendarIcon size={18} />
              </RoundIconButton>
            </div>
          </div>
        </header>

        <section className="trainings-block">
          <div className="trainings-block-title">Entraînements</div>
          {!teamScopedWritable && (
            <div className="trainings-empty">Mode lecture seule: création et modifications désactivées.</div>
          )}
          {writable && requiresSelection && !selectedTeamId && (
            <div className="trainings-empty">Sélectionnez une équipe active pour modifier les données.</div>
          )}
          {dayTrainings.length === 0 ? (
            <div className="trainings-empty">Aucun entraînement ce jour.</div>
          ) : (
            dayTrainings.map((t) => (
              <Link
                key={t.id}
                to={`/training/${t.id}?date=${selectedDayKey}`}
                className="trainings-item"
              >
                <span className="trainings-item-row">
                  <span className="trainings-item-left">
                    {t.status === 'CANCELLED' ? <span style={{ fontSize: 24 }}>❌</span> : <SoccerBallIcon size={24} />}
                    <span style={{ display: 'grid', gap: 2 }}>
                      <span>Entraînement</span>
                      {formatTrainingTimeRange(t.date, t.endTime) && (
                        <small style={{ color: '#64748b' }}>
                          Horaire: {formatTrainingTimeRange(t.date, t.endTime)}
                        </small>
                      )}
                      {(me?.role === 'COACH' || me?.role === 'DIRECTION') && t.intentSummary && (
                        <small style={{ color: '#64748b' }}>
                          Intentions: {t.intentSummary.presentCount}/{t.intentSummary.totalPlayers} présents
                        </small>
                      )}
                      {me?.role === 'DIRECTION' && (
                        <small style={{ color: '#64748b' }}>
                          Équipe: {t.teamId ? (teamNameById.get(t.teamId) || t.teamId) : 'Non renseignée'}
                        </small>
                      )}
                    </span>
                  </span>
                  <span className="trainings-item-right">
                    <ChevronRightIcon size={24} />
                  </span>
                </span>
              </Link>
            ))
          )}
          {isReadOnlyPlanningRole && dayTrainings.length > 0 && (
            <div className="trainings-block-footer" style={{ display: 'grid', gap: 8 }}>
              {dayTrainings.map((training) => {
                const isLoadingIntent = updatingIntentTrainingIds.has(training.id)
                const canSetIntent = Boolean(training.canSetTrainingIntent)
                return (
                  <div key={`intent-${training.id}`} style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      Intention de présence
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={!canSetIntent || isLoadingIntent}
                        onClick={() => { void setTrainingIntent(training.id, true) }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: training.myTrainingIntent === 'PRESENT' ? '1px solid #16a34a' : '1px solid #d1d5db',
                          background: training.myTrainingIntent === 'PRESENT' ? '#dcfce7' : '#fff',
                          cursor: canSetIntent ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Présent
                      </button>
                      <button
                        type="button"
                        disabled={!canSetIntent || isLoadingIntent}
                        onClick={() => { void setTrainingIntent(training.id, false) }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: training.myTrainingIntent === 'ABSENT' ? '1px solid #dc2626' : '1px solid #d1d5db',
                          background: training.myTrainingIntent === 'ABSENT' ? '#fee2e2' : '#fff',
                          cursor: canSetIntent ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {(teamScopedWritable || canLoadMoreTrainings) && (
            <div className="trainings-block-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {teamScopedWritable && (
                <CtaButton onClick={() => createTrainingForDay(selectedDate)}>
                  Ajouter un entraînement
                </CtaButton>
              )}
              {canLoadMoreTrainings && (
                <button
                  type="button"
                  onClick={() => { void loadMoreTrainingsList() }}
                  disabled={loading || loadingMoreTrainings}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#fff', cursor: 'pointer' }}
                >
                  {loadingMoreTrainings ? 'Chargement...' : 'Charger plus'}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="trainings-block">
          <div className="trainings-block-title">Plateaux</div>
          {dayMatchdays.length === 0 ? (
            <div className="trainings-empty">Aucun plateau ce jour.</div>
          ) : (
            dayMatchdays.map((p) => (
              <Link
                key={p.id}
                to={`/matchday/${p.id}?date=${selectedDayKey}`}
                className="trainings-item"
              >
                <span className="trainings-item-row">
                  <span className="trainings-item-left">
                    <TrophyIcon size={24} />
                    <span style={{ display: 'grid', gap: 2 }}>
                      <span>Plateau — {p.lieu}</span>
                      {me?.role === 'DIRECTION' && (
                        <small style={{ color: '#64748b' }}>
                          Équipe: {p.teamId ? (teamNameById.get(p.teamId) || p.teamId) : 'Non renseignée'}
                        </small>
                      )}
                    </span>
                  </span>
                  <span className="trainings-item-right">
                    <ChevronRightIcon size={24} />
                  </span>
                </span>
              </Link>
            ))
          )}
          {(teamScopedWritable || canLoadMoreMatchdays) && (
            <div className="trainings-block-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {teamScopedWritable && (
                <CtaButton onClick={openPlateauModal}>
                  Ajouter un plateau
                </CtaButton>
              )}
              {canLoadMoreMatchdays && (
                <button
                  type="button"
                  onClick={() => { void loadMoreMatchdaysList() }}
                  disabled={loading || loadingMoreMatchdays}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#fff', cursor: 'pointer' }}
                >
                  {loadingMoreMatchdays ? 'Chargement...' : 'Charger plus'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <aside>
        {(loading || loadingMoreTrainings || loadingMoreMatchdays) && <p>Chargement…</p>}
        {error && <p className="trainings-aside-error">{error}</p>}
      </aside>

      {isDatePickerOpen && (
        <div onClick={() => setIsDatePickerOpen(false)} className="trainings-overlay">
          <div
            onClick={(e) => e.stopPropagation()}
            className="trainings-calendar-modal"
          >
            <div className="trainings-calendar-head">
              <RoundIconButton
                ariaLabel="Mois précédent"
                onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <ChevronLeftIcon size={18} />
              </RoundIconButton>
              <strong className="trainings-month-label">{monthLabel}</strong>
              <RoundIconButton
                ariaLabel="Mois suivant"
                onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <ChevronRightIcon size={18} />
              </RoundIconButton>
            </div>

            <div className="trainings-weekdays">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={`${d}-${i}`} className="trainings-weekday">{d}</div>
              ))}
              {calendarCells.map((day, idx) => {
                if (day <= 0) {
                  return <div key={`empty-${idx}`} />
                }
                const candidate = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day)
                const dayKey = yyyyMmDd(candidate)
                const isSelected = dayKey === selectedDayKey
                const hasTraining = trainingDayKeys.has(dayKey)
                const hasMatchday = matchdayDayKeys.has(dayKey)
                return (
                  <button
                    key={`${pickerMonth.getFullYear()}-${pickerMonth.getMonth()}-${day}`}
                    type="button"
                    onClick={() => {
                      setSelectedDay(candidate)
                      setIsDatePickerOpen(false)
                    }}
                    className={`trainings-day-btn ${isSelected ? 'trainings-day-btn--selected' : 'trainings-day-btn--default'}`}
                  >
                    <span>{day}</span>
                    <span className="trainings-day-dots">
                      {hasTraining && <span className="trainings-dot-training" />}
                      {hasMatchday && <span className="trainings-dot-plateau" />}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="trainings-legend">
              <span className="trainings-legend-item">
                <span className="trainings-legend-dot-training" />
                Entraînement
              </span>
              <span className="trainings-legend-item">
                <span className="trainings-legend-dot-plateau" />
                Plateau
              </span>
            </div>
          </div>
        </div>
      )}

      {teamScopedWritable && isPlateauModalOpen && (
        <div onClick={closePlateauModal} className="trainings-overlay">
          <div
            onClick={(e) => e.stopPropagation()}
            className="trainings-plateau-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plateau-modal-title"
          >
            <div className="trainings-plateau-modal-head">
              <strong id="plateau-modal-title">Créer un plateau</strong>
              <button
                type="button"
                onClick={closePlateauModal}
                className="trainings-modal-close"
                aria-label="Fermer"
                disabled={isCreatingPlateau}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void createPlateauForDay(selectedDate, plateauLocation)
              }}
              className="trainings-plateau-form"
            >
              <label htmlFor="plateau-location" className="trainings-field-label">
                Lieu du plateau
              </label>
              <input
                id="plateau-location"
                value={plateauLocation}
                onChange={(e) => setPlateauLocation(e.target.value)}
                placeholder="Ex. Stade municipal"
                className="trainings-text-input"
                autoFocus
                disabled={isCreatingPlateau}
              />

              {matchdayLocations.length > 0 && (
                <div className="trainings-location-picker">
                  <span className="trainings-location-picker-label">Lieux déjà utilisés</span>
                  <div className="trainings-location-chips">
                    {matchdayLocations.map((location) => (
                      <button
                        key={location}
                        type="button"
                        onClick={() => setPlateauLocation(location)}
                        className={`trainings-location-chip ${plateauLocation.trim() === location ? 'trainings-location-chip--active' : ''}`}
                        disabled={isCreatingPlateau}
                      >
                        {location}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="trainings-modal-actions">
                <button
                  type="button"
                  onClick={closePlateauModal}
                  className="trainings-secondary-btn"
                  disabled={isCreatingPlateau}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="trainings-primary-btn"
                  disabled={isCreatingPlateau || !plateauLocation.trim()}
                >
                  {isCreatingPlateau ? 'Création…' : 'Continuer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
