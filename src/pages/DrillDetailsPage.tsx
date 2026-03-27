import { useCallback, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import DiagramComposer from '../components/DiagramComposer'
import DiagramPlayer from '../components/DiagramPlayer'
import { ChevronLeftIcon, DotsHorizontalIcon, SparklesIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { apiGetAllItems } from '../adapters/pagination'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { createEmptyDiagramData, normalizeDiagramData, summarizeDiagramMaterials, type DiagramData } from '../components/diagramShared'
import { canWrite } from '../authz'
import { toErrorMessage } from '../errors'
import { mapTrainingAiError } from '../features/trainingAi'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import type { Drill } from '../types/api'
import './DrillDetailsPage.css'

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let inList = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${applyInlineMarkdown(escapeHtml(listMatch[1]))}</li>`)
      continue
    }

    if (inList) {
      html.push('</ul>')
      inList = false
    }

    const h3 = line.match(/^###\s+(.+)$/)
    if (h3) {
      html.push(`<h3>${applyInlineMarkdown(escapeHtml(h3[1]))}</h3>`)
      continue
    }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      html.push(`<h2>${applyInlineMarkdown(escapeHtml(h2[1]))}</h2>`)
      continue
    }
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1) {
      html.push(`<h1>${applyInlineMarkdown(escapeHtml(h1[1]))}</h1>`)
      continue
    }

    html.push(`<p>${applyInlineMarkdown(escapeHtml(line))}</p>`)
  }

  if (inList) html.push('</ul>')
  return html.join('')
}

export default function DrillDetailsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection } = useTeamScope()
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const drillId = params.id ?? ''
  const fromTrainingId = searchParams.get('fromTraining')
  const fromTrainingDrillId = searchParams.get('fromTrainingDrill')
  const backTarget = fromTrainingId ? `/training/${fromTrainingId}` : '/exercices'
  const backLabel = fromTrainingId ? "Retour a l'entrainement" : 'Retour aux exercices'
  const [drill, setDrill] = useState<Drill | null>(null)
  const [diagram, setDiagram] = useState<Diagram | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingDiagram, setGeneratingDiagram] = useState(false)
  const [manualDiagramOpen, setManualDiagramOpen] = useState(false)
  const [manualDiagramSaving, setManualDiagramSaving] = useState(false)
  const [manualDiagramError, setManualDiagramError] = useState<string | null>(null)
  const [manualDiagramData, setManualDiagramData] = useState<DiagramData>(createEmptyDiagramData())
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [diagramData, setDiagramData] = useState<DiagramData>(createEmptyDiagramData())
  const writable = me ? canWrite(me.role) && (!requiresSelection || Boolean(selectedTeamId)) : false

  const loadDrill = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const diagramsPath = fromTrainingDrillId
      ? apiRoutes.trainingDrills.diagrams(fromTrainingDrillId)
      : apiRoutes.drills.diagrams(drillId)
    const [rows, diagramRows] = await Promise.all([
      apiGetAllItems<Drill>(apiRoutes.drills.list),
      apiGet<unknown>(diagramsPath).catch(() => []),
    ])
    if (isCancelled()) return
    const found = rows.find((item) => item.id === drillId) ?? null
    setDrill(found)
    const diagrams = normalizeDiagramList(diagramRows)
    setDiagram(diagrams[0] ?? null)
  }, [drillId, fromTrainingDrillId])

  const { loading, error } = useAsyncLoader(loadDrill)

  function openEditModal() {
    if (!writable) return
    if (!drill) return
    setActionsMenuOpen(false)
    setTitle(drill.title)
    setCategory(drill.category)
    setDescription(drill.description)
    setDiagramData(diagram ? normalizeDiagramData(diagram.data) : createEmptyDiagramData())
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    if (!writable) return
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
    if (!writable) return
    if (!drill || deleting) return
    setActionsMenuOpen(false)
    if (!window.confirm('Supprimer cet exercice ?')) return
    try {
      setDeleting(true)
      await apiDelete(apiRoutes.drills.byId(drill.id))
      navigate(backTarget)
    } catch (err: unknown) {
      setEditError(toErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  async function generateAiDiagram() {
    if (!writable) return
    if (!drill || generatingDiagram) return
    try {
      setGeneratingDiagram(true)
      const objective = drill.description?.trim()
      const body = objective ? { objective } : {}
      if (fromTrainingDrillId) {
        await apiPost(apiRoutes.trainingDrills.generateAiDiagram(fromTrainingDrillId), body)
        const diagrams = normalizeDiagramList(await apiGet<unknown>(apiRoutes.trainingDrills.diagrams(fromTrainingDrillId)))
        setDiagram(diagrams[0] ?? null)
      } else {
        await apiPost(apiRoutes.drills.generateAiDiagram(drill.id), body)
        const diagrams = normalizeDiagramList(await apiGet<unknown>(apiRoutes.drills.diagrams(drill.id)))
        setDiagram(diagrams[0] ?? null)
      }
    } catch (err: unknown) {
      setEditError(mapTrainingAiError(err, 'diagram'))
    } finally {
      setGeneratingDiagram(false)
    }
  }

  function openManualDiagramModal() {
    if (!writable) return
    setManualDiagramData(createEmptyDiagramData())
    setManualDiagramError(null)
    setManualDiagramOpen(true)
  }

  async function createManualDiagram() {
    if (!drill || manualDiagramSaving) return
    try {
      setManualDiagramSaving(true)
      setManualDiagramError(null)
      const payload = { title: 'Diagramme', data: manualDiagramData }
      let saved: Diagram
      if (fromTrainingDrillId) {
        saved = await apiPost<Diagram>(apiRoutes.trainingDrills.diagrams(fromTrainingDrillId), payload)
      } else {
        saved = await apiPost<Diagram>(apiRoutes.drills.diagrams(drill.id), payload)
      }
      setDiagram(saved)
      setManualDiagramOpen(false)
    } catch (err: unknown) {
      setManualDiagramError(toErrorMessage(err))
    } finally {
      setManualDiagramSaving(false)
    }
  }

  if (loading) return <div>Chargement…</div>
  if (error) return <div style={{ color: 'crimson' }}>{error}</div>
  if (!drill) return <div>Exercice introuvable.</div>

  const materials = diagram ? summarizeDiagramMaterials(diagram.data) : []
  const drillDescriptionHtml = drill.descriptionHtml?.trim()
    ? drill.descriptionHtml
    : markdownToHtml(drill.description || '')

  return (
    <div className="drill-details-page">
      <header className="drill-details-head">
        <button type="button" className="drill-back-link-button" onClick={() => navigate(backTarget)}>
          <ChevronLeftIcon size={18} />
          <span>{backLabel}</span>
        </button>
        <div className="drill-details-mainrow">
          <div className="drill-details-title-wrap">
            <h1 className="drill-details-title">{drill.title}</h1>
            <p className="drill-details-subtitle">{drill.category}</p>
          </div>
          <div className="drill-menu-wrap">
            {writable && (
              <>
                <RoundIconButton
                  ariaLabel="Ouvrir le menu d'actions"
                  className="drill-menu-button"
                  onClick={() => setActionsMenuOpen((prev) => !prev)}
                >
                  <DotsHorizontalIcon size={18} />
                </RoundIconButton>
                {actionsMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="drill-menu-backdrop"
                      aria-label="Fermer le menu"
                      onClick={() => setActionsMenuOpen(false)}
                    />
                    <div className="drill-floating-menu">
                      <button type="button" onClick={openEditModal}>Modifier l'exercice</button>
                      <button type="button" className="danger" onClick={() => void deleteDrill()} disabled={deleting}>
                        {deleting ? 'Suppression…' : "Supprimer l'exercice"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="drill-details-grid">
        {!writable && (
          <section className="drill-card">
            <p className="drill-empty-text">Sélectionnez une équipe active pour modifier cet exercice.</p>
          </section>
        )}
        <section className="drill-card">
          <h3>Description</h3>
          {!!drillDescriptionHtml && (
            <div className="drill-description-text" dangerouslySetInnerHTML={{ __html: drillDescriptionHtml }} />
          )}
          {!drillDescriptionHtml && <p className="drill-empty-text">Aucune description renseignée.</p>}
        </section>

        <section className="drill-card">
          <h3>Diagramme</h3>
          <div className="drill-diagram-content">
            {diagram ? <DiagramPlayer data={diagram.data} /> : <p className="drill-empty-text">Aucun diagramme disponible.</p>}
          </div>
          {writable && (
            <div className="drill-diagram-actions">
              <button
                type="button"
                className="drill-create-manual-button"
                onClick={openManualDiagramModal}
              >
                Creer un diagramme
              </button>
              <button
                type="button"
                className="drill-generate-ai-button"
                disabled={generatingDiagram}
                onClick={() => void generateAiDiagram()}
              >
                <SparklesIcon size={14} />
                <span>{generatingDiagram ? 'Generation…' : 'Generer diagramme'}</span>
              </button>
            </div>
          )}
        </section>

        <section className="drill-card">
          <h3>Matériel</h3>
          {materials.length > 0 ? (
            <ul className="drill-materials-list">
              {materials.map((material) => (
                <li key={material}>{material}</li>
              ))}
            </ul>
          ) : (
            <p className="drill-empty-text">Aucun matériel renseigné.</p>
          )}
        </section>

        {editError && !editing && <div style={{ color: 'crimson' }}>{editError}</div>}
      </div>

      {writable && manualDiagramOpen && (
        <div className="drill-modal-overlay" role="dialog" aria-modal="true" onClick={() => !manualDiagramSaving && setManualDiagramOpen(false)}>
          <div className="drill-manual-diagram-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drill-manual-diagram-head">
              <h3>Creer un diagramme</h3>
              <button type="button" onClick={() => setManualDiagramOpen(false)} disabled={manualDiagramSaving}>×</button>
            </div>
            {manualDiagramError && <p className="drill-manual-diagram-error">{manualDiagramError}</p>}
            <DiagramComposer value={manualDiagramData} onChange={setManualDiagramData} minHeight={320} />
            <div className="drill-manual-diagram-actions">
              <button type="button" className="drill-modal-secondary" onClick={() => setManualDiagramOpen(false)} disabled={manualDiagramSaving}>
                Annuler
              </button>
              <button type="button" className="drill-modal-primary" onClick={() => void createManualDiagram()} disabled={manualDiagramSaving}>
                {manualDiagramSaving ? 'Creation…' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {writable && editing && (
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
