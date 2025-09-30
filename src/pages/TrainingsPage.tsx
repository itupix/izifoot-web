import React, { useEffect, useMemo, useState } from 'react'

interface Drill {
  id: string
  title: string
  category: string
  duration: number
  players: string
  description: string
  tags: string[]
}

interface TrainingDrill {
  id: string
  trainingId: string
  drillId: string
  order: number
  duration?: number | null
  notes?: string | null
  meta?: Drill | null
}

async function apiDelete<T = any>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPut<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_API_URL) ||
  ''

function full(url: string) {
  return API_BASE ? `${API_BASE}${url}` : url
}

// ------- Types ---------
interface Player {
  id: string
  name: string
  primary_position: string
  secondary_position?: string | null
}

interface Training {
  id: string
  date: string // ISO
  status: string
}

interface AttendanceRow {
  id: string
  session_type: 'TRAINING' | 'PLATEAU'
  session_id: string
  playerId: string
}

// ------- Helpers ---------
function getAuthHeaders() {
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
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toDateOnly(dateISO: string) {
  const d = new Date(dateISO)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// ------- UI -------
const cellStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  minHeight: 84,
  padding: 6,
}

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: 9999,
  background: '#10b981',
}

export default function TrainingsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [monthCursor, setMonthCursor] = useState<Date>(() => new Date())
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drills, setDrills] = useState<TrainingDrill[]>([])
  const [catalog, setCatalog] = useState<Drill[]>([])
  const [addDrillId, setAddDrillId] = useState<string>('')
  const [addNotes, setAddNotes] = useState<string>('')
  const [addDuration, setAddDuration] = useState<number | ''>('')

  // Load players + trainings
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [ps, ts, dr] = await Promise.all([
          apiGet<Player[]>(full('/api/players')),
          apiGet<Training[]>(full('/api/trainings')),
          apiGet<{ items: Drill[] }>(full('/api/drills')),
        ])
        setCatalog(dr.items)
        if (!cancelled) {
          setPlayers(ps)
          // sort by date desc
          ts.sort((a, b) => +new Date(b.date) - +new Date(a.date))
          setTrainings(ts)
          // auto-select most recent training of current month
          const currentMonth = monthCursor.getMonth()
          const currentYear = monthCursor.getFullYear()
          const candidate = ts.find(t => {
            const d = new Date(t.date)
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear
          })
          setSelectedTrainingId(prev => prev ?? candidate?.id ?? null)
        }
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadDrills() {
      if (!selectedTrainingId) { setDrills([]); return }
      try {
        const rows = await apiGet<TrainingDrill[]>(full(`/api/trainings/${selectedTrainingId}/drills`))
        if (!cancelled) setDrills(rows)
      } catch (e) {
        if (!cancelled) setDrills([])
      }
    }
    loadDrills()
    return () => { cancelled = true }
  }, [selectedTrainingId])

  // Load attendance of selected training
  useEffect(() => {
    let cancelled = false
    async function loadAttendance() {
      if (!selectedTrainingId) { setAttendance(new Set()); return }
      try {
        const rows = await apiGet<AttendanceRow[]>(full(`/api/attendance?session_type=TRAINING&session_id=${encodeURIComponent(selectedTrainingId)}`))
        if (!cancelled) setAttendance(new Set(rows.map(r => r.playerId)))
      } catch (e) {
        // ignore — show empty attendance
        if (!cancelled) setAttendance(new Set())
      }
    }
    loadAttendance()
    return () => { cancelled = true }
  }, [selectedTrainingId])

  async function addDrill() {
    if (!selectedTrainingId || !addDrillId) return
    try {
      const row = await apiPost<TrainingDrill>(full(`/api/trainings/${selectedTrainingId}/drills`), {
        drillId: addDrillId,
        notes: addNotes || undefined,
        duration: typeof addDuration === 'number' ? addDuration : undefined,
      })
      setDrills(prev => [...prev, row])
      setAddDrillId('')
      setAddNotes('')
      setAddDuration('')
    } catch (e: any) {
      alert(`Erreur ajout exercice: ${e.message || e}`)
    }
  }

  async function removeDrill(trainingDrillId: string) {
    if (!selectedTrainingId) return
    try {
      await apiDelete(full(`/api/trainings/${selectedTrainingId}/drills/${trainingDrillId}`))
      setDrills(prev => prev.filter(d => d.id !== trainingDrillId))
    } catch (e: any) {
      alert(`Erreur suppression: ${e.message || e}`)
    }
  }

  async function updateDrill(trainingDrillId: string, patch: Partial<Pick<TrainingDrill, 'notes' | 'duration' | 'order'>>) {
    if (!selectedTrainingId) return
    try {
      const updated = await apiPut<TrainingDrill>(full(`/api/trainings/${selectedTrainingId}/drills/${trainingDrillId}`), patch)
      setDrills(prev => prev.map(d => d.id === trainingDrillId ? updated : d))
    } catch (e: any) {
      alert(`Erreur mise à jour: ${e.message || e}`)
    }
  }

  // Derived data
  const monthDays = useMemo(() => {
    const y = monthCursor.getFullYear()
    const m = monthCursor.getMonth()
    const first = new Date(y, m, 1)
    const start = new Date(first)
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7)) // Monday-start week
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [monthCursor])

  const trainingsByDay = useMemo(() => {
    const map = new Map<string, Training[]>()
    for (const t of trainings) {
      const key = yyyyMmDd(toDateOnly(t.date))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [trainings])

  const selectedTraining = useMemo(() => trainings.find(t => t.id === selectedTrainingId) || null, [trainings, selectedTrainingId])

  async function setTrainingStatus(cancelled: boolean) {
    if (!selectedTraining) return
    try {
      const updated = await apiPut<Training>(full(`/api/trainings/${selectedTraining.id}`), { status: cancelled ? 'CANCELLED' : 'PLANNED' })
      setTrainings(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch (e: any) {
      alert(`Erreur mise à jour statut: ${e.message || e}`)
    }
  }

  async function deleteTraining() {
    if (!selectedTraining) return
    if (!confirm('Supprimer définitivement cet entraînement ?')) return
    try {
      await apiDelete(full(`/api/trainings/${selectedTraining.id}`))
      setTrainings(prev => prev.filter(t => t.id !== selectedTraining.id))
      setSelectedTrainingId(null)
    } catch (e: any) {
      alert(`Erreur suppression: ${e.message || e}`)
    }
  }

  async function createTrainingForDay(day: Date) {
    try {
      const created = await apiPost<Training>(full('/api/trainings'), { date: day.toISOString() })
      setTrainings(prev => [created, ...prev])
      setSelectedTrainingId(created.id)
    } catch (e: any) {
      alert(`Erreur création entraînement: ${e.message || e}`)
    }
  }

  async function togglePresence(playerId: string, present: boolean) {
    if (!selectedTraining) return
    try {
      await apiPost(full('/api/attendance'), {
        session_type: 'TRAINING',
        session_id: selectedTraining.id,
        playerId,
        present
      })
      setAttendance(prev => {
        const next = new Set(prev)
        if (present) next.add(playerId); else next.delete(playerId)
        return next
      })
    } catch (e: any) {
      alert(`Erreur présence: ${e.message || e}`)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
      <div>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>◀</button>
          <h2 style={{ margin: 0 }}>
            {monthCursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>▶</button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (<div key={d} style={{ padding: 6 }}>{d}</div>))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {monthDays.map((d, idx) => {
            const inMonth = d.getMonth() === monthCursor.getMonth()
            const key = yyyyMmDd(d)
            const dayTrainings = trainingsByDay.get(key) || []
            const isToday = sameDay(d, new Date())
            return (
              <div key={idx} style={{ ...cellStyle, background: inMonth ? '#fff' : '#fafafa', position: 'relative', opacity: inMonth ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{d.getDate()}</div>
                  {isToday && <div style={{ fontSize: 10, color: '#2563eb' }}>aujourd'hui</div>}
                </div>
                <div>
                  {dayTrainings.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTrainingId(t.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: 6,
                        padding: '6px 8px',
                        textAlign: 'left',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: selectedTrainingId === t.id ? '#e0f2fe' : '#f9fafb'
                      }}
                    >
                      {selectedTrainingId === t.id
                        ? (t.status === 'CANCELLED' ? '❌ Entraînement (annulé)' : '🏃 Entraînement')
                        : (t.status === 'CANCELLED' ? '❌ Entraînement (annulé)' : '🏃 Entraînement')}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'absolute', bottom: 6, right: 6 }}>
                  {dayTrainings.length > 0 ? <span style={dotStyle} title={`${dayTrainings.length} entraînement(s)`} /> : (
                    <button onClick={() => createTrainingForDay(d)} style={{ fontSize: 11, border: '1px dashed #cbd5e1', borderRadius: 6, padding: '2px 6px', background: '#fff' }}>+ Ajouter</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <aside>
        <h3 style={{ marginTop: 0 }}>Détail</h3>
        {loading && <p>Chargement…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        {!selectedTraining && <p>Sélectionne une case du calendrier pour voir/créer un entraînement.</p>}
        {selectedTraining && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div>
              <strong>🏃 Entraînement</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{new Date(selectedTraining.date).toLocaleDateString()}</span>
                {selectedTraining.status === 'CANCELLED' && (
                  <span style={{ fontSize: 12, color: '#b91c1c', border: '1px solid #fecaca', background: '#fee2e2', padding: '2px 6px', borderRadius: 6 }}>Annulé</span>
                )}
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#374151', marginLeft: 8 }}>
                  <input type="checkbox" checked={selectedTraining.status === 'CANCELLED'} onChange={e => setTrainingStatus(e.target.checked)} />
                  Annulé
                </label>
                <button onClick={deleteTraining} style={{ marginLeft: 8, border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, background: '#fff', padding: '4px 8px' }}>Supprimer</button>
              </div>
            </div>
            <hr />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Présents: {attendance.size} / {players.length}</span>
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              {players.map(p => {
                const present = attendance.has(p.id)
                return (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{p.primary_position}{p.secondary_position ? ` / ${p.secondary_position}` : ''}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={(e) => togglePresence(p.id, e.target.checked)}
                    />
                  </label>
                )
              })}
            </div>
            <hr />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h4 style={{ margin: '8px 0' }}>🧩 Exercices de la séance</h4>
                <small style={{ color: '#6b7280' }}>{drills.length} exercice(s)</small>
              </div>

              {/* Formulaire d'ajout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, marginBottom: 8 }}>
                <select value={addDrillId} onChange={e => setAddDrillId(e.target.value)} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <option value="">— Ajouter un exercice —</option>
                  {catalog.map(d => (
                    <option key={d.id} value={d.id}>{d.title} • {d.category}</option>
                  ))}
                </select>
                <button onClick={addDrill} disabled={!addDrillId} style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }}>Ajouter</button>
              </div>

              {/* Champs optionnels */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, marginBottom: 12 }}>
                <input
                  placeholder="Notes (optionnel)"
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
                <input
                  placeholder="Durée (min)"
                  type="number"
                  min={1}
                  value={addDuration}
                  onChange={e => setAddDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </div>

              {/* Liste des exercices de la séance */}
              <div style={{ display: 'grid', gap: 8 }}>
                {drills.map((d, idx) => (
                  <div key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <strong>{d.meta?.title ?? d.drillId}</strong>
                      <small style={{ color: '#6b7280' }}>
                        {d.meta?.category ?? '—'} • ⏱ {d.duration ?? d.meta?.duration ?? '—'}′
                      </small>
                    </div>
                    {d.meta?.tags?.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
                        {d.meta.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 9999, border: '1px solid #d1d5db' }}>{t}</span>)}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 12, color: '#374151', margin: '6px 0' }}>
                      {d.meta?.description}
                    </div>

                    {/* Edit inline: durée & notes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: 8 }}>
                      <input
                        type="number"
                        min={1}
                        value={d.duration ?? ''}
                        onChange={e => updateDrill(d.id, { duration: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="Durée (min)"
                        style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                      />
                      <input
                        value={d.notes ?? ''}
                        onChange={e => updateDrill(d.id, { notes: e.target.value === '' ? null : e.target.value })}
                        placeholder="Notes"
                        style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                      />
                      <button onClick={() => removeDrill(d.id)} style={{ border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, background: '#fff' }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
