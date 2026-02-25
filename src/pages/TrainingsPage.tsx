import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import CtaButton from '../components/CtaButton'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SoccerBallIcon, TrophyIcon } from '../components/icons'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert, uiPrompt } from '../ui'
import type { Plateau, Training } from '../types/api'


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

function formatDateTitle(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plateaus, setPlateaus] = useState<Plateau[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
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
  const selectedDayKey = useMemo(() => yyyyMmDd(selectedDate), [selectedDate])
  const todayKey = useMemo(() => yyyyMmDd(new Date()), [])
  const isTodaySelected = selectedDayKey === todayKey
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

  async function createPlateauForDay(day: Date) {
    const lieu = uiPrompt('Lieu du plateau ?') || ''
    if (!lieu.trim()) return
    try {
      const created = await apiPost<Plateau>(apiRoutes.plateaus.list, { date: day.toISOString(), lieu: lieu.trim() })
      setPlateaus(prev => [created, ...prev])
    } catch (err: unknown) {
      uiAlert(`Erreur création plateau: ${toErrorMessage(err)}`)
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

  const blockStyle = {
    display: 'grid',
    gap: 12,
    border: '1px solid #dbe5f1',
    borderRadius: 16,
    padding: 14,
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
  } as const

  const itemStyle = {
    display: 'block',
    width: '100%',
    padding: '11px 12px',
    borderRadius: 10,
    border: '1px solid #d6deea',
    background: '#fff',
    color: '#0f172a',
    fontSize: 16,
    textDecoration: 'none',
  }

  const navIconButtonStyle = {
    appearance: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 999,
    background: '#fff',
    width: 32,
    height: 32,
    cursor: 'pointer',
    lineHeight: 0,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const

  return (
    <div style={{ display: 'grid', gap: 24, fontSize: 16 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <header style={{ display: 'grid', gap: 10 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 44px 44px',
              alignItems: 'center',
              gap: 10,
              width: '100%',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => addDays(prev, -1))}
              aria-label="Jour précédent"
              style={navIconButtonStyle}
            >
              <ChevronLeftIcon size={18} />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              aria-label="Revenir à aujourd'hui"
              style={{
                border: 'none',
                background: 'transparent',
                margin: 0,
                padding: 0,
                textTransform: 'capitalize',
                textAlign: 'center',
                fontSize: 24,
                fontWeight: 700,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {isTodaySelected ? "Aujourd'hui" : formatDateTitle(selectedDate)}
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
              aria-label="Jour suivant"
              style={navIconButtonStyle}
            >
              <ChevronRightIcon size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
                setIsDatePickerOpen((prev) => !prev)
              }}
              aria-label="Choisir une date"
              style={{
                appearance: 'none',
                border: '1px solid #d1d5db',
                borderRadius: 999,
                background: '#fff',
                width: 32,
                height: 32,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 0,
                padding: 0,
              }}
            >
              <CalendarIcon size={18} />
            </button>
          </div>
        </header>

        <section style={blockStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#334155', letterSpacing: 0.2 }}>Entraînements</div>
          {dayTrainings.length === 0 ? (
            <div style={{ fontSize: 16, color: '#64748b', padding: '2px 2px 4px' }}>Aucun entraînement ce jour.</div>
          ) : (
            dayTrainings.map((t) => (
              <Link
                key={t.id}
                to={`/training/${t.id}`}
                style={itemStyle}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {t.status === 'CANCELLED' ? <span style={{ fontSize: 24 }}>❌</span> : <SoccerBallIcon size={24} />}
                    Entraînement
                  </span>
                  <ChevronRightIcon size={24} style={{ color: '#64748b' }} />
                </span>
              </Link>
            ))
          )}
          <div
            style={{
              background: '#f4f8fb',
              borderTop: '1px solid #dbe5f1',
              margin: '0 -14px -14px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'flex-end',
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
            }}
          >
            <CtaButton onClick={() => createTrainingForDay(selectedDate)}>
              Ajouter un entraînement
            </CtaButton>
          </div>
        </section>

        <section style={blockStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#334155', letterSpacing: 0.2 }}>Plateaux</div>
          {dayPlateaus.length === 0 ? (
            <div style={{ fontSize: 16, color: '#64748b', padding: '2px 2px 4px' }}>Aucun plateau ce jour.</div>
          ) : (
            dayPlateaus.map((p) => (
              <Link
                key={p.id}
                to={`/plateau/${p.id}`}
                style={itemStyle}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <TrophyIcon size={24} />
                    Plateau — {p.lieu}
                  </span>
                  <ChevronRightIcon size={24} style={{ color: '#64748b' }} />
                </span>
              </Link>
            ))
          )}
          <div
            style={{
              background: '#f4f8fb',
              borderTop: '1px solid #dbe5f1',
              margin: '0 -14px -14px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'flex-end',
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
            }}
          >
            <CtaButton onClick={() => createPlateauForDay(selectedDate)}>
              Ajouter un plateau
            </CtaButton>
          </div>
        </section>
      </div>

      <aside>
        {loading && <p>Chargement…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </aside>

      {isDatePickerOpen && (
        <div
          onClick={() => setIsDatePickerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 16,
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
              padding: 16,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                aria-label="Mois précédent"
                style={{
                  appearance: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: 999,
                  background: '#fff',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 0,
                  padding: 0,
                }}
              >
                <ChevronLeftIcon size={18} />
              </button>
              <strong style={{ textTransform: 'capitalize', fontSize: 24 }}>{monthLabel}</strong>
              <button
                type="button"
                onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                aria-label="Mois suivant"
                style={{
                  appearance: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: 999,
                  background: '#fff',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 0,
                  padding: 0,
                }}
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={`${d}-${i}`} style={{ textAlign: 'center', fontSize: 16, color: '#64748b', fontWeight: 600 }}>{d}</div>
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
                      setSelectedDate(candidate)
                      setIsDatePickerOpen(false)
                    }}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: 10,
                      background: isSelected ? '#0f172a' : '#fff',
                      color: isSelected ? '#fff' : '#0f172a',
                      minHeight: 58,
                      cursor: 'pointer',
                      fontSize: 16,
                      display: 'grid',
                      alignContent: 'center',
                      justifyItems: 'center',
                      gap: 8,
                      paddingTop: 6,
                    }}
                  >
                    <span>{day}</span>
                    <span style={{ display: 'inline-flex', gap: 6, minHeight: 8 }}>
                      {hasTraining && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#ef4444' }} />}
                      {hasPlateau && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#3b82f6' }} />}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 14, color: '#334155' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ef4444' }} />
                Entraînement
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#3b82f6' }} />
                Plateau
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
