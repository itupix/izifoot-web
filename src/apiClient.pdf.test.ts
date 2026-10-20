import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGetPdf } from './apiClient'
import { HttpError } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('authenticated PDF downloads', () => {
  it('preserves cookie, bearer and team authentication and returns PDF bytes', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => ({ token: 'test-token', 'izifoot.activeTeamId': 'team-1' })[key] })
    const fetchMock = vi.fn().mockResolvedValue(new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    const blob = await apiGetPdf('/trainings/session-1/summary.pdf?timeZone=Europe%2FParis')
    expect(await blob.text()).toBe('%PDF-1.4')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/trainings/session-1/summary.pdf?timeZone=Europe%2FParis'), {
      credentials: 'include', cache: 'no-store', headers: {
        Accept: 'application/pdf', Authorization: 'Bearer test-token', 'X-Team-Id': 'team-1', 'X-Active-Team-Id': 'team-1',
      },
    })
  })

  it('reports server JSON errors without downloading an error document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Training not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(apiGetPdf('/trainings/missing/summary.pdf')).rejects.toMatchObject({ status: 404, message: 'Training not found' } satisfies Partial<HttpError>)
  })

  it('rejects successful responses with an unexpected content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>sign in</html>', { headers: { 'Content-Type': 'text/html' } })))
    await expect(apiGetPdf('/trainings/id/summary.pdf')).rejects.toThrow('PDF')
  })
})
