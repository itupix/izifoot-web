

import React, { useEffect, useMemo, useState } from 'react'

// API helpers (same pattern as TrainingsPage)
const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) || ''
function full(url: string) { return API_BASE ? `${API_BASE}${url}` : url }
function bust(url: string) {
  const u = new URL(url, window.location.origin)
  u.searchParams.set('_', Date.now().toString())
  return u.pathname + u.search
}
function getAuthHeaders() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(bust(full(url)), {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    cache: 'no-store'
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

export default function DrillsPage() {
  const [data, setData] = useState<DrillsResponse>({ items: [], categories: [], tags: [] })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const res = await apiGet<DrillsResponse>('/api/drills')
        if (!cancelled) setData(res)
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e))
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
            <article key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {d.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 9999, border: '1px solid #d1d5db' }}>{t}</span>)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', background: '#f9fafb' }}>
                  {expanded === d.id ? 'Masquer' : 'Voir'}
                </button>
                <a href={`#/drills/${d.id}`} style={{ fontSize: 12, color: '#2563eb' }}>Détail</a>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}