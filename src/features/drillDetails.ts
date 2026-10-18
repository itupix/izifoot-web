import { apiGet } from '../apiClient'
import { toErrorMessage } from '../errors'

type DrillDiagram = { id: string; title: string; data: unknown }

// A failed request must never be interpreted as a confirmed empty diagram list.
export async function loadDrillDiagrams(path: string): Promise<{ diagram: DrillDiagram | null; error: string | null }> {
  try {
    const payload = await apiGet<unknown>(path)
    const items = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && 'items' in payload ? payload.items : null
    if (!Array.isArray(items)) throw new Error('Réponse diagrammes invalide.')
    return { diagram: items[0] ?? null, error: null }
  } catch (error) {
    return { diagram: null, error: toErrorMessage(error) }
  }
}
