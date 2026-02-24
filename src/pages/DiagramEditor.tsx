import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'

// --- API helpers identiques au reste ---
function full(url: string) { return API_BASE ? `${API_BASE}${url}` : url }
function bust(url: string) { const u = new URL(url, window.location.origin); u.searchParams.set('_', Date.now().toString()); return u.toString() }
function getAuthHeaders(): Record<string, string> {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}
function buildHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(bust(full(url)), { headers: buildHeaders(), credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(full(url), { method: 'POST', headers: buildHeaders(), body: JSON.stringify(body), credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(full(url), { method: 'PUT', headers: buildHeaders(), body: JSON.stringify(body), credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// --- Types ---
type Tool = 'select' | 'player' | 'cone' | 'arrow'
type Side = 'home' | 'away'
type UUID = string

interface PlayerNode { type: 'player'; id: UUID; x: number; y: number; label?: string; side: Side }
interface ConeNode { type: 'cone'; id: UUID; x: number; y: number }
interface Arrow { type: 'arrow'; id: UUID; from: { x: number; y: number }; to: { x: number; y: number } }

type Item = PlayerNode | ConeNode | Arrow
interface DiagramData { items: Item[] }
interface Diagram { id: string; title: string; data: DiagramData; drillId?: string | null; trainingDrillId?: string | null }

function normalizeData(input: unknown): DiagramData {
  try {
    const obj = typeof input === 'string' ? JSON.parse(input) : input
    if (obj && typeof obj === 'object' && 'items' in obj) {
      const items = (obj as { items?: unknown }).items
      return { items: Array.isArray(items) ? (items as Item[]) : [] }
    }
    return { items: [] }
  } catch {
    return { items: [] }
  }
}

function uid() { return Math.random().toString(36).slice(2, 10) }
function qs(name: string) { const u = new URL(window.location.href); return u.searchParams.get(name) } // reads from hash-based URLs too

export default function DiagramEditor() {
  const navigate = useNavigate()
  const [tool, setTool] = useState<Tool>('select')
  const [title, setTitle] = useState('Nouveau diagramme')
  const [data, setData] = useState<DiagramData>({ items: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // context: either existing diagram id OR target drill/trainingDrill
  const diagramId = qs('id')
  const drillId = qs('drillId')
  const trainingDrillId = qs('trainingDrillId')

  // load if editing
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!diagramId) return
      setLoading(true); setError(null)
      try {
        const d = await apiGet<Diagram>(`/diagrams/${diagramId}`)
        if (!cancelled) {
          setTitle(d.title || 'Diagramme')
          setData(normalizeData(d.data))
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [diagramId])

  // drawing interactions
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const arrowRef = useRef<{ id: string; from: { x: number; y: number } } | null>(null)

  function getPoint(evt: React.MouseEvent) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX; pt.y = evt.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function onCanvasDown(e: React.MouseEvent) {
    const p = getPoint(e)
    if (tool === 'player') {
      const node: PlayerNode = { type: 'player', id: uid(), x: p.x, y: p.y, side: 'home', label: '' }
      setData(d => ({ items: [...d.items, node] }))
      setSelectedId(node.id)
    } else if (tool === 'cone') {
      const node: ConeNode = { type: 'cone', id: uid(), x: p.x, y: p.y }
      setData(d => ({ items: [...d.items, node] }))
      setSelectedId(node.id)
    } else if (tool === 'arrow') {
      const id = uid()
      arrowRef.current = { id, from: p }
      const a: Arrow = { type: 'arrow', id, from: p, to: p }
      setData(d => ({ items: [...d.items, a] }))
      setSelectedId(id)
    } else {
      setSelectedId(null)
    }
  }

  function onCanvasMove(e: React.MouseEvent) {
    const p = getPoint(e)
    // dragging nodes
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current
      setData(d => ({
        items: d.items.map(it => {
          if (it.id !== id) return it
          if (it.type === 'player' || it.type === 'cone') {
            return { ...it, x: p.x + dx, y: p.y + dy }
          }
          return it
        })
      }))
    }
    // drawing arrow
    if (arrowRef.current) {
      setData(d => ({
        items: d.items.map(it => it.id === arrowRef.current!.id && it.type === 'arrow' ? { ...it, to: p } : it)
      }))
    }
  }
  function onCanvasUp() { dragRef.current = null; arrowRef.current = null }

  function startDrag(it: Item, e: React.MouseEvent) {
    e.stopPropagation()
    if (it.type === 'player' || it.type === 'cone') {
      const p = getPoint(e)
      dragRef.current = { id: it.id, dx: it.x - p.x, dy: it.y - p.y }
      setSelectedId(it.id)
    }
  }

  function delSelected() {
    if (!selectedId) return
    setData(d => ({ items: d.items.filter(it => it.id !== selectedId) }))
    setSelectedId(null)
  }

  async function save() {
    try {
      setLoading(true); setError(null)
      const payload = { title: title.trim() || 'Diagramme', data }
      let saved: Diagram
      if (diagramId) {
        saved = await apiPut<Diagram>(`/diagrams/${diagramId}`, payload)
      } else if (trainingDrillId) {
        saved = await apiPost<Diagram>(`/training-drills/${trainingDrillId}/diagrams`, payload)
      } else if (drillId) {
        saved = await apiPost<Diagram>(`/drills/${drillId}/diagrams`, payload)
      } else {
        alert('Contexte manquant (drillId ou trainingDrillId)'); return
      }
      // redirect or just notify
      alert('Diagramme sauvegardé ✔️')
      if (!diagramId) {
        navigate(`/diagram-editor?id=${saved.id}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const selected = useMemo(() => (Array.isArray(data.items) ? data.items.find(i => i.id === selectedId) : null) || null, [data, selectedId])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
      {/* Sidebar */}
      <aside>
        <h2 style={{ marginTop: 0 }}>Éditeur de diagramme</h2>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder='Titre'
          style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }} />
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <ToolBtn on={() => setTool('select')} label='Sélection' active={tool === 'select'} />
          <ToolBtn on={() => setTool('player')} label='Joueur' active={tool === 'player'} />
          <ToolBtn on={() => setTool('cone')} label='Cône' active={tool === 'cone'} />
          <ToolBtn on={() => setTool('arrow')} label='Flèche' active={tool === 'arrow'} />
        </div>
        <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
          <strong>Propriétés</strong>
          {!selected && <div style={{ color: '#6b7280', fontSize: 13 }}>Aucun élément</div>}
          {selected && selected.type === 'player' && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>Équipe</label>
              <select value={selected.side} onChange={e => {
                const side = e.target.value as Side
                setData(d => ({ items: d.items.map(it => it.id === selected.id && it.type === 'player' ? { ...it, side } : it) }))
              }} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <option value='home'>Home</option>
                <option value='away'>Away</option>
              </select>
              <label style={{ fontSize: 12 }}>Numéro / label</label>
              <input value={selected.label || ''} onChange={e => {
                const label = e.target.value
                setData(d => ({ items: d.items.map(it => it.id === selected.id && it.type === 'player' ? { ...it, label } : it) }))
              }} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6 }} />
            </div>
          )}
          {selected && selected.type === 'cone' && (
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Cône (déplaçable)</div>
          )}
          {selected && selected.type === 'arrow' && (
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Flèche (dessinée clic-glisser)</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={loading} style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}>
            {diagramId ? 'Mettre à jour' : 'Sauvegarder'}
          </button>
          <button onClick={delSelected} disabled={!selectedId} style={{ border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, background: '#fff', padding: '6px 10px' }}>
            Supprimer élément
          </button>
        </div>
        {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
      </aside>

      {/* Canvas */}
      <main>
        <svg ref={svgRef} viewBox="0 0 600 380" width="100%" height="100%"
          onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp}
          style={{ border: '1px solid #e5e7eb', background: '#f8fff8', borderRadius: 8, touchAction: 'none' }}>
          {/* terrain */}
          <rect x={5} y={5} width={590} height={370} rx={8} ry={8} fill="white" stroke="#c7e2c7" />
          <line x1={300} y1={5} x2={300} y2={375} stroke="#c7e2c7" strokeDasharray="4 4" />
          {/* surface / buts simplifiés */}
          <rect x={5} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
          <rect x={555} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
          {/* éléments */}
          {Array.isArray(data.items) && data.items.map(it => {
            if (it.type === 'arrow') {
              return (
                <g key={it.id}>
                  <defs>
                    <marker id={`arrow-${it.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 Z" fill="#111827" />
                    </marker>
                  </defs>
                  <line x1={it.from.x} y1={it.from.y} x2={it.to.x} y2={it.to.y}
                    stroke="#111827" strokeWidth={2} markerEnd={`url(#arrow-${it.id})`} onMouseDown={(e) => { e.stopPropagation(); setSelectedId(it.id) }} />
                </g>
              )
            }
            if (it.type === 'cone') {
              return (
                <polygon key={it.id} points={`${it.x},${it.y - 10} ${it.x - 10},${it.y + 10} ${it.x + 10},${it.y + 10}`}
                  fill="#f97316" stroke="#7c2d12" onMouseDown={(e) => startDrag(it, e)} opacity={selectedId === it.id ? 0.8 : 1} />
              )
            }
            // player
            const fill = it.side === 'home' ? '#60a5fa' : '#f87171'
            return (
              <g key={it.id} onMouseDown={(e) => startDrag(it, e)} opacity={selectedId === it.id ? 0.85 : 1}>
                <circle cx={it.x} cy={it.y} r={14} fill={fill} stroke="#111827" />
                <text x={it.x} y={it.y + 4} textAnchor="middle" fontSize="12" fill="white" fontWeight={700}>{it.label || ''}</text>
              </g>
            )
          })}
        </svg>
      </main>
    </div>
  )
}

function ToolBtn({ on, label, active }: { on: () => void; label: string; active: boolean }) {
  return (
    <button onClick={on} style={{
      padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
      background: active ? '#e0f2fe' : '#fff'
    }}>{label}</button>
  )
}
