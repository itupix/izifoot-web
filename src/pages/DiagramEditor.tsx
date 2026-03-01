import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import DiagramComposer from '../components/DiagramComposer'
import { createEmptyDiagramData, normalizeDiagramData, type DiagramData } from '../components/diagramShared'
import { toErrorMessage } from '../errors'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import { uiAlert } from '../ui'

interface Diagram { id: string; title: string; data: DiagramData; drillId?: string | null; trainingDrillId?: string | null }
function qs(name: string) { const u = new URL(window.location.href); return u.searchParams.get(name) } // reads from hash-based URLs too

export default function DiagramEditor() {
  const navigate = useNavigate()
  const [data, setData] = useState<DiagramData>(createEmptyDiagramData())
  const [saving, setSaving] = useState(false)

  // context: either existing diagram id OR target drill/trainingDrill
  const diagramId = qs('id')
  const drillId = qs('drillId')
  const trainingDrillId = qs('trainingDrillId')

  // load if editing
  const loadDiagram = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!diagramId) return
    const d = await apiGet<Diagram>(apiRoutes.diagrams.byId(diagramId))
    if (isCancelled()) return
    setData(normalizeDiagramData(d.data))
  }, [diagramId])

  const { loading, error, setError } = useAsyncLoader(loadDiagram)

  async function save() {
    try {
      setSaving(true); setError(null)
      const payload = { title: 'Diagramme', data }
      let saved: Diagram
      if (diagramId) {
        saved = await apiPut<Diagram>(apiRoutes.diagrams.byId(diagramId), payload)
      } else if (trainingDrillId) {
        saved = await apiPost<Diagram>(apiRoutes.trainingDrills.diagrams(trainingDrillId), payload)
      } else if (drillId) {
        saved = await apiPost<Diagram>(apiRoutes.drills.diagrams(drillId), payload)
      } else {
        uiAlert('Contexte manquant (drillId ou trainingDrillId)'); return
      }
      // redirect or just notify
      uiAlert('Diagramme sauvegardé ✔️')
      if (!diagramId) {
        navigate(`/diagram-editor?id=${saved.id}`)
      }
    } catch (err: unknown) {
      setError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>Éditeur de diagramme</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={loading || saving} style={{ border: '1px solid #d1d5db', borderRadius: 6, background: '#f3f4f6', padding: '6px 10px' }}>
            {diagramId ? 'Mettre à jour' : 'Sauvegarder'}
          </button>
        </div>
        {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
      </section>
      <DiagramComposer value={data} onChange={setData} minHeight={360} />
    </div>
  )
}
