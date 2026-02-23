

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

// Thumbnail helpers
type DiagramData = { items?: unknown[] }
function normalizeDiagramData(input: unknown): DiagramData {
  try {
    const obj = typeof input === 'string' ? JSON.parse(input) : input
    if (obj && typeof obj === 'object' && 'items' in obj) {
      const items = (obj as { items?: unknown }).items
      return { items: Array.isArray(items) ? items : [] }
    }
    return { items: [] }
  } catch {
    return { items: [] }
  }
}

// API helpers (same pattern as TrainingsPage)
const API_BASE = import.meta.env?.VITE_API_URL ?? ''
function full(url: string) { return API_BASE ? `${API_BASE}${url}` : url }
function bust(url: string) {
  const u = new URL(url, window.location.origin)
  u.searchParams.set('_', Date.now().toString())
  return u.pathname + u.search
}
function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}
function buildHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(bust(full(url)), {
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(bust(full(url)), {
    method: 'POST',
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Types
interface Drill {
  id: string
  title: string
  category: string
  duration: number
  players: string
  description: string
  tags: string[]
}

interface DrillsResponse {
  items: Drill[]
  categories: string[]
  tags: string[]
}

interface DiagramMeta {
  id: string
  title: string
  data: unknown
  drillId?: string | null
  trainingDrillId?: string | null
  updatedAt: string
}

async function apiGetDiagramsForDrill(drillId: string): Promise<DiagramMeta[]> {
  return apiGet<DiagramMeta[]>(`/api/drills/${encodeURIComponent(drillId)}/diagrams`)
}

function DiagramThumb({ data, width = 220 }: { data: unknown; width?: number }) {
  const parsed = normalizeDiagramData(data)
  const W = 600, H = 380
  const w = width, h = Math.round(width * (H / W))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={w} height={h} style={{ display: 'block', border: '1px solid #e5e7eb', borderRadius: 6, background: '#f8fff8' }}>
      {/* terrain minimal */}
      <rect x={5} y={5} width={W - 10} height={H - 10} rx={8} ry={8} fill="white" stroke="#c7e2c7" />
      <line x1={W / 2} y1={5} x2={W / 2} y2={H - 5} stroke="#c7e2c7" strokeDasharray="4 4" />
      {parsed.items?.map((it, idx) => {
        const item = it as { type?: string; id?: string; from?: { x: number; y: number }; to?: { x: number; y: number }; x?: number; y?: number; side?: string; label?: string }
        if (item?.type === 'arrow' && item.from && item.to) {
          return (
            <g key={item.id || idx}>
              <defs>
                <marker id={`m-${idx}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 Z" fill="#111827" />
                </marker>
              </defs>
              <line x1={item.from.x} y1={item.from.y} x2={item.to.x} y2={item.to.y} stroke="#111827" strokeWidth={2} markerEnd={`url(#m-${idx})`} />
            </g>
          )
        }
        if (item?.type === 'cone') {
          const x = item.x ?? 0, y = item.y ?? 0
          return <polygon key={item.id || idx} points={`${x},${y - 10} ${x - 10},${y + 10} ${x + 10},${y + 10}`} fill="#f97316" stroke="#7c2d12" />
        }
        if (item?.type === 'player') {
          const x = item.x ?? 0, y = item.y ?? 0
          const fill = (item.side === 'away') ? '#f87171' : '#60a5fa'
          return (
            <g key={item.id || idx}>
              <circle cx={x} cy={y} r={14} fill={fill} stroke="#111827" />
              {item.label ? <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="white" fontWeight={700}>{item.label}</text> : null}
            </g>
          )
        }
        return null
      })}
    </svg>
  )
}

export default function DrillsPage() {
  const [data, setData] = useState<DrillsResponse>({ items: [], categories: [], tags: [] })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagramsByDrill, setDiagramsByDrill] = useState<Record<string, DiagramMeta[]>>({})
  const [loadingDiagramsFor, setLoadingDiagramsFor] = useState<string | null>(null)

  // creation form state
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDuration, setNewDuration] = useState<number | ''>('')
  const [newPlayers, setNewPlayers] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTags, setNewTags] = useState('') // comma-separated
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const params = useParams();

  useEffect(() => {
    if (params && params.id) {
      const id = params.id as string
      setExpanded(id)
      // try to scroll the card into view
      setTimeout(() => {
        const el = document.getElementById(`drill-card-${id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [params])
  useEffect(() => {
    let cancelled = false
    async function loadDiagrams(id: string) {
      if (diagramsByDrill[id]) return
      try {
        setLoadingDiagramsFor(id)
        const rows = await apiGetDiagramsForDrill(id)
        if (!cancelled) setDiagramsByDrill(prev => ({ ...prev, [id]: rows }))
      } catch {
        // silencieux: pas bloquant pour la page
      } finally {
        if (!cancelled) setLoadingDiagramsFor(null)
      }
    }
    if (expanded) loadDiagrams(expanded)
    return () => { cancelled = true }
  }, [expanded, diagramsByDrill])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const res = await apiGet<DrillsResponse>('/api/drills')
        if (!cancelled) setData(res)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load();
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let items = data.items
    if (q.trim()) {
      const needle = q.toLowerCase()
      items = items.filter(d =>
        d.title.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle) ||
        d.tags.some(t => t.toLowerCase().includes(needle))
      )
    }
    if (category) items = items.filter(d => d.category === category)
    if (selectedTags.length) {
      const set = new Set(selectedTags.map(t => t.toLowerCase()))
      items = items.filter(d => d.tags.some(t => set.has(t.toLowerCase())))
    }
    return items
  }, [data.items, q, category, selectedTags])

  const categories = useMemo(() => data.categories, [data.categories])
  const tags = useMemo(() => data.tags, [data.tags])

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function createDrill(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr(null)
    if (!newTitle || !newCategory || !newDuration || !newPlayers || !newDescription) {
      setCreateErr('Remplis tous les champs obligatoires.')
      return
    }
    try {
      setCreating(true)
      const payload = {
        title: newTitle.trim(),
        category: newCategory.trim(),
        duration: Number(newDuration),
        players: newPlayers.trim(),
        description: newDescription.trim(),
        tags: newTags.split(',').map(s => s.trim()).filter(Boolean)
      }
      const created = await apiPost<Drill>('/api/drills', payload)
      // refresh list
      const res = await apiGet<DrillsResponse>('/api/drills')
      setData(res)
      setExpanded(created.id)
      // reset form
      setNewTitle(''); setNewCategory(''); setNewDuration(''); setNewPlayers(''); setNewDescription(''); setNewTags('')
    } catch (err: unknown) {
      setCreateErr(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
      {/* Sidebar filters */}
      <aside>
        <h2 style={{ marginTop: 0 }}>Exercices</h2>
        <input
          placeholder="Recherche (titre, tags, description)"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }}
        />
        <label style={{ fontSize: 12, color: '#6b7280' }}>Catégorie</label>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }}>
          <option value="">Toutes</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map(t => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                style={{
                  padding: '4px 8px', borderRadius: 9999, border: '1px solid #d1d5db',
                  background: selectedTags.includes(t) ? '#e0f2fe' : '#fff',
                  cursor: 'pointer', fontSize: 12
                }}
              >{t}</button>
            ))}
          </div>
        </div>
        <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />
        <h3 style={{ margin: '8px 0' }}>Nouvel exercice</h3>
        {createErr && <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>{createErr}</div>}
        <form onSubmit={createDrill}>
          <input
            placeholder="Titre *"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <input
            placeholder="Catégorie *"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <input
            placeholder="Durée (min) *"
            type="number"
            min={1}
            max={180}
            value={newDuration}
            onChange={e => setNewDuration(e.target.value ? Number(e.target.value) : '')}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <input
            placeholder="Joueurs (ex: 6–12) *"
            value={newPlayers}
            onChange={e => setNewPlayers(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <textarea
            placeholder="Description *"
            rows={4}
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8, resize: 'vertical' }}
          />
          <input
            placeholder="Tags (séparés par des virgules)"
            value={newTags}
            onChange={e => setNewTags(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <button type="submit" disabled={creating} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
            {creating ? 'Création…' : 'Ajouter'}
          </button>
        </form>
      </aside>

      {/* Main list */}
      <main>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{filtered.length} exercice(s)</div>
          {loading && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
          {error && <div style={{ color: 'crimson' }}>{error}</div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map(d => (
            <article id={`drill-card-${d.id}`} key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>{d.title}</strong>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{d.category}</span>
              </header>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#374151', marginTop: 6 }}>
                <span>⏱ {d.duration}′</span>
                <span>👥 {d.players}</span>
              </div>
              <p style={{ fontSize: 13, color: '#374151', marginTop: 8, marginBottom: 8 }}>
                {expanded === d.id ? d.description : d.description.slice(0, 120) + (d.description.length > 120 ? '…' : '')}
              </p>
              {expanded === d.id && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Diagrammes</div>
                  {loadingDiagramsFor === d.id && <div style={{ fontSize: 12, color: '#9ca3af' }}>Chargement…</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {(diagramsByDrill[d.id] || []).map(di => (
                      <div key={di.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' }}>
                        <DiagramThumb data={di.data} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                            <strong>{di.title}</strong>
                          </div>
                          <Link to={`/diagram-editor?id=${encodeURIComponent(di.id)}`} style={{ fontSize: 12, color: '#2563eb' }}>Ouvrir</Link>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>MAJ {new Date(di.updatedAt).toLocaleDateString()}</div>
                      </div>
                    ))}
                    {((diagramsByDrill[d.id] || []).length === 0 && loadingDiagramsFor !== d.id) && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Aucun diagramme pour cet exercice.</div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {d.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 9999, border: '1px solid #d1d5db' }}>{t}</span>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', background: '#f9fafb' }}>
                    {expanded === d.id ? 'Masquer' : 'Voir'}
                  </button>
                  <Link to={`/diagram-editor?drillId=${encodeURIComponent(d.id)}`} style={{ fontSize: 12, color: '#2563eb' }}>
                    + Nouveau diagramme
                  </Link>
                </div>
                <Link to={`/exercices/${d.id}`} style={{ fontSize: 12, color: '#2563eb' }}>
                  Détail
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
