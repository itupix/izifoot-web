

import React, { useEffect, useMemo, useState } from 'react'

// -------- API helpers (same style as TrainingsPage) --------
const API_BASE = (() => {
  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL)
  if (env) return env
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000'
  }
  return window.location.origin
})()
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
async function apiPost<T>(url: string, body: any): Promise<T> {
  const res = await fetch(full(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiPut<T>(url: string, body: any): Promise<T> {
  const res = await fetch(full(url), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiDelete<T = any>(url: string): Promise<T> {
  const res = await fetch(full(url), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// -------- Types --------
interface Player {
  id: string
  name: string
  primary_position: string
  secondary_position?: string | null
  email?: string | null
  phone?: string | null
  invitePresentUrl?: string
  inviteAbsentUrl?: string
}

const POSITIONS = ['GARDIEN', 'DEFENSEUR', 'MILIEU', 'ATTAQUANT'] as const

// -------- UI --------
export default function PlayersPage() {
  // Invite player helper, now with setPlayers access
  async function invitePlayer(playerId: string, email?: string) {
    const plateauId = window.prompt('ID du plateau pour ces liens RSVP ?') || ''
    if (!plateauId) return
    const body: any = { plateauId }
    if (email) body.email = email
    const res = await apiPost<{ ok: boolean; presentUrl: string; absentUrl: string }>(
      `/api/players/${playerId}/invite`,
      body
    )
    setPlayers(prev =>
      prev.map(p =>
        p.id === playerId
          ? { ...p, invitePresentUrl: res.presentUrl, inviteAbsentUrl: res.absentUrl }
          : p
      )
    )
  }
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // form create
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<typeof POSITIONS[number]>('MILIEU')
  const [secondary, setSecondary] = useState<string>('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // filters/search
  const [q, setQ] = useState('')
  const [posFilter, setPosFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const list = await apiGet<Player[]>('/api/players')
        if (!cancelled) setPlayers(list)
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let items = players
    if (q.trim()) {
      const n = q.toLowerCase()
      items = items.filter(p => p.name.toLowerCase().includes(n))
    }
    if (posFilter) items = items.filter(p => p.primary_position === posFilter || p.secondary_position === posFilter)
    return items
  }, [players, q, posFilter])

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault()
    try {
      const body: any = {
        name: name.trim(),
        primary_position: primary,
        secondary_position: secondary.trim() || undefined,
      }
      if (email.trim()) body.email = email.trim()
      if (phone.trim()) body.phone = phone.trim()
      const p = await apiPost<Player>('/api/players', body)
      setPlayers(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setPrimary('MILIEU')
      setSecondary('')
      setEmail(''); setPhone('')
    } catch (e: any) {
      alert(`Erreur création joueur: ${e.message || e}`)
    }
  }

  async function updatePlayer(id: string, patch: Partial<Player>) {
    try {
      const p = await apiPut<Player>(`/api/players/${id}`, patch)
      setPlayers(prev => prev.map(x => x.id === id ? p : x))
    } catch (e: any) {
      alert(`Erreur mise à jour: ${e.message || e}`)
    }
  }

  async function removePlayer(id: string) {
    if (!confirm('Supprimer ce joueur ?')) return
    try {
      await apiDelete(`/api/players/${id}`)
      setPlayers(prev => prev.filter(p => p.id !== id))
    } catch (e: any) {
      alert(`Erreur suppression: ${e.message || e}`)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
      {/* Sidebar create/filter */}
      <aside>
        <h2 style={{ marginTop: 0 }}>Effectif</h2>

        <form onSubmit={createPlayer} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, background: '#fff' }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Ajouter un joueur</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              placeholder="Nom"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
            />
            <label style={{ fontSize: 12, color: '#6b7280' }}>Poste principal</label>
            <select value={primary} onChange={e => setPrimary(e.target.value as any)} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              placeholder="Poste secondaire (optionnel)"
              list="positions"
              value={secondary}
              onChange={e => setSecondary(e.target.value)}
              style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
            />
            <datalist id="positions">
              {POSITIONS.map(p => <option key={p} value={p} />)}
            </datalist>
            <input
              placeholder="Email (optionnel)"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
            />
            <input
              placeholder="Téléphone (optionnel)"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
            />
            <button type="submit" style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6' }}>Ajouter</button>
          </div>
        </form>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Filtres</strong>
          <input
            placeholder="Recherche par nom"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}
          />
          <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <option value="">Tous les postes</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </aside>

      {/* Main list */}
      <main>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{filtered.length} joueur(s)</div>
          {loading && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
          {error && <div style={{ color: 'crimson' }}>{error}</div>}
        </div>

        <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={th}>Nom</th>
                <th style={th}>Poste principal</th>
                <th style={th}>Poste secondaire</th>
                <th style={th}>Email</th>
                <th style={th}>Téléphone</th>
                <th style={th}>Invitation</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td style={td}>
                    <InlineEdit
                      value={p.name}
                      onSave={(v) => v !== p.name && updatePlayer(p.id, { name: v })}
                    />
                  </td>
                  <td style={td}>
                    <SelectInline
                      value={p.primary_position}
                      options={[...POSITIONS]}
                      onChange={(v) => v !== p.primary_position && updatePlayer(p.id, { primary_position: v })}
                    />
                  </td>
                  <td style={td}>
                    <SelectInline
                      value={p.secondary_position || ''}
                      options={['', ...POSITIONS]}
                      onChange={(v) => (v || null) !== (p.secondary_position || null) && updatePlayer(p.id, { secondary_position: v || null as any })}
                    />
                  </td>
                  <td style={td}>
                    <InlineEdit
                      value={p.email || ''}
                      onSave={(v) => v !== (p.email || '') && updatePlayer(p.id, { email: v || null as any })}
                    />
                  </td>
                  <td style={td}>
                    <InlineEdit
                      value={p.phone || ''}
                      onSave={(v) => v !== (p.phone || '') && updatePlayer(p.id, { phone: v || null as any })}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={p.invitePresentUrl || ''}
                          readOnly
                          placeholder="URL Présence"
                          style={{ flex: 1, padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                        />
                        <button
                          disabled={!p.invitePresentUrl}
                          onClick={() => p.invitePresentUrl && navigator.clipboard.writeText(p.invitePresentUrl)}
                          style={{ border: '1px solid #d1d5db', color: '#374151', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                        >
                          Copier
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={p.inviteAbsentUrl || ''}
                          readOnly
                          placeholder="URL Absence"
                          style={{ flex: 1, padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}
                        />
                        <button
                          disabled={!p.inviteAbsentUrl}
                          onClick={() => p.inviteAbsentUrl && navigator.clipboard.writeText(p.inviteAbsentUrl)}
                          style={{ border: '1px solid #d1d5db', color: '#374151', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                        >
                          Copier
                        </button>
                      </div>
                      <div>
                        <button
                          onClick={() => invitePlayer(p.id, p.email || undefined)}
                          style={{ border: '1px solid #10b981', color: '#10b981', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                        >
                          Générer…
                        </button>
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <button onClick={() => removePlayer(p.id)} style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>Supprimer</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td style={{ ...td, textAlign: 'center' }} colSpan={7}>Aucun joueur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 13, color: '#374151' }
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 14, color: '#111827' }

// ---- Small reusable inline editors ----
function InlineEdit({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [v, setV] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => setV(value), [value])
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {editing ? (
        <>
          <input value={v} onChange={e => setV(e.target.value)} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }} />
          <button onClick={() => { setEditing(false); if (v.trim() && v !== value) onSave(v.trim()) }} style={{ border: '1px solid #d1d5db', background: '#f3f4f6', borderRadius: 6, padding: '4px 8px' }}>OK</button>
          <button onClick={() => { setEditing(false); setV(value) }} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>Annuler</button>
        </>
      ) : (
        <>
          <span>{value}</span>
          <button onClick={() => setEditing(true)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 12 }}>Éditer</button>
        </>
      )}
    </div>
  )
}

function SelectInline({ value, options, onChange }: { value: string; options: string[]; onChange: (val: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <select value={v} onChange={e => { setV(e.target.value); onChange(e.target.value) }} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}>
      {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}

// --- Invite player helper (now inside PlayersPage) ---
// Moved inside PlayersPage for access to setPlayers