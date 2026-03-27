import { apiGet } from '../apiClient'
import type { Drill, DrillsResponse, PaginationMeta, PaginatedResponse } from '../types/api'

type PaginationInput = {
  limit?: number
  offset?: number
}

const DEFAULT_LIMIT = 50

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function appendQueryParams(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const url = new URL(path, 'https://izifoot.local')
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }
  const query = url.searchParams.toString()
  return `${url.pathname}${query ? `?${query}` : ''}`
}

export function withPagination(path: string, input: PaginationInput): string {
  const limit = input.limit ?? DEFAULT_LIMIT
  const offset = input.offset ?? 0
  return appendQueryParams(path, { limit, offset })
}

export function hasExplicitPagination(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  return isRecord(payload.pagination)
}

export function normalizePaginatedResponse<T>(
  payload: unknown,
  fallback: PaginationInput = {},
): PaginatedResponse<T> {
  const limitFallback = fallback.limit ?? DEFAULT_LIMIT
  const offsetFallback = fallback.offset ?? 0

  if (Array.isArray(payload)) {
    return {
      items: payload as T[],
      pagination: {
        limit: limitFallback,
        offset: offsetFallback,
        returned: payload.length,
      },
    }
  }

  if (isRecord(payload) && Array.isArray(payload.items)) {
    const items = payload.items as T[]
    const paginationRaw = isRecord(payload.pagination) ? payload.pagination : {}
    return {
      items,
      pagination: {
        limit: readNumber(paginationRaw.limit, limitFallback),
        offset: readNumber(paginationRaw.offset, offsetFallback),
        returned: readNumber(paginationRaw.returned, items.length),
      },
    }
  }

  return {
    items: [],
    pagination: {
      limit: limitFallback,
      offset: offsetFallback,
      returned: 0,
    },
  }
}

export function normalizeDrillsResponse(
  payload: unknown,
  fallback: PaginationInput = {},
): DrillsResponse & { pagination: PaginationMeta } {
  const normalized = normalizePaginatedResponse<Drill>(payload, fallback)
  const raw = isRecord(payload) ? payload : {}
  const categories = Array.isArray(raw.categories) ? raw.categories.filter((value): value is string => typeof value === 'string') : []
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((value): value is string => typeof value === 'string') : []

  return {
    items: normalized.items,
    categories,
    tags,
    pagination: normalized.pagination,
  }
}

export function canLoadMore(pagination: PaginationMeta): boolean {
  return pagination.limit > 0 && pagination.returned >= pagination.limit
}

export function nextOffset(pagination: PaginationMeta): number {
  return pagination.offset + pagination.returned
}

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values())
}

export async function apiGetAllItems<T>(
  path: string,
  options: { limit?: number; maxPages?: number } = {},
): Promise<T[]> {
  const limit = options.limit ?? 100
  const maxPages = options.maxPages ?? 50

  const firstPath = withPagination(path, { limit, offset: 0 })
  const firstRaw = await apiGet<unknown>(firstPath)
  const first = normalizePaginatedResponse<T>(firstRaw, { limit, offset: 0 })

  if (!hasExplicitPagination(firstRaw)) {
    return first.items
  }

  const all = [...first.items]
  let pagination = first.pagination
  let pageCount = 1

  while (canLoadMore(pagination) && pageCount < maxPages) {
    const offset = nextOffset(pagination)
    const raw = await apiGet<unknown>(withPagination(path, { limit, offset }))
    const page = normalizePaginatedResponse<T>(raw, { limit, offset })
    all.push(...page.items)
    pagination = page.pagination
    pageCount += 1
    if (!hasExplicitPagination(raw)) break
  }

  return all
}
