export type TacticalPoint = { x: number; y: number }

export type TacticalFormation = {
  key: string
  label: string
  points: TacticalPoint[]
}

type Shape = {
  key: string
  label: string
  lines: [number, number, number]
}

const SHAPES_BY_PLAYERS: Partial<Record<number, Shape[]>> = {
  3: [
    { key: 'def', label: '1-0-1', lines: [1, 0, 1] },
    { key: 'mid', label: '1-1-0', lines: [1, 1, 0] },
    { key: 'att', label: '0-1-1', lines: [0, 1, 1] },
  ],
  5: [
    { key: 'balanced', label: '2-1-1', lines: [2, 1, 1] },
    { key: 'middle', label: '1-2-1', lines: [1, 2, 1] },
    { key: 'attack', label: '1-1-2', lines: [1, 1, 2] },
  ],
  8: [
    { key: 'balanced', label: '3-2-2', lines: [3, 2, 2] },
    { key: 'middle', label: '2-3-2', lines: [2, 3, 2] },
    { key: 'attack', label: '2-2-3', lines: [2, 2, 3] },
  ],
  11: [
    { key: 'balanced', label: '4-3-3', lines: [4, 3, 3] },
    { key: 'middle', label: '4-4-2', lines: [4, 4, 2] },
    { key: 'attack', label: '3-5-2', lines: [3, 5, 2] },
  ],
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeShape(playersOnField: number, lines: [number, number, number]): [number, number, number] {
  const outfield = Math.max(0, playersOnField - 1)
  const total = lines[0] + lines[1] + lines[2]
  if (total === outfield) return lines
  if (total === 0) return [outfield, 0, 0]

  const scaled = lines.map((value) => (value / total) * outfield)
  const next: [number, number, number] = [
    Math.floor(scaled[0]),
    Math.floor(scaled[1]),
    Math.floor(scaled[2]),
  ]
  let missing = outfield - (next[0] + next[1] + next[2])
  const order = [1, 0, 2] as const
  let idx = 0
  while (missing > 0) {
    next[order[idx % order.length]] += 1
    idx += 1
    missing -= 1
  }
  return next
}

function spreadXs(count: number): number[] {
  if (count <= 1) return [50]
  const min = 18
  const max = 82
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, index) => clamp(min + step * index, 8, 92))
}

function pointsFromLines(playersOnField: number, lines: [number, number, number]): TacticalPoint[] {
  const [defenders, midfielders, attackers] = normalizeShape(playersOnField, lines)
  const points: TacticalPoint[] = [{ x: 50, y: 90 }]

  for (const x of spreadXs(defenders)) points.push({ x, y: 72 })
  for (const x of spreadXs(midfielders)) points.push({ x, y: 53 })
  for (const x of spreadXs(attackers)) points.push({ x, y: 32 })

  return points.slice(0, Math.max(1, playersOnField))
}

export function buildTacticalTokens(playersOnField: number): string[] {
  const total = Math.max(1, playersOnField)
  return ['gk', ...Array.from({ length: Math.max(0, total - 1) }, (_, index) => `p${index + 1}`)]
}

export function buildTacticalFormations(playersOnField: number): TacticalFormation[] {
  const total = Math.max(1, playersOnField)
  const shapes = SHAPES_BY_PLAYERS[total] || [
    { key: 'balanced', label: 'Equilibre', lines: [Math.max(1, total - 2), 1, 0] as [number, number, number] },
  ]
  return shapes.map((shape) => ({
    key: shape.key,
    label: shape.label,
    points: pointsFromLines(total, shape.lines),
  }))
}

export function buildPointsMap(tokens: string[], points: TacticalPoint[]): Record<string, TacticalPoint> {
  return tokens.reduce<Record<string, TacticalPoint>>((acc, token, index) => {
    acc[token] = points[index] || { x: 50, y: 50 }
    return acc
  }, {})
}
