export type PlayerColor = 'blue' | 'red' | 'yellow' | 'green' | 'orange'
export type UUID = string

export interface PlayerNode { type: 'player'; id: UUID; x: number; y: number; label?: string; color: PlayerColor }
export interface ConeNode { type: 'cone'; id: UUID; x: number; y: number }
export interface CupNode { type: 'cup'; id: UUID; x: number; y: number }
export interface BallNode { type: 'ball'; id: UUID; x: number; y: number }
export interface PostNode { type: 'post'; id: UUID; x: number; y: number }
export interface Arrow { type: 'arrow'; id: UUID; from: { x: number; y: number }; to: { x: number; y: number } }
export type Item = PlayerNode | ConeNode | CupNode | BallNode | PostNode | Arrow

export interface DiagramFrame {
  id: string
  name: string
  items: Item[]
}

export interface DiagramData {
  frames: DiagramFrame[]
  fps?: number
  orientation?: DiagramOrientation
}

export type DiagramOrientation = 'landscape' | 'portrait'

export const PLAYER_COLOR_OPTIONS: Array<{ value: PlayerColor; label: string; fill: string }> = [
  { value: 'blue', label: 'Bleu', fill: '#3b82f6' },
  { value: 'red', label: 'Rouge', fill: '#ef4444' },
  { value: 'yellow', label: 'Jaune', fill: '#eab308' },
  { value: 'green', label: 'Vert', fill: '#22c55e' },
  { value: 'orange', label: 'Orange', fill: '#f97316' },
]

export const MAX_STEPS = 10
export const LANDSCAPE_FIELD_SIZE = { width: 600, height: 380 }
export const PORTRAIT_FIELD_SIZE = { width: 380, height: 600 }
const FIELD_MARGIN = 5

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function createFrame(name = 'Etape 1', items: Item[] = []): DiagramFrame {
  return { id: uid(), name, items }
}

function ensureTenFrames(frames: DiagramFrame[]): DiagramFrame[] {
  const normalized = frames.slice(0, MAX_STEPS).map((frame, index) => ({
    ...frame,
    name: `Etape ${index + 1}`,
  }))
  while (normalized.length < MAX_STEPS) {
    normalized.push(createFrame(`Etape ${normalized.length + 1}`))
  }
  return normalized
}

function normalizeItems(items: unknown): Item[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') return []
    const item = rawItem as Record<string, unknown>
    const type = item.type
    const id = typeof item.id === 'string' ? item.id : uid()

    if (type === 'player') {
      const color = typeof item.color === 'string'
        ? item.color as PlayerColor
        : item.side === 'away'
          ? 'red'
          : 'blue'
      return [{
        type: 'player' as const,
        id,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        label: typeof item.label === 'string' ? item.label : '',
        color,
      }]
    }

    if (type === 'cone' || type === 'cup' || type === 'ball' || type === 'post') {
      return [{
        type,
        id,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
      }] as Item[]
    }

    if (type === 'arrow') {
      const from = item.from as Record<string, unknown> | undefined
      const to = item.to as Record<string, unknown> | undefined
      return [{
        type: 'arrow' as const,
        id,
        from: { x: Number(from?.x) || 0, y: Number(from?.y) || 0 },
        to: { x: Number(to?.x) || 0, y: Number(to?.y) || 0 },
      }]
    }

    return []
  })
}

export function createEmptyDiagramData(): DiagramData {
  return { frames: ensureTenFrames([createFrame()]), fps: 2, orientation: 'landscape' }
}

export function normalizeDiagramOrientation(input: unknown): DiagramOrientation {
  return input === 'portrait' ? 'portrait' : 'landscape'
}

function mapPointBetweenOrientations(
  point: { x: number; y: number },
  from: DiagramOrientation,
  to: DiagramOrientation,
): { x: number; y: number } {
  if (from === to) return point
  const fromSize = from === 'portrait' ? PORTRAIT_FIELD_SIZE : LANDSCAPE_FIELD_SIZE
  const toSize = to === 'portrait' ? PORTRAIT_FIELD_SIZE : LANDSCAPE_FIELD_SIZE
  const fromInnerWidth = fromSize.width - FIELD_MARGIN * 2
  const fromInnerHeight = fromSize.height - FIELD_MARGIN * 2
  const toInnerWidth = toSize.width - FIELD_MARGIN * 2
  const toInnerHeight = toSize.height - FIELD_MARGIN * 2

  const nx = Math.min(1, Math.max(0, (point.x - FIELD_MARGIN) / fromInnerWidth))
  const ny = Math.min(1, Math.max(0, (point.y - FIELD_MARGIN) / fromInnerHeight))
  const rotated = from === 'landscape' && to === 'portrait'
    ? { nx: ny, ny: 1 - nx }
    : { nx: 1 - ny, ny: nx }

  return {
    x: FIELD_MARGIN + rotated.nx * toInnerWidth,
    y: FIELD_MARGIN + rotated.ny * toInnerHeight,
  }
}

function mapItemBetweenOrientations(item: Item, from: DiagramOrientation, to: DiagramOrientation): Item {
  if (from === to) return item
  if (item.type === 'arrow') {
    return {
      ...item,
      from: mapPointBetweenOrientations(item.from, from, to),
      to: mapPointBetweenOrientations(item.to, from, to),
    }
  }
  return {
    ...item,
    ...mapPointBetweenOrientations({ x: item.x, y: item.y }, from, to),
  } as Item
}

export function remapDiagramToOrientation(data: DiagramData, target: DiagramOrientation): DiagramData {
  const from = normalizeDiagramOrientation(data.orientation)
  if (from === target) return { ...data, orientation: target }
  return {
    ...data,
    orientation: target,
    frames: data.frames.map((frame) => ({
      ...frame,
      items: frame.items.map((item) => mapItemBetweenOrientations(item, from, target)),
    })),
  }
}

export function normalizeDiagramData(input: unknown): DiagramData {
  try {
    const obj = typeof input === 'string' ? JSON.parse(input) : input
    if (!obj || typeof obj !== 'object') return createEmptyDiagramData()
    const maybeItems = (obj as { items?: unknown }).items
    const maybeFrames = (obj as { frames?: unknown }).frames
    const fps = Number((obj as { fps?: unknown }).fps)
    const orientation = normalizeDiagramOrientation((obj as { orientation?: unknown }).orientation)

    if (Array.isArray(maybeFrames) && maybeFrames.length > 0) {
      const frames = maybeFrames.map((frame, idx) => {
        const raw = frame as { id?: unknown; name?: unknown; items?: unknown }
        return {
          id: typeof raw.id === 'string' ? raw.id : uid(),
          name: typeof raw.name === 'string' ? raw.name : `Etape ${idx + 1}`,
          items: normalizeItems(raw.items),
        }
      })
      return { frames: ensureTenFrames(frames), fps: Number.isFinite(fps) && fps > 0 ? fps : 2, orientation }
    }

    if (Array.isArray(maybeItems)) {
      return { frames: ensureTenFrames([createFrame('Etape 1', normalizeItems(maybeItems))]), fps: 2, orientation }
    }

    return createEmptyDiagramData()
  } catch {
    return createEmptyDiagramData()
  }
}

export function hasDiagramContent(data: DiagramData): boolean {
  return data.frames.some((frame) => frame.items.length > 0)
}

export function summarizeDiagramMaterials(input: unknown): string[] {
  const data = normalizeDiagramData(input)
  const maxCounts = { cone: 0, cup: 0, ball: 0, post: 0, players: 0 }
  const colors = new Set<PlayerColor>()

  data.frames.forEach((frame) => {
    const counts = { cone: 0, cup: 0, ball: 0, post: 0, players: 0 }
    frame.items.forEach((item) => {
      if (item.type === 'player') {
        counts.players += 1
        colors.add(item.color)
      } else if (item.type === 'cone') {
        counts.cone += 1
      } else if (item.type === 'cup') {
        counts.cup += 1
      } else if (item.type === 'ball') {
        counts.ball += 1
      } else if (item.type === 'post') {
        counts.post += 1
      }
    })
    maxCounts.cone = Math.max(maxCounts.cone, counts.cone)
    maxCounts.cup = Math.max(maxCounts.cup, counts.cup)
    maxCounts.ball = Math.max(maxCounts.ball, counts.ball)
    maxCounts.post = Math.max(maxCounts.post, counts.post)
    maxCounts.players = Math.max(maxCounts.players, counts.players)
  })

  const lines: string[] = []
  if (maxCounts.cup > 0) lines.push(`${maxCounts.cup} coupelle${maxCounts.cup > 1 ? 's' : ''}`)
  if (maxCounts.cone > 0) lines.push(`${maxCounts.cone} cône${maxCounts.cone > 1 ? 's' : ''}`)
  if (maxCounts.ball > 0) lines.push(`${maxCounts.ball} ballon${maxCounts.ball > 1 ? 's' : ''}`)
  if (maxCounts.post > 0) lines.push(`${maxCounts.post} poteau${maxCounts.post > 1 ? 'x' : ''}`)
  if (colors.size >= 2 && maxCounts.players > 0) lines.push('chasubles')
  return lines
}

export function getPlayerFill(color: PlayerColor): string {
  return PLAYER_COLOR_OPTIONS.find((option) => option.value === color)?.fill || '#3b82f6'
}

export function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress
}

export function interpolateItem(fromItem: Item | undefined, toItem: Item, progress: number): Item {
  if (!fromItem || fromItem.type !== toItem.type) return toItem

  if (toItem.type === 'player' && fromItem.type === 'player') {
    return { ...toItem, x: lerp(fromItem.x, toItem.x, progress), y: lerp(fromItem.y, toItem.y, progress) }
  }

  if (
    (toItem.type === 'cone' && fromItem.type === 'cone') ||
    (toItem.type === 'cup' && fromItem.type === 'cup') ||
    (toItem.type === 'ball' && fromItem.type === 'ball') ||
    (toItem.type === 'post' && fromItem.type === 'post')
  ) {
    return { ...toItem, x: lerp(fromItem.x, toItem.x, progress), y: lerp(fromItem.y, toItem.y, progress) }
  }

  if (toItem.type === 'arrow' && fromItem.type === 'arrow') {
    return {
      ...toItem,
      from: { x: lerp(fromItem.from.x, toItem.from.x, progress), y: lerp(fromItem.from.y, toItem.from.y, progress) },
      to: { x: lerp(fromItem.to.x, toItem.to.x, progress), y: lerp(fromItem.to.y, toItem.to.y, progress) },
    }
  }

  return toItem
}
