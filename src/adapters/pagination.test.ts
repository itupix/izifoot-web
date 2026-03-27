import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../apiClient', () => ({
  apiGet: vi.fn(),
}))

import { apiGet } from '../apiClient'
import {
  apiGetAllItems,
  appendQueryParams,
  canLoadMore,
  mergeById,
  normalizeDrillsResponse,
  normalizePaginatedResponse,
  withPagination,
} from './pagination'

type Item = { id: string; label: string }

const apiGetMock = vi.mocked(apiGet)

describe('pagination adapter', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it('normalizes legacy array responses with fallback pagination', () => {
    const payload: Item[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]

    const normalized = normalizePaginatedResponse<Item>(payload, { limit: 25, offset: 10 })

    expect(normalized.items).toEqual(payload)
    expect(normalized.pagination).toEqual({ limit: 25, offset: 10, returned: 2 })
  })

  it('normalizes paginated list responses', () => {
    const normalized = normalizePaginatedResponse<Item>({
      items: [{ id: '1', label: 'A' }],
      pagination: { limit: 10, offset: 20, returned: 1 },
    })

    expect(normalized.items).toHaveLength(1)
    expect(normalized.pagination).toEqual({ limit: 10, offset: 20, returned: 1 })
  })

  it('normalizes drills response with categories, tags and pagination', () => {
    const response = normalizeDrillsResponse({
      items: [{ id: 'd1', title: 'Jeu', category: 'Technique', duration: 10, players: '8', description: 'desc', tags: [] }],
      categories: ['Technique'],
      tags: ['pressing'],
      pagination: { limit: 10, offset: 0, returned: 1 },
    })

    expect(response.items).toHaveLength(1)
    expect(response.categories).toEqual(['Technique'])
    expect(response.tags).toEqual(['pressing'])
    expect(response.pagination).toEqual({ limit: 10, offset: 0, returned: 1 })
  })

  it('builds query params and pagination paths', () => {
    expect(appendQueryParams('/matchday/a/summary', { includeAllPlayers: true })).toBe('/matchday/a/summary?includeAllPlayers=true')
    expect(withPagination('/matches?matchdayId=abc', { limit: 30, offset: 60 })).toBe('/matches?matchdayId=abc&limit=30&offset=60')
  })

  it('computes load-more condition and merges ids safely', () => {
    expect(canLoadMore({ limit: 20, offset: 0, returned: 20 })).toBe(true)
    expect(canLoadMore({ limit: 20, offset: 0, returned: 5 })).toBe(false)

    const merged = mergeById<Item>(
      [{ id: '1', label: 'old' }, { id: '2', label: 'B' }],
      [{ id: '1', label: 'new' }, { id: '3', label: 'C' }],
    )

    expect(merged).toEqual([
      { id: '1', label: 'new' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ])
  })

  it('apiGetAllItems returns first page only when payload is not explicitly paginated', async () => {
    apiGetMock.mockResolvedValueOnce([{ id: '1', label: 'A' }])

    const result = await apiGetAllItems<Item>('/players', { limit: 10 })

    expect(result).toEqual([{ id: '1', label: 'A' }])
    expect(apiGetMock).toHaveBeenCalledTimes(1)
  })

  it('apiGetAllItems follows pagination until last page', async () => {
    apiGetMock
      .mockResolvedValueOnce({
        items: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }],
        pagination: { limit: 2, offset: 0, returned: 2 },
      })
      .mockResolvedValueOnce({
        items: [{ id: '3', label: 'C' }],
        pagination: { limit: 2, offset: 2, returned: 1 },
      })

    const result = await apiGetAllItems<Item>('/players', { limit: 2 })

    expect(result).toEqual([
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ])
    expect(apiGetMock).toHaveBeenCalledTimes(2)
  })
})
