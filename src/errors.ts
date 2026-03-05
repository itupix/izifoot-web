export function toErrorMessage(err: unknown, fallback = 'Erreur', htmlFallback?: string): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status?: unknown }).status
    if (status === 403) return 'Accès non autorisé pour ce rôle'
    if (status === 401) return 'Session expirée. Veuillez vous reconnecter.'
  }
  if (htmlFallback && msg.includes('<!DOCTYPE')) return htmlFallback
  return msg || fallback
}
