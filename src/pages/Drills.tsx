import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import DiagramComposer from '../components/DiagramComposer'
import FloatingPlusButton from '../components/FloatingPlusButton'
import SearchSelectBar from '../components/SearchSelectBar'
import { createEmptyDiagramData, hasDiagramContent, type DiagramData } from '../components/diagramShared'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import type { Drill, DrillsResponse } from '../types/api'

export default function DrillsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DrillsResponse>({ items: [], categories: [], tags: [] })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // creation form state
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDiagramData, setNewDiagramData] = useState<DiagramData>(createEmptyDiagramData())
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const loadDrills = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    const res = await apiGet<DrillsResponse>(apiRoutes.drills.list)
    if (!isCancelled()) setData(res)
  }, [])

  const { loading, error } = useAsyncLoader(loadDrills)

  const filtered = useMemo(() => {
    let items = data.items
    if (q.trim()) {
      const needle = q.toLowerCase()
      items = items.filter(d =>
        d.title.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle)
      )
    }
    if (category) items = items.filter(d => d.category === category)
    return items
  }, [data.items, q, category])

  const categories = useMemo(() => data.categories, [data.categories])

  async function createDrill(e: React.FormEvent) {
    e.preventDefault()
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
        tags: []
      }
      const created = await apiPost<Drill>(apiRoutes.drills.list, payload)
      if (hasDiagramContent(newDiagramData)) {
        await apiPost(apiRoutes.drills.diagrams(created.id), {
          title: 'Diagramme',
          data: newDiagramData,
        })
      }
      const res = await apiGet<DrillsResponse>(apiRoutes.drills.list)
      setData(res)
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

  return (
    <div style={{ position: 'relative' }}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>Exercices</h2>
      <div style={{ marginBottom: 14 }}>
        <SearchSelectBar
          query={q}
          onQueryChange={setQ}
          queryPlaceholder="Recherche (titre, description)"
          selectValue={category}
          onSelectChange={setCategory}
          selectPlaceholder="Toutes les catégories"
          options={categories.map(c => ({ value: c, label: c }))}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>{filtered.length} exercice(s)</div>
        {loading && <div style={{ color: '#9ca3af' }}>Chargement…</div>}
        {error && <div style={{ color: 'crimson' }}>{error}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {filtered.map(d => (
          <article
            key={d.id}
            onClick={() => navigate(`/exercices/${d.id}`)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff', cursor: 'pointer' }}
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
      </div>
      <FloatingPlusButton ariaLabel="Nouvel exercice" zIndex={20} onClick={() => {
        setCreateErr(null)
        setNewDiagramData(createEmptyDiagramData())
        setShowCreateModal(true)
      }} />
      {showCreateModal && (
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
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
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
