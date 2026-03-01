import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import CtaButton from '../components/CtaButton'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SoccerBallIcon, TrophyIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert } from '../ui'
import type { Plateau, Training } from '../types/api'
import './TrainingsPage.css'


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

function formatDateTitle(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export default function TrainingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plateaus, setPlateaus] = useState<Plateau[]>([])
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isPlateauModalOpen, setIsPlateauModalOpen] = useState(false)
  const [plateauLocation, setPlateauLocation] = useState('')
  const [isCreatingPlateau, setIsCreatingPlateau] = useState(false)
  const [pickerMonth, setPickerMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Load trainings + plateaus
  const { loading, error } = useAsyncLoader(async ({ isCancelled }) => {
    const [ts, pls] = await Promise.all([
      apiGet<Training[]>(apiRoutes.trainings.list),
      apiGet<Plateau[]>(apiRoutes.plateaus.list),
    ])
    if (isCancelled()) return
    ts.sort((a, b) => +new Date(b.date) - +new Date(a.date))
    setTrainings(ts)
    setPlateaus(pls)
  }, [])
  // Derived data for selected day
  const selectedDate = useMemo(() => parseDateParam(searchParams.get('date')) ?? new Date(), [searchParams])
  const selectedDayKey = useMemo(() => yyyyMmDd(selectedDate), [selectedDate])
  const todayKey = useMemo(() => yyyyMmDd(new Date()), [])
  const isTodaySelected = selectedDayKey === todayKey

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

  const dayTrainings = useMemo(() => {
    return trainings.filter(t => yyyyMmDd(toDateOnly(t.date)) === selectedDayKey)
  }, [trainings, selectedDayKey])
  const dayPlateaus = useMemo(() => {
    return plateaus.filter(p => yyyyMmDd(toDateOnly(p.date)) === selectedDayKey)
  }, [plateaus, selectedDayKey])
  const trainingDayKeys = useMemo(() => {
    return new Set(trainings.map((t) => yyyyMmDd(toDateOnly(t.date))))
  }, [trainings])
  const plateauDayKeys = useMemo(() => {
    return new Set(plateaus.map((p) => yyyyMmDd(toDateOnly(p.date))))
  }, [plateaus])
  const plateauLocations = useMemo(() => {
    const uniqueLocations = new Set(
      plateaus
        .map((p) => p.lieu.trim())
        .filter(Boolean),
    )
    return Array.from(uniqueLocations).sort((a, b) => a.localeCompare(b, 'fr-FR'))
  }, [plateaus])
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
    const normalizedLieu = lieu.trim()
    if (!normalizedLieu) return
    setIsCreatingPlateau(true)
    try {
      const created = await apiPost<Plateau>(apiRoutes.plateaus.list, {
        date: day.toISOString(),
        lieu: normalizedLieu,
      })
      setPlateaus(prev => [created, ...prev])
      setPlateauLocation('')
      setIsPlateauModalOpen(false)
      navigate(`/plateau/${created.id}`)
    } catch (err: unknown) {
      uiAlert(`Erreur création plateau: ${toErrorMessage(err)}`)
    } finally {
      setIsCreatingPlateau(false)
    }
  }

  // Plateau match helpers: edit, save, delete

  async function createTrainingForDay(day: Date) {
    try {
      const created = await apiPost<Training>(apiRoutes.trainings.list, { date: day.toISOString() })
      setTrainings(prev => [created, ...prev])
    } catch (err: unknown) {
      uiAlert(`Erreur création entraînement: ${toErrorMessage(err)}`)
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
                    Entraînement
                  </span>
                  <span className="trainings-item-right">
                    <ChevronRightIcon size={24} />
                  </span>
                </span>
              </Link>
            ))
          )}
          <div className="trainings-block-footer">
            <CtaButton onClick={() => createTrainingForDay(selectedDate)}>
              Ajouter un entraînement
            </CtaButton>
          </div>
        </section>

        <section className="trainings-block">
          <div className="trainings-block-title">Plateaux</div>
          {dayPlateaus.length === 0 ? (
            <div className="trainings-empty">Aucun plateau ce jour.</div>
          ) : (
            dayPlateaus.map((p) => (
              <Link
                key={p.id}
                to={`/plateau/${p.id}`}
                className="trainings-item"
              >
                <span className="trainings-item-row">
                  <span className="trainings-item-left">
                    <TrophyIcon size={24} />
                    Plateau — {p.lieu}
                  </span>
                  <span className="trainings-item-right">
                    <ChevronRightIcon size={24} />
                  </span>
                </span>
              </Link>
            ))
          )}
          <div className="trainings-block-footer">
            <CtaButton onClick={openPlateauModal}>
              Ajouter un plateau
            </CtaButton>
          </div>
        </section>
      </div>

      <aside>
        {loading && <p>Chargement…</p>}
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
                const hasPlateau = plateauDayKeys.has(dayKey)
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
                      {hasPlateau && <span className="trainings-dot-plateau" />}
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

      {isPlateauModalOpen && (
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

              {plateauLocations.length > 0 && (
                <div className="trainings-location-picker">
                  <span className="trainings-location-picker-label">Lieux déjà utilisés</span>
                  <div className="trainings-location-chips">
                    {plateauLocations.map((location) => (
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
