import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../api'
import { updateDrillDetails } from './drillEditing'

afterEach(() => vi.unstubAllGlobals())

describe('editing an existing drill', () => {
  it('uses PUT with only editable fields and returns the server representation', async () => {
    const updated = { id: 'drill-1', title: 'Nouveau titre', category: 'jeu', description: 'Consigne', descriptionHtml: '<p>Consigne</p>', tags: ['conservé'] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const draft = { title: 'Nouveau titre', category: 'jeu' as const, description: 'Consigne', tags: ['ancien'] }
    await expect(updateDrillDetails('drill-1', draft)).resolves.toEqual(updated)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/drills\/drill-1$/)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ title: 'Nouveau titre', category: 'jeu', description: 'Consigne' })
  })

  it('reports a deleted drill without retrying as a create request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Exercice introuvable' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(updateDrillDetails('deleted', { title: 'Titre', category: 'autres', description: 'Consigne' })).rejects.toBeInstanceOf(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
  })
})
