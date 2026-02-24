import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
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

  const ctaButtonStyle = {
    fontSize: 16,
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '10px 12px',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.22)',
  } as const

  const navIconButtonStyle = {
    border: '1px solid #d1d5db',
    borderRadius: 999,
    background: '#fff',
    width: 44,
    height: 44,
    cursor: 'pointer',
    fontSize: 28,
    lineHeight: 1,
    display: 'grid',
    placeItems: 'center',
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
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedDate((prev) => addDays(prev, -1))}
              aria-label="Jour précédent"
              style={navIconButtonStyle}
            >
              <ChevronLeftIcon size={24} />
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
              <ChevronRightIcon size={24} />
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
                setIsDatePickerOpen((prev) => !prev)
              }}
              aria-label="Choisir une date"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 999,
                background: '#fff',
                width: 44,
                height: 44,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: 24,
              }}
            >
              <CalendarIcon size={24} />
            </button>
            {isDatePickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  right: 0,
                  zIndex: 10,
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                  padding: 10,
                  width: 250,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    aria-label="Mois précédent"
                    style={{ border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', width: 36, height: 36, cursor: 'pointer', fontSize: 24 }}
                  >
                    <ChevronLeftIcon size={24} />
                  </button>
                  <strong style={{ textTransform: 'capitalize', fontSize: 16 }}>{monthLabel}</strong>
                  <button
                    type="button"
                    onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    aria-label="Mois suivant"
                    style={{ border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', width: 36, height: 36, cursor: 'pointer', fontSize: 24 }}
                  >
                    <ChevronRightIcon size={24} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                    <div key={`${d}-${i}`} style={{ textAlign: 'center', fontSize: 16, color: '#64748b' }}>{d}</div>
                  ))}
                  {calendarCells.map((day, idx) => {
                    if (day <= 0) {
                      return <div key={`empty-${idx}`} />
                    }
                    const candidate = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day)
                    const isSelected = yyyyMmDd(candidate) === selectedDayKey
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
                          borderRadius: 6,
                          background: isSelected ? '#0f172a' : '#fff',
                          color: isSelected ? '#fff' : '#0f172a',
                          height: 28,
                          cursor: 'pointer',
                          fontSize: 16,
                        }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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
          <button onClick={() => createTrainingForDay(selectedDate)} style={ctaButtonStyle}>
            Ajouter un entraînement
          </button>
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
          <button onClick={() => createPlateauForDay(selectedDate)} style={ctaButtonStyle}>
            Ajouter un plateau
          </button>
        </section>
      </div>

      <aside>
        {loading && <p>Chargement…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </aside>
    </div>
  )
}
