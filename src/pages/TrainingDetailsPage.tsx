import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { API_BASE } from '../api'

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

function full(url: string) {
  return API_BASE ? `${API_BASE}${url}` : url
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function buildHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(full(url), {
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(full(url), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(full(url), {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiDelete<T = unknown>(url: string): Promise<T> {
  const res = await fetch(full(url), {
    method: 'DELETE',
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function getErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('<!DOCTYPE') ? 'Erreur serveur' : msg
}

export default function TrainingDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [training, setTraining] = useState<Training | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Set<string>>(new Set())
  const [drills, setDrills] = useState<TrainingDrill[]>([])
  const [catalog, setCatalog] = useState<Drill[]>([])
  const [addDrillId, setAddDrillId] = useState<string>('')
  const [addNotes, setAddNotes] = useState<string>('')
  const [addDuration, setAddDuration] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const [t, ps, dr, ds, att] = await Promise.all([
          apiGet<Training>(`/api/trainings/${id}`),
          apiGet<Player[]>('/api/players'),
          apiGet<{ items: Drill[] }>('/api/drills'),
          apiGet<TrainingDrill[]>(`/api/trainings/${id}/drills`),
          apiGet<AttendanceRow[]>(`/api/attendance?session_type=TRAINING&session_id=${encodeURIComponent(id)}`),
        ])
        if (!cancelled) {
          setTraining(t)
          setPlayers(ps)
          setCatalog(dr.items)
          setDrills(ds)
          setAttendance(new Set(att.map(a => a.playerId)))
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const trainingDateLabel = useMemo(() => {
    if (!training?.date) return ''
    return new Date(training.date).toLocaleDateString()
  }, [training])

  async function setTrainingStatus(cancelled: boolean) {
    if (!training) return
    try {
      const updated = await apiPut<Training>(`/api/trainings/${training.id}`, { status: cancelled ? 'CANCELLED' : 'PLANNED' })
      setTraining(updated)
    } catch (err: unknown) {
      alert(`Erreur mise à jour statut: ${getErrorMessage(err)}`)
    }
  }

  async function deleteTraining() {
    if (!training) return
    if (!confirm('Supprimer définitivement cet entraînement ?')) return
    try {
      await apiDelete(`/api/trainings/${training.id}`)
      navigate('/planning')
    } catch (err: unknown) {
      alert(`Erreur suppression: ${getErrorMessage(err)}`)
    }
  }

  async function togglePresence(playerId: string, present: boolean) {
    if (!training) return
    try {
      await apiPost('/api/attendance', {
        session_type: 'TRAINING',
        session_id: training.id,
        playerId,
        present
      })
      setAttendance(prev => {
        const next = new Set(prev)
        if (present) next.add(playerId); else next.delete(playerId)
        return next
      })
    } catch (err: unknown) {
      alert(`Erreur présence: ${getErrorMessage(err)}`)
    }
  }

  async function addDrill() {
    if (!training || !addDrillId) return
    try {
      const row = await apiPost<TrainingDrill>(`/api/trainings/${training.id}/drills`, {
        drillId: addDrillId,
        notes: addNotes || undefined,
        duration: typeof addDuration === 'number' ? addDuration : undefined,
      })
      setDrills(prev => [...prev, row])
      setAddDrillId('')
      setAddNotes('')
      setAddDuration('')
    } catch (err: unknown) {
      alert(`Erreur ajout exercice: ${getErrorMessage(err)}`)
    }
  }

  async function removeDrill(trainingDrillId: string) {
    if (!training) return
    try {
      await apiDelete(`/api/trainings/${training.id}/drills/${trainingDrillId}`)
      setDrills(prev => prev.filter(d => d.id !== trainingDrillId))
    } catch (err: unknown) {
      alert(`Erreur suppression: ${getErrorMessage(err)}`)
    }
  }

  async function updateDrill(trainingDrillId: string, patch: Partial<Pick<TrainingDrill, 'notes' | 'duration' | 'order'>>) {
    if (!training) return
    try {
      const updated = await apiPut<TrainingDrill>(`/api/trainings/${training.id}/drills/${trainingDrillId}`, patch)
      setDrills(prev => prev.map(d => d.id === trainingDrillId ? updated : d))
    } catch (err: unknown) {
      alert(`Erreur mise à jour: ${getErrorMessage(err)}`)
    }
  }

  if (!id) return <div>Entraînement introuvable.</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link to="/planning">← Retour</Link>
          <h2 style={{ margin: '4px 0' }}>Entraînement</h2>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{trainingDateLabel}</div>
        </div>
        {training && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {training.status === 'CANCELLED' && (
              <span style={{ fontSize: 12, color: '#b91c1c', border: '1px solid #fecaca', background: '#fee2e2', padding: '2px 6px', borderRadius: 6 }}>Annulé</span>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#374151' }}>
              <input type="checkbox" checked={training.status === 'CANCELLED'} onChange={e => setTrainingStatus(e.target.checked)} />
              Annulé
            </label>
            <button onClick={deleteTraining} style={{ border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, background: '#fff', padding: '4px 8px' }}>Supprimer</button>
          </div>
        )}
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {training && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Présents: {attendance.size} / {players.length}</span>
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}>
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

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h4 style={{ margin: '8px 0' }}>🧩 Exercices de la séance</h4>
              <small style={{ color: '#6b7280' }}>{drills.length} exercice(s)</small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
              <select value={addDrillId} onChange={e => setAddDrillId(e.target.value)} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <option value="">— Ajouter un exercice —</option>
                {catalog.map(d => (
                  <option key={d.id} value={d.id}>{d.title} • {d.category}</option>
                ))}
              </select>
              <button onClick={addDrill} disabled={!addDrillId} style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }}>Ajouter</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
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

            <div style={{ display: 'grid', gap: 8 }}>
              {drills.map((d) => {
                const meta = d.meta || catalog.find(c => c.id === d.drillId) || null
                return (
                  <div key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <strong>{meta?.title ?? d.drillId}</strong>
                      <small style={{ color: '#6b7280' }}>
                        {meta?.category ?? '—'} • ⏱ {d.duration ?? meta?.duration ?? '—'}′
                      </small>
                    </div>
                    {meta?.tags?.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
                        {meta.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 9999, border: '1px solid #d1d5db' }}>{t}</span>)}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 12, color: '#374151', margin: '6px 0' }}>
                      {meta?.description}
                    </div>

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
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
