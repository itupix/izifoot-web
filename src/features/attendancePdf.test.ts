import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGetPdf } from '../apiClient'
import { downloadAttendancePdf } from './attendancePdf'
vi.mock('../apiClient', () => ({ apiGetPdf: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers() })
describe('monthly report download', () => {
  it('discards a response after changing team/month or leaving the monthly view', async () => {
    let resolve!: (blob: Blob) => void
    vi.mocked(apiGetPdf).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    let current = true
    const create = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create })
    const request = downloadAttendancePdf('team / one', '2026-11', () => current)
    current = false
    resolve(new Blob(['%PDF']))
    await request
    expect(apiGetPdf).toHaveBeenCalledWith('/teams/team%20%2F%20one/attendance-report/pdf?month=2026-11')
    expect(create).not.toHaveBeenCalled()
  })
  it('downloads the selected month and cleans up the link and object URL', async () => {
    vi.useFakeTimers()
    const pdf = new Blob(['%PDF'])
    vi.mocked(apiGetPdf).mockResolvedValueOnce(pdf)
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: revoke })
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } })
    vi.stubGlobal('window', { setTimeout })
    await downloadAttendancePdf('team', '2026-11', () => true)
    expect(link.download).toBe('presences-2026-11.pdf')
    expect(link.href).toBe('blob:report')
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:report')
  })
  it('propagates server failure without creating a download', async () => {
    vi.mocked(apiGetPdf).mockRejectedValueOnce(new Error('HTTP 403'))
    await expect(downloadAttendancePdf('team', '2026-11', () => true)).rejects.toThrow('403')
  })
})
