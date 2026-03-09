import { HttpError } from '../api'
import { toErrorMessage } from '../errors'

export type DiagramSummary = {
  id: string
  title?: string
  data?: unknown
}

export function normalizeDiagramList(input: unknown): DiagramSummary[] {
  if (Array.isArray(input)) return input as DiagramSummary[]
  if (input && typeof input === 'object' && Array.isArray((input as { items?: unknown }).items)) {
    return (input as { items: DiagramSummary[] }).items
  }
  return []
}

export function setLoadingById(prev: Record<string, boolean>, id: string, isLoading: boolean): Record<string, boolean> {
  if (isLoading) return { ...prev, [id]: true }
  if (!(id in prev)) return prev
  const next = { ...prev }
  delete next[id]
  return next
}

export function mapTrainingAiError(err: unknown, context: 'training' | 'diagram'): string {
  if (err instanceof HttpError) {
    if (err.status === 400) {
      return context === 'training'
        ? 'Objectif invalide: entre 10 et 400 caracteres.'
        : 'Requete invalide pour la generation du diagramme.'
    }
    if (err.status === 401) return 'Session expiree. Veuillez vous reconnecter.'
    if (err.status === 403) return 'Acces refuse: role COACH ou DIRECTION requis.'
    if (err.status === 404) {
      return context === 'training'
        ? 'Seance ou equipe introuvable.'
        : 'Exercice introuvable pour la generation du diagramme.'
    }
    if (err.status === 502) return 'Erreur IA: format de reponse invalide. Reessayez.'
    if (err.status === 503) return 'Service IA indisponible (reseau, quota ou auth OpenAI).'
    if (err.status === 504) return 'Generation IA timeout. Reessayez.'
  }
  return toErrorMessage(err, 'Erreur', 'Erreur serveur')
}
