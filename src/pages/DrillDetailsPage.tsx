import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DiagramComposer from '../components/DiagramComposer'
import DiagramPlayer from '../components/DiagramPlayer'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { createEmptyDiagramData, normalizeDiagramData, summarizeDiagramMaterials, type DiagramData } from '../components/diagramShared'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import type { Drill } from '../types/api'

interface Diagram {
  id: string
  title: string
  data: unknown
}

function normalizeDiagramList(input: unknown): Diagram[] {
  if (Array.isArray(input)) return input as Diagram[]
  if (input && typeof input === 'object' && Array.isArray((input as { items?: unknown }).items)) {
    return (input as { items: Diagram[] }).items
  }
  return []
}

export default function DrillDetailsPage() {
  const params = useParams()
  const navigate = useNavigate()
  const drillId = params.id ?? ''
  const [drill, setDrill] = useState<Drill | null>(null)
  const [diagram, setDiagram] = useState<Diagram | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [diagramData, setDiagramData] = useState<DiagramData>(createEmptyDiagramData())

  const loadDrill = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const [rows, diagramRows] = await Promise.all([
      apiGet<{ items: Drill[] }>(apiRoutes.drills.list),
      apiGet<unknown>(apiRoutes.drills.diagrams(drillId)).catch(() => []),
    ])
    if (isCancelled()) return
    const found = rows.items.find((item) => item.id === drillId) ?? null
    setDrill(found)
    const diagrams = normalizeDiagramList(diagramRows)
    setDiagram(diagrams[0] ?? null)
  }, [drillId])

  const { loading, error } = useAsyncLoader(loadDrill)

  function openEditModal() {
    if (!drill) return
    setTitle(drill.title)
    setCategory(drill.category)
    setDescription(drill.description)
    setDiagramData(diagram ? normalizeDiagramData(diagram.data) : createEmptyDiagramData())
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!drill) return
    setEditError(null)
    if (!title.trim() || !category.trim()) {
      setEditError('Remplis tous les champs obligatoires.')
      return
    }
    try {
      setSaving(true)
      const payload = {
        title: title.trim(),
        category: category.trim(),
        duration: drill.duration && drill.duration > 0 ? drill.duration : 1,
        players: drill.players?.trim() ? drill.players : 'Variable',
        description: description.trim(),
        tags: drill.tags,
      }
      const updated = await updateDrillCompat(drill.id, payload)
      let nextDiagram = diagram
      if (diagram?.id) {
        nextDiagram = await apiPut<Diagram>(apiRoutes.diagrams.byId(diagram.id), {
          title: 'Diagramme',
          data: diagramData,
        })
      } else {
        nextDiagram = await apiPost<Diagram>(apiRoutes.drills.diagrams(drill.id), {
          title: 'Diagramme',
          data: diagramData,
        })
      }
      setDrill(updated)
      setDiagram(nextDiagram)
      setEditing(false)
    } catch (err: unknown) {
      setEditError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function deleteDrill() {
    if (!drill || deleting) return
    if (!window.confirm('Supprimer cet exercice ?')) return
    try {
      setDeleting(true)
      await apiDelete(apiRoutes.drills.byId(drill.id))
      navigate('/exercices')
    } catch (err: unknown) {
      setEditError(toErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div>Chargement…</div>
  if (error) return <div style={{ color: 'crimson' }}>{error}</div>
  if (!drill) return <div>Exercice introuvable.</div>

  const materials = diagram ? summarizeDiagramMaterials(diagram.data) : []

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <Link to="/exercices" style={{ fontSize: 14, color: '#2563eb' }}>← Retour aux exercices</Link>
      </div>

      <article style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, background: '#fff' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{drill.title}</h2>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{drill.category}</span>
        </header>
        {materials.length > 0 && (
          <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: '#475569' }}>Matériel</strong>
            <div style={{ fontSize: 13, color: '#334155' }}>{materials.join(', ')}</div>
          </div>
        )}
        {!!drill.description && <p style={{ margin: 0, color: '#334155', lineHeight: 1.5 }}>{drill.description}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={openEditModal} style={secondaryButtonStyle}>Modifier</button>
          <button type="button" onClick={deleteDrill} disabled={deleting} style={dangerButtonStyle}>
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
        {editError && !editing && <div style={{ color: 'crimson', marginTop: 8 }}>{editError}</div>}
      </article>

      {diagram && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, background: '#fff', display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Diagramme</h3>
          <DiagramPlayer data={diagram.data} />
        </section>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setEditing(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(17, 24, 39, 0.35)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '76px 12px 12px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Modifier l'exercice</h3>
              <button type="button" onClick={() => setEditing(false)} style={closeButtonStyle}>×</button>
            </div>
            {editError && <div style={{ color: 'crimson', fontSize: 12, marginBottom: 8 }}>{editError}</div>}
            <form onSubmit={saveEdit}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre *" style={fieldStyle} />
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie *" style={fieldStyle} />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optionnel)"
                rows={4}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <div style={{ marginBottom: 12 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Diagramme</strong>
                <DiagramComposer value={diagramData} onChange={setDiagramData} minHeight={300} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setEditing(false)} style={secondaryButtonStyle}>Annuler</button>
                <button type="submit" disabled={saving} style={primaryButtonStyle}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

async function updateDrillCompat(
  drillId: string,
  payload: Omit<Drill, 'id'>,
): Promise<Drill> {
  try {
    return await apiPut<Drill>(apiRoutes.drills.byId(drillId), payload)
  } catch (err: unknown) {
    if (!isLikelyNotFound(err)) throw err
    return apiPost<Drill>(apiRoutes.drills.list, { id: drillId, ...payload })
  }
}

function isLikelyNotFound(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  return lower.includes('404') || lower.includes('not found') || lower.includes('cannot put')
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  marginBottom: 8,
}

const closeButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 20,
  cursor: 'pointer',
  color: '#6b7280',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #16a34a',
  background: '#16a34a',
  color: '#fff',
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  cursor: 'pointer',
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #ef4444',
  background: '#fff',
  color: '#ef4444',
  cursor: 'pointer',
}
