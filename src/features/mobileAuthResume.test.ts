import { describe, expect, it } from 'vitest'
import {
  mobileAuthResumeStorageKey,
  parseMobileAuthResumeAttempts,
  readMobileAuthResumeAttempts,
  writeMobileAuthResumeAttempts,
} from './mobileAuthResume'

function createStorageStub() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

describe('mobileAuthResumeStorageKey', () => {
  it('prefixes the state with the mobile auth namespace', () => {
    expect(mobileAuthResumeStorageKey('state-123')).toBe('izifoot.mobileAuth.resume.state-123')
  })
})

describe('parseMobileAuthResumeAttempts', () => {
  it('returns 0 for empty or invalid values', () => {
    expect(parseMobileAuthResumeAttempts(null)).toBe(0)
    expect(parseMobileAuthResumeAttempts('')).toBe(0)
    expect(parseMobileAuthResumeAttempts('abc')).toBe(0)
    expect(parseMobileAuthResumeAttempts('-1')).toBe(0)
  })

  it('returns a positive integer for persisted attempts', () => {
    expect(parseMobileAuthResumeAttempts('1')).toBe(1)
    expect(parseMobileAuthResumeAttempts('2')).toBe(2)
  })
})

describe('mobile auth resume storage', () => {
  it('writes and reads attempts for a given state', () => {
    const storage = createStorageStub()
    writeMobileAuthResumeAttempts(storage, 'state-abc', 1)
    expect(readMobileAuthResumeAttempts(storage, 'state-abc')).toBe(1)
  })

  it('clears attempts when asked to reset the state', () => {
    const storage = createStorageStub()
    writeMobileAuthResumeAttempts(storage, 'state-abc', 2)
    writeMobileAuthResumeAttempts(storage, 'state-abc', 0)
    expect(readMobileAuthResumeAttempts(storage, 'state-abc')).toBe(0)
  })
})
