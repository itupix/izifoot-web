import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { materialsStatus, type TrainingMaterialsResponse } from '../features/trainingMaterials'

type Props = { trainingId: string; drillRevision: string; teamId: string | null }

export default function TrainingMaterials({ trainingId, drillRevision, teamId }: Props) {
  const [materials, setMaterials] = useState<TrainingMaterialsResponse | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setMaterials(null)
    apiGet<TrainingMaterialsResponse>(apiRoutes.trainings.materials(trainingId))
      .then((result) => { if (!cancelled) setMaterials(result) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trainingId, drillRevision, teamId, revision])
  const status = materials ? materialsStatus(materials) : null

  return (
    <section className="details-card training-materials" aria-labelledby="training-materials-title" aria-busy={loading}>
      <div className="card-head"><h3 id="training-materials-title">Matériel</h3></div>
      <p className="muted-line">Quantités maximales nécessaires pour les exercices de la séance.</p>
      {loading ? <p role="status" className="muted-line">Chargement du matériel…</p> : error ? (
        <div role="alert">
          <p>Impossible de charger le matériel nécessaire.</p>
          <button type="button" className="add-button" onClick={refresh}>Réessayer</button>
        </div>
      ) : materials ? (
        <>
          {materials.items.length > 0 && (
            <ul className="training-materials-list">
              {materials.items.map((item) => (
                <li key={item.type}>
                  <span>{item.label}</span>
                  {item.quantity !== null && <strong>{item.quantity}</strong>}
                </li>
              ))}
            </ul>
          )}
          {status && <p className="muted-line" role="status">{status}</p>}
        </>
      ) : null}
    </section>
  )
}
