import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { canLoadMore, mergeById, nextOffset, normalizeDrillsResponse, withPagination } from '../adapters/pagination'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { canWrite } from '../authz'
import DiagramComposer from '../components/DiagramComposer'
import FloatingPlusButton from '../components/FloatingPlusButton'
import SearchInput from '../components/SearchInput'
import { createEmptyDiagramData, hasDiagramContent, type DiagramData } from '../components/diagramShared'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { useAuth } from '../useAuth'
import { useTeamScope } from '../useTeamScope'
import type { Drill, DrillsResponse } from '../types/api'
import './Drills.css'

const DRILLS_PAGE_LIMIT = 40

export default function DrillsPage() {
  const { me } = useAuth()
  const { selectedTeamId, requiresSelection } = useTeamScope()
  const navigate = useNavigate()
  const [data, setData] = useState<DrillsResponse>({ items: [], categories: [], tags: [] })
  const [drillsPagination, setDrillsPagination] = useState({ limit: DRILLS_PAGE_LIMIT, offset: 0, returned: 0 })
  const [loadingMoreDrills, setLoadingMoreDrills] = useState(false)
  const [q, setQ] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  // creation form state
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDiagramData, setNewDiagramData] = useState<DiagramData>(createEmptyDiagramData())
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const writable = me ? canWrite(me.role) : false
  const teamScopedWritable = writable && (!requiresSelection || Boolean(selectedTeamId))

  const loadDrills = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const raw = await apiGet<unknown>(withPagination(apiRoutes.drills.list, { limit: DRILLS_PAGE_LIMIT, offset: 0 }))
    const res = normalizeDrillsResponse(raw, { limit: DRILLS_PAGE_LIMIT, offset: 0 })
    if (isCancelled()) return
    setData(res)
    setDrillsPagination(res.pagination)
  }, [])

  const { loading, error } = useAsyncLoader(loadDrills)
  const canLoadMoreDrills = useMemo(() => canLoadMore(drillsPagination), [drillsPagination])

  const filtered = useMemo(() => {
    let items = requiresSelection && !selectedTeamId
      ? []
      : selectedTeamId
        ? data.items.filter((drill) => !drill.teamId || drill.teamId === selectedTeamId)
        : data.items
    if (q.trim()) {
      const needle = q.toLowerCase()
      items = items.filter(d =>
        d.title.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle)
      )
    }
    if (selectedCategories.length > 0) {
      const allowed = new Set(selectedCategories)
      items = items.filter((d) => allowed.has(d.category))
    }
    return items
  }, [data.items, q, requiresSelection, selectedCategories, selectedTeamId])

  const categories = useMemo(() => data.categories, [data.categories])

  function toggleCategory(category: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) return prev.filter((value) => value !== category)
      return [...prev, category]
    })
  }

  async function createDrill(e: React.FormEvent) {
    e.preventDefault()
    if (!teamScopedWritable) return
    setCreateErr(null)
    if (!newTitle || !newCategory) {
      setCreateErr('Remplis tous les champs obligatoires.')
      return
    }
    try {
      setCreating(true)
      const payload = {
        title: newTitle.trim(),
        category: newCategory.trim(),
        duration: 1,
        players: 'Variable',
        description: newDescription.trim(),
        tags: [],
        teamId: selectedTeamId || undefined,
      }
      const created = await apiPost<Drill>(apiRoutes.drills.list, payload)
      if (hasDiagramContent(newDiagramData)) {
        await apiPost(apiRoutes.drills.diagrams(created.id), {
          title: 'Diagramme',
          data: newDiagramData,
        })
      }
      const raw = await apiGet<unknown>(withPagination(apiRoutes.drills.list, { limit: DRILLS_PAGE_LIMIT, offset: 0 }))
      const res = normalizeDrillsResponse(raw, { limit: DRILLS_PAGE_LIMIT, offset: 0 })
      setData(res)
      setDrillsPagination(res.pagination)
      setNewTitle('')
      setNewCategory('')
      setNewDescription('')
      setNewDiagramData(createEmptyDiagramData())
      setShowCreateModal(false)
      navigate(`/exercices/${created.id}`)
    } catch (err: unknown) {
      setCreateErr(toErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function loadMoreDrills() {
    if (loadingMoreDrills || !canLoadMoreDrills) return
    const offset = nextOffset(drillsPagination)
    setLoadingMoreDrills(true)
    try {
      const raw = await apiGet<unknown>(withPagination(apiRoutes.drills.list, { limit: DRILLS_PAGE_LIMIT, offset }))
      const next = normalizeDrillsResponse(raw, { limit: DRILLS_PAGE_LIMIT, offset })
      setData((prev) => ({
        items: mergeById(prev.items, next.items),
        categories: next.categories.length ? next.categories : prev.categories,
        tags: next.tags.length ? next.tags : prev.tags,
      }))
      setDrillsPagination(next.pagination)
    } catch (err: unknown) {
      setCreateErr(toErrorMessage(err))
    } finally {
      setLoadingMoreDrills(false)
    }
  }

  return (
    <div className="page-shell" style={{ position: 'relative' }}>
      <header className="drills-head">
        <div className="drills-mainrow">
          <h1 className="drills-title">Exercices</h1>
          <p className="panel-note">{filtered.length} résultat(s)</p>
        </div>
      </header>
      {writable && requiresSelection && !selectedTeamId && (
        <div className="inline-alert">
          Sélectionnez une équipe active pour modifier les exercices.
        </div>
      )}
      <section className="panel" style={{ marginBottom: 0 }}>
        <div className="drills-search-block">
          <SearchInput
            placeholder="Recherche (titre, description)"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        {categories.length > 0 && (
          <div className="drills-category-tags" aria-label="Filtres catégories">
            {categories.map((cat) => {
              const active = selectedCategories.includes(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  className={`drills-category-tag ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        )}
      </section>
      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <div className="panel-head" style={{ marginBottom: 0 }}>
          <h3 className="panel-title">Liste</h3>
          <p className="panel-note">{filtered.length} exercice(s)</p>
        </div>
        {(loading || loadingMoreDrills) && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
        {error && <div className="inline-alert error">{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {filtered.map(d => (
          <article
            key={d.id}
            onClick={() => navigate(`/exercices/${d.id}`)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}
          >
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{d.category}</div>
            <header>
              <strong>{d.title}</strong>
            </header>
            <p style={{ fontSize: 13, color: '#374151', marginTop: 8, marginBottom: 0 }}>
              {d.description}
            </p>
          </article>
        ))}
        {filtered.length === 0 && <div className="panel-note">Aucun exercice trouvé avec ces filtres.</div>}
        </div>
        {canLoadMoreDrills && (
          <button
            type="button"
            onClick={() => { void loadMoreDrills() }}
            disabled={loading || loadingMoreDrills}
            style={{ width: 'fit-content', padding: '8px 12px', borderRadius: 8, border: '1px solid #dbe3ef', background: '#fff', cursor: 'pointer' }}
          >
            {loadingMoreDrills ? 'Chargement...' : 'Charger plus'}
          </button>
        )}
      </section>
      {teamScopedWritable && (
        <FloatingPlusButton ariaLabel="Nouvel exercice" zIndex={20} onClick={() => {
          setCreateErr(null)
          setNewDiagramData(createEmptyDiagramData())
          setShowCreateModal(true)
        }} />
      )}
      {teamScopedWritable && showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.35)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '76px 12px 12px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
          onClick={() => { if (!creating) setShowCreateModal(false) }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 860,
              background: 'white',
              borderRadius: 10,
              padding: 16,
              marginBottom: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Nouvel exercice</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}
              >
                ×
              </button>
            </div>
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
              <textarea
                placeholder="Description (optionnel)"
                rows={4}
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12, resize: 'vertical' }}
              />
              <div style={{ marginBottom: 12 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>Diagramme (optionnel)</strong>
                <DiagramComposer value={newDiagramData} onChange={setNewDiagramData} minHeight={300} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
                >
                  {creating ? 'Création…' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
