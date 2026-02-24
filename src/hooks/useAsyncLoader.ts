import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'
import { toErrorMessage } from '../errors'

type LoadContext = {
  isCancelled: () => boolean
}

export function useAsyncLoader(
  load: (ctx: LoadContext) => Promise<void>,
  deps: DependencyList
): { loading: boolean; error: string | null; setError: (message: string | null) => void } {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        await load({ isCancelled: () => cancelled })
      } catch (err: unknown) {
        if (!cancelled) setError(toErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, deps)

  return { loading, error, setError }
}
