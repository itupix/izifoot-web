import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

function buildHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}


const API_BASE = import.meta.env?.VITE_API_URL ?? ''

function full(url: string) {
  return API_BASE ? `${API_BASE}${url}` : url
}

// ------- Types ---------
interface Training {
  id: string
  date: string // ISO
  status: string
}

interface Plateau {
  id: string
  date: string // ISO
  lieu: string
}


// ------- Helpers ---------
function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function bust(url: string) {
  const u = new URL(url, window.location.origin)
  u.searchParams.set('_', Date.now().toString())
  return u.pathname + u.search
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(bust(url), {
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

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

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [plateaus, setPlateaus] = useState<Plateau[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load trainings + plateaus
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [ts, pls] = await Promise.all([
          apiGet<Training[]>(full('/api/trainings')),
          apiGet<Plateau[]>(full('/api/plateaus')),
        ])
        if (!cancelled) {
          // sort by date desc
          ts.sort((a, b) => +new Date(b.date) - +new Date(a.date))
          setTrainings(ts)
          setPlateaus(pls)
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])
  // Derived data for selected day
  const selectedDayKey = useMemo(() => yyyyMmDd(selectedDate), [selectedDate])
  const dayTrainings = useMemo(() => {
    return trainings.filter(t => yyyyMmDd(toDateOnly(t.date)) === selectedDayKey)
  }, [trainings, selectedDayKey])
  const dayPlateaus = useMemo(() => {
    return plateaus.filter(p => yyyyMmDd(toDateOnly(p.date)) === selectedDayKey)
  }, [plateaus, selectedDayKey])

  // Auto-select not needed (details now on dedicated page)

  async function createPlateauForDay(day: Date) {
    const lieu = window.prompt('Lieu du plateau ?') || ''
    if (!lieu.trim()) return
    try {
      const created = await apiPost<Plateau>(full('/api/plateaus'), { date: day.toISOString(), lieu: lieu.trim() })
      setPlateaus(prev => [created, ...prev])
    } catch (err: unknown) {
      alert(`Erreur création plateau: ${getErrorMessage(err)}`)
    }
  }

  // Plateau match helpers: edit, save, delete

  async function createTrainingForDay(day: Date) {
    try {
      const created = await apiPost<Training>(full('/api/trainings'), { date: day.toISOString() })
      setTrainings(prev => [created, ...prev])
    } catch (err: unknown) {
      alert(`Erreur création entraînement: ${getErrorMessage(err)}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Planning</h2>
          <input
            type="date"
            value={selectedDayKey}
            onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
            style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </header>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Entraînements</div>
          {dayTrainings.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>Aucun entraînement ce jour.</div>
          ) : (
            dayTrainings.map((t) => (
              <Link
                key={t.id}
                to={`/training/${t.id}`}
                style={{
                  display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', borderRadius: 8,
                  border: '1px solid #d1d5db', background: '#fff'
                }}
              >
                {t.status === 'CANCELLED' ? '❌ Entraînement' : '⚽️ Entraînement'}
              </Link>
            ))
          )}
          <button onClick={() => createTrainingForDay(selectedDate)} style={{ fontSize: 12, border: '1px dashed #cbd5e1', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
            + Ajouter un entraînement
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Plateaux</div>
          {dayPlateaus.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>Aucun plateau ce jour.</div>
          ) : (
            dayPlateaus.map((p) => (
              <Link
                key={p.id}
                to={`/plateau/${p.id}`}
                style={{
                  display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', borderRadius: 8,
                  border: '1px solid #d1d5db', background: '#fff'
                }}
              >
                📍 Plateau — {p.lieu}
              </Link>
            ))
          )}
          <button onClick={() => createPlateauForDay(selectedDate)} style={{ fontSize: 12, border: '1px dashed #cbd5e1', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
            + Ajouter un plateau
          </button>
        </div>
      </div>

      <aside>
        {loading && <p>Chargement…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <p>Les détails des plateaux sont disponibles sur leur page dédiée.</p>
      </aside>
    </div>
  )
}
