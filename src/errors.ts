export function toErrorMessage(err: unknown, fallback = 'Erreur', htmlFallback?: string): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (htmlFallback && msg.includes('<!DOCTYPE')) return htmlFallback
  return msg || fallback
}
