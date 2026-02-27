

import React, { useEffect, useMemo, useState } from 'react'
import FloatingPlusButton from '../components/FloatingPlusButton'
import SearchSelectBar from '../components/SearchSelectBar'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert, uiConfirm } from '../ui'
import type { Player } from '../types/api'

const POSITIONS = ['GARDIEN', 'DEFENSEUR', 'MILIEU', 'ATTAQUANT'] as const

// -------- UI --------
export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [detailEdit, setDetailEdit] = useState(false)

  // form create
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<typeof POSITIONS[number]>('MILIEU')
  const [secondary, setSecondary] = useState<string>('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // filters/search
  const [q, setQ] = useState('')
  const [posFilter, setPosFilter] = useState('')

  const { loading, error } = useAsyncLoader(async ({ isCancelled }) => {
    const list = await apiGet<Player[]>(apiRoutes.players.list)
    if (!isCancelled()) setPlayers(list)
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
      const body: {
        name: string
        primary_position: string
        secondary_position?: string
        email?: string
        phone?: string
      } = {
        name: name.trim(),
        primary_position: primary,
        secondary_position: secondary.trim() || undefined,
      }
      if (email.trim()) body.email = email.trim()
      if (phone.trim()) body.phone = phone.trim()
      const p = await apiPost<Player>(apiRoutes.players.list, body)
      setPlayers(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setPrimary('MILIEU')
      setSecondary('')
      setEmail(''); setPhone('')
      setModalOpen(false)
    } catch (err: unknown) {
      uiAlert(`Erreur création joueur: ${toErrorMessage(err)}`)
    }
  }

  async function updatePlayer(id: string, patch: Partial<Player>) {
    try {
      const p = await apiPut<Player>(apiRoutes.players.byId(id), patch)
      setPlayers(prev => prev.map(x => x.id === id ? p : x))
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour: ${toErrorMessage(err)}`)
    }
  }

  async function removePlayer(id: string) {
    if (!uiConfirm('Supprimer ce joueur ?')) return
    try {
      await apiDelete(apiRoutes.players.byId(id))
      setPlayers(prev => prev.filter(p => p.id !== id))
      setDetailOpen(false)
      setSelectedPlayer(null)
    } catch (err: unknown) {
      uiAlert(`Erreur suppression: ${toErrorMessage(err)}`)
    }
  }

  function openDetails(p: Player) {
    setSelectedPlayer(p)
    setDetailOpen(true)
    setDetailEdit(false)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ marginTop: 0 }}>Effectif</h2>

      <SearchSelectBar
        query={q}
        onQueryChange={setQ}
        queryPlaceholder="Recherche par nom"
        selectValue={posFilter}
        onSelectChange={setPosFilter}
        selectPlaceholder="Tous les postes"
        options={POSITIONS.map(p => ({ value: p, label: p }))}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} onClick={() => openDetails(p)} style={{ cursor: 'pointer' }}>
                <td style={td}>{p.name}</td>
                <td style={td}>{p.primary_position}</td>
                <td style={td}>{p.secondary_position || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'center' }} colSpan={3}>Aucun joueur</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailOpen && selectedPlayer && (
        <>
          <div
            onClick={() => setDetailOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 40 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(460px, 92vw)',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              border: '1px solid #e5e7eb',
              zIndex: 45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Détails joueur</strong>
              <button onClick={() => setDetailOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#6b7280' }}>Nom</label>
              {detailEdit ? (
                <InlineEdit
                  value={selectedPlayer.name}
                  onSave={(v) => {
                    if (v !== selectedPlayer.name) updatePlayer(selectedPlayer.id, { name: v })
                    setSelectedPlayer(prev => prev ? { ...prev, name: v } : prev)
                  }}
                />
              ) : (
                <div>{selectedPlayer.name}</div>
              )}
              <label style={{ fontSize: 12, color: '#6b7280' }}>Poste principal</label>
              {detailEdit ? (
                <SelectInline
                  value={selectedPlayer.primary_position}
                  options={[...POSITIONS]}
                  onChange={(v) => {
                    if (v !== selectedPlayer.primary_position) updatePlayer(selectedPlayer.id, { primary_position: v })
                    setSelectedPlayer(prev => prev ? { ...prev, primary_position: v } : prev)
                  }}
                />
              ) : (
                <div>{selectedPlayer.primary_position}</div>
              )}
              <label style={{ fontSize: 12, color: '#6b7280' }}>Poste secondaire</label>
              {detailEdit ? (
                <SelectInline
                  value={selectedPlayer.secondary_position || ''}
                  options={['', ...POSITIONS]}
                  onChange={(v) => {
                    const next = v || null
                    if (next !== (selectedPlayer.secondary_position || null)) updatePlayer(selectedPlayer.id, { secondary_position: next })
                    setSelectedPlayer(prev => prev ? { ...prev, secondary_position: next } : prev)
                  }}
                />
              ) : (
                <div>{selectedPlayer.secondary_position || '—'}</div>
              )}
              <label style={{ fontSize: 12, color: '#6b7280' }}>Email</label>
              {detailEdit ? (
                <InlineEdit
                  value={selectedPlayer.email || ''}
                  onSave={(v) => {
                    const next = v || null
                    if (next !== (selectedPlayer.email || null)) updatePlayer(selectedPlayer.id, { email: next })
                    setSelectedPlayer(prev => prev ? { ...prev, email: next } : prev)
                  }}
                />
              ) : (
                <div>{selectedPlayer.email || '—'}</div>
              )}
              <label style={{ fontSize: 12, color: '#6b7280' }}>Téléphone</label>
              {detailEdit ? (
                <InlineEdit
                  value={selectedPlayer.phone || ''}
                  onSave={(v) => {
                    const next = v || null
                    if (next !== (selectedPlayer.phone || null)) updatePlayer(selectedPlayer.id, { phone: next })
                    setSelectedPlayer(prev => prev ? { ...prev, phone: next } : prev)
                  }}
                />
              ) : (
                <div>{selectedPlayer.phone || '—'}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button
                  onClick={() => setDetailEdit(!detailEdit)}
                  style={{ border: '1px solid #d1d5db', color: '#374151', background: '#fff', borderRadius: 6, padding: '4px 8px' }}
                >
                  {detailEdit ? 'Terminer' : 'Modifier'}
                </button>
                <button onClick={() => removePlayer(selectedPlayer.id)} style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {modalOpen && (
        <>
          <div
            onClick={() => setModalOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 40 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(420px, 90vw)',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              border: '1px solid #e5e7eb',
              zIndex: 45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Ajouter un joueur</strong>
              <button onClick={() => setModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>✕</button>
            </div>
            <form onSubmit={createPlayer} style={{ display: 'grid', gap: 8 }}>
              <input
                placeholder="Nom"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
              />
              <label style={{ fontSize: 12, color: '#6b7280' }}>Poste principal</label>
              <select value={primary} onChange={e => setPrimary(e.target.value as typeof POSITIONS[number])} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}>
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
            </form>
          </div>
        </>
      )}

      <FloatingPlusButton ariaLabel="Ajouter un joueur" onClick={() => setModalOpen(true)} />
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
