import { useCallback, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import DiagramComposer from '../components/DiagramComposer'
import DiagramPlayer from '../components/DiagramPlayer'
import { ChevronLeftIcon, CloseIcon, DotsHorizontalIcon, SparklesIcon } from '../components/icons'
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
  const canManage = me ? canWrite(me.role) : false
  const missingActiveTeam = canManage && requiresSelection && !selectedTeamId
  const writable = canManage && !missingActiveTeam
  const readOnly = !canManage

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
      setDrill(updated)
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

  function openDiagramModal() {
    if (!writable) return
    setManualDiagramData(diagram ? normalizeDiagramData(diagram.data) : createEmptyDiagramData())
    setManualDiagramError(null)
    setManualDiagramOpen(true)
  }

  async function saveDiagram() {
    if (!drill || manualDiagramSaving) return
    try {
      setManualDiagramSaving(true)
      setManualDiagramError(null)
      let saved: Diagram
      if (diagram?.id) {
        saved = await apiPut<Diagram>(apiRoutes.diagrams.byId(diagram.id), {
          title: 'Diagramme',
          data: manualDiagramData,
        })
      } else if (fromTrainingDrillId) {
        saved = await apiPost<Diagram>(apiRoutes.trainingDrills.diagrams(fromTrainingDrillId), {
          title: 'Diagramme',
          data: manualDiagramData,
        })
      } else {
        saved = await apiPost<Diagram>(apiRoutes.drills.diagrams(drill.id), {
          title: 'Diagramme',
          data: manualDiagramData,
        })
      }
      setDiagram(saved)
      setManualDiagramOpen(false)
    } catch (err: unknown) {
      setManualDiagramError(toErrorMessage(err))
    } finally {
      setManualDiagramSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="drill-state-shell">
        <section className="drill-state-card">
          <span className="drill-state-kicker">Exercice</span>
          <h1>Chargement…</h1>
          <p>La fiche de l&apos;exercice est en cours de préparation.</p>
        </section>
      </div>
    )
  }
  if (error) {
    return (
      <div className="drill-state-shell">
        <section className="drill-state-card drill-state-card--error">
          <span className="drill-state-kicker">Exercice</span>
          <h1>Impossible de charger la fiche</h1>
          <p>{error}</p>
        </section>
      </div>
    )
  }
  if (!drill) {
    return (
      <div className="drill-state-shell">
        <section className="drill-state-card">
          <span className="drill-state-kicker">Exercice</span>
          <h1>Exercice introuvable</h1>
          <p>Cette fiche n&apos;existe plus ou n&apos;est plus accessible dans votre périmètre.</p>
        </section>
      </div>
    )
  }

  const materials = diagram ? summarizeDiagramMaterials(diagram.data) : []
  const drillDescriptionHtml = drill.descriptionHtml?.trim()
    ? drill.descriptionHtml
    : markdownToHtml(drill.description || '')
  const tags = drill.tags.filter((tag) => tag.trim().length > 0)
  const diagramLabel = diagram ? 'Diagramme disponible' : 'Diagramme à créer'
  const diagramActionLabel = diagram ? 'Modifier le diagramme' : 'Créer un diagramme'
  const diagramAiLabel = generatingDiagram
    ? 'Génération…'
    : diagram
      ? 'Régénérer avec l’IA'
      : 'Générer avec l’IA'
  const contextLabel = fromTrainingId ? 'Exercice lié à un entraînement' : 'Bibliothèque d’exercices'
  const materialsEmptyMessage = diagram
    ? 'Aucun matériel détecté dans ce diagramme.'
    : 'Le matériel sera proposé automatiquement dès qu’un diagramme sera ajouté.'
  const diagramEmptyMessage = writable
    ? 'Ajoutez un diagramme manuel ou générez une première proposition avec l’IA.'
    : 'Aucun diagramme disponible pour cet exercice.'

  return (
    <div className="drill-details-page">
      <header className="drill-details-head drill-hero">
        <button type="button" className="drill-back-link-button" onClick={() => navigate(backTarget)}>
          <ChevronLeftIcon size={18} />
          <span>{backLabel}</span>
        </button>
        <div className="drill-details-mainrow drill-hero-mainrow">
          <div className="drill-details-title-wrap drill-hero-copy">
            <span className="drill-hero-kicker">{contextLabel}</span>
            <h1 className="drill-details-title">{drill.title}</h1>
            <div className="drill-summary-row">
              <span className="drill-category-badge">{drill.category}</span>
              <div className="drill-summary-chip">
                <span>Durée</span>
                <strong>{formatDuration(drill.duration)}</strong>
              </div>
              <div className="drill-summary-chip">
                <span>Joueurs</span>
                <strong>{drill.players?.trim() || 'Variable'}</strong>
              </div>
              <div className="drill-summary-chip">
                <span>Statut</span>
                <strong>{diagramLabel}</strong>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="drill-tags-row" aria-label="Tags de l'exercice">
                {tags.map((tag) => (
                  <span key={tag} className="drill-tag-pill">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="drill-hero-actions">
            {writable && (
              <>
                <button type="button" className="drill-primary-button" onClick={openEditModal}>
                  Modifier la fiche
                </button>
                <div className="drill-menu-wrap">
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
                        <button type="button" className="danger" onClick={() => void deleteDrill()} disabled={deleting}>
                          {deleting ? 'Suppression…' : "Supprimer l'exercice"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="drill-status-stack">
        {missingActiveTeam && (
          <section className="drill-notice drill-notice--warning">
            <p>Sélectionnez une équipe active pour modifier la fiche et le diagramme de cet exercice.</p>
          </section>
        )}
        {readOnly && (
          <section className="drill-notice">
            <p>Cette fiche est disponible en lecture seule. Seuls les membres du staff peuvent la modifier.</p>
          </section>
        )}
        {editError && !editing && <section className="drill-notice drill-notice--danger"><p>{editError}</p></section>}
      </div>

      <div className="drill-details-layout">
        <div className="drill-details-main">
          <section className="drill-card">
            <div className="drill-card-head">
              <div>
                <h2>Description</h2>
                <p>Objectif, consignes et déroulé de l&apos;exercice.</p>
              </div>
            </div>
          {!!drillDescriptionHtml && (
            <div className="drill-description-text" dangerouslySetInnerHTML={{ __html: drillDescriptionHtml }} />
          )}
          {!drillDescriptionHtml && <p className="drill-empty-text">Aucune description renseignée.</p>}
          </section>

          <section className="drill-card">
            <div className="drill-card-head">
              <div>
                <h2>Matériel</h2>
                <p>Déduit automatiquement à partir du diagramme.</p>
              </div>
            </div>
          {materials.length > 0 ? (
            <ul className="drill-materials-list">
              {materials.map((material) => (
                <li key={material}>{material}</li>
              ))}
            </ul>
          ) : (
            <p className="drill-empty-text">{materialsEmptyMessage}</p>
          )}
          </section>
        </div>

        <aside className="drill-details-aside">
          <section className="drill-card drill-card--diagram">
            <div className="drill-card-head">
              <div>
                <h2>Diagramme</h2>
                <p>Visualisation tactique et placement du matériel.</p>
              </div>
            </div>
            <div className="drill-diagram-content">
              {diagram ? <DiagramPlayer data={diagram.data} /> : <p className="drill-empty-text">{diagramEmptyMessage}</p>}
            </div>
            {writable && (
              <div className="drill-diagram-actions">
                <button
                  type="button"
                  className="drill-primary-button"
                  onClick={openDiagramModal}
                >
                  {diagramActionLabel}
                </button>
                <button
                  type="button"
                  className="drill-secondary-button"
                  disabled={generatingDiagram}
                  onClick={() => void generateAiDiagram()}
                >
                  <SparklesIcon size={14} />
                  <span>{diagramAiLabel}</span>
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {writable && manualDiagramOpen && (
        <div className="drill-modal-overlay" role="dialog" aria-modal="true" onClick={() => !manualDiagramSaving && setManualDiagramOpen(false)}>
          <div className="drill-modal drill-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="drill-modal-head">
              <div>
                <h3>{diagram ? 'Modifier le diagramme' : 'Créer un diagramme'}</h3>
                <p>Préparez une vue claire pour la séance et le matériel.</p>
              </div>
              <button
                type="button"
                className="drill-modal-close"
                aria-label="Fermer la fenetre"
                onClick={() => setManualDiagramOpen(false)}
                disabled={manualDiagramSaving}
              >
                <CloseIcon size={18} />
              </button>
            </div>
            {manualDiagramError && <p className="drill-modal-error">{manualDiagramError}</p>}
            <DiagramComposer value={manualDiagramData} onChange={setManualDiagramData} minHeight={320} />
            <div className="drill-modal-actions">
              <button type="button" className="drill-secondary-button" onClick={() => setManualDiagramOpen(false)} disabled={manualDiagramSaving}>
                Annuler
              </button>
              <button type="button" className="drill-primary-button" onClick={() => void saveDiagram()} disabled={manualDiagramSaving}>
                {manualDiagramSaving ? 'Enregistrement…' : diagram ? 'Enregistrer le diagramme' : 'Créer le diagramme'}
              </button>
            </div>
          </div>
        </div>
      )}

      {writable && editing && (
        <div
          className="drill-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setEditing(false)}
        >
          <div className="drill-modal drill-modal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="drill-modal-head">
              <div>
                <h3>Modifier la fiche</h3>
                <p>Ajustez le titre, la catégorie et la description.</p>
              </div>
              <button
                type="button"
                className="drill-modal-close"
                aria-label="Fermer la fenetre"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                <CloseIcon size={18} />
              </button>
            </div>
            {editError && <p className="drill-modal-error">{editError}</p>}
            <form onSubmit={saveEdit} className="drill-form-grid">
              <label className="drill-form-field">
                <span>Titre</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre *" />
              </label>
              <label className="drill-form-field">
                <span>Catégorie</span>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie *" />
              </label>
              <label className="drill-form-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optionnel)"
                  rows={6}
                />
              </label>
              <div className="drill-modal-actions">
                <button type="button" className="drill-secondary-button" onClick={() => setEditing(false)}>Annuler</button>
                <button type="submit" disabled={saving} className="drill-primary-button">{saving ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
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

function formatDuration(value: number): string {
  return value > 0 ? `${value} min` : 'Variable'
}
