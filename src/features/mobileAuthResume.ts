const MOBILE_AUTH_RESUME_STORAGE_PREFIX = 'izifoot.mobileAuth.resume.'

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export function mobileAuthResumeStorageKey(state: string) {
  return `${MOBILE_AUTH_RESUME_STORAGE_PREFIX}${state}`
}

export function parseMobileAuthResumeAttempts(raw: string | null | undefined) {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function readMobileAuthResumeAttempts(storage: StorageLike | null | undefined, state: string) {
  const normalizedState = state.trim()
  if (!storage || !normalizedState) return 0
  return parseMobileAuthResumeAttempts(storage.getItem(mobileAuthResumeStorageKey(normalizedState)))
}

export function writeMobileAuthResumeAttempts(
  storage: StorageLike | null | undefined,
  state: string,
  attempts: number
) {
  const normalizedState = state.trim()
  if (!storage || !normalizedState) return
  if (attempts > 0) {
    storage.setItem(mobileAuthResumeStorageKey(normalizedState), String(attempts))
    return
  }
  storage.removeItem(mobileAuthResumeStorageKey(normalizedState))
}
