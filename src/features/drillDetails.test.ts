import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDrillDiagrams } from './drillDetails'

beforeEach(() => vi.stubGlobal('window', { location: { origin: 'http://localhost' } }))
afterEach(() => vi.unstubAllGlobals())

describe('drill diagram loading', () => {
  it('recognizes a confirmed empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    await expect(loadDrillDiagrams('/drills/1/diagrams')).resolves.toEqual({ diagram: null, error: null })
  })

  it('keeps a network failure distinct from an absent diagram', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connexion interrompue')))
    await expect(loadDrillDiagrams('/drills/1/diagrams')).resolves.toEqual({ diagram: null, error: 'Connexion interrompue' })
  })

  it('reports malformed results instead of enabling diagram creation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    expect((await loadDrillDiagrams('/drills/1/diagrams')).error).toBeTruthy()
  })

  it('supports existing list envelopes and preserves the diagram data', async () => {
    const diagram = { id: 'd1', title: 'Placement', data: { elements: [] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [diagram] }))))
    await expect(loadDrillDiagrams('/training-drills/1/diagrams')).resolves.toEqual({ diagram, error: null })
  })
})
