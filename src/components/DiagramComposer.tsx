import React, { useEffect, useMemo, useRef, useState } from 'react'
import './DiagramComposer.css'

export type Tool = 'select' | 'player' | 'cone' | 'cup' | 'ball' | 'post' | 'arrow'
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
}

interface Props {
  value: DiagramData
  onChange: (next: DiagramData) => void
  className?: string
  minHeight?: number
}

export const PLAYER_COLOR_OPTIONS: Array<{ value: PlayerColor; label: string; fill: string }> = [
  { value: 'blue', label: 'Bleu', fill: '#3b82f6' },
  { value: 'red', label: 'Rouge', fill: '#ef4444' },
  { value: 'yellow', label: 'Jaune', fill: '#eab308' },
  { value: 'green', label: 'Vert', fill: '#22c55e' },
  { value: 'orange', label: 'Orange', fill: '#f97316' },
]

const GRID_SIZE = 20
const MAX_STEPS = 10

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

function getPlayerFill(color: PlayerColor): string {
  return PLAYER_COLOR_OPTIONS.find((option) => option.value === color)?.fill || '#3b82f6'
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
  return { frames: ensureTenFrames([createFrame()]), fps: 2 }
}

export function normalizeDiagramData(input: unknown): DiagramData {
  try {
    const obj = typeof input === 'string' ? JSON.parse(input) : input
    if (!obj || typeof obj !== 'object') return createEmptyDiagramData()
    const maybeItems = (obj as { items?: unknown }).items
    const maybeFrames = (obj as { frames?: unknown }).frames
    const fps = Number((obj as { fps?: unknown }).fps)

    if (Array.isArray(maybeFrames) && maybeFrames.length > 0) {
      const frames = maybeFrames.map((frame, idx) => {
        const raw = frame as { id?: unknown; name?: unknown; items?: unknown }
        return {
          id: typeof raw.id === 'string' ? raw.id : uid(),
          name: typeof raw.name === 'string' ? raw.name : `Etape ${idx + 1}`,
          items: normalizeItems(raw.items),
        }
      })
      return { frames: ensureTenFrames(frames), fps: Number.isFinite(fps) && fps > 0 ? fps : 2 }
    }

    if (Array.isArray(maybeItems)) {
      return { frames: ensureTenFrames([createFrame('Etape 1', normalizeItems(maybeItems))]), fps: 2 }
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
  if (colors.size >= 2 && maxCounts.players > 0) lines.push(`${maxCounts.players} chasuble${maxCounts.players > 1 ? 's' : ''}`)
  return lines
}

function cloneItems(items: Item[]): Item[] {
  return items.map((item) => {
    if (item.type === 'arrow') {
      return { ...item, from: { ...item.from }, to: { ...item.to } }
    }
    return { ...item }
  })
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function interpolateItem(fromItem: Item | undefined, toItem: Item, progress: number): Item {
  if (!fromItem || fromItem.type !== toItem.type) return toItem

  if (toItem.type === 'player' && fromItem.type === 'player') {
    return { ...toItem, x: lerp(fromItem.x, toItem.x, progress), y: lerp(fromItem.y, toItem.y, progress) }
  }

  if ((toItem.type === 'cone' && fromItem.type === 'cone') || (toItem.type === 'cup' && fromItem.type === 'cup') || (toItem.type === 'post' && fromItem.type === 'post')) {
    return toItem
  }

  if (toItem.type === 'ball' && fromItem.type === 'ball') {
    return {
      ...toItem,
      x: lerp(fromItem.x, toItem.x, progress),
      y: lerp(fromItem.y, toItem.y, progress),
    }
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

export default function DiagramComposer({ value, onChange, className, minHeight = 320 }: Props) {
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFrameIndex, setActiveFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transitionFromIndex, setTransitionFromIndex] = useState<number | null>(null)
  const [transitionProgress, setTransitionProgress] = useState(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const arrowRef = useRef<{ id: string } | null>(null)

  const frames = value.frames.length ? value.frames : createEmptyDiagramData().frames
  const fps = Math.max(1, Math.min(8, Math.round(value.fps || 2)))
  const activeFrame = frames[Math.min(activeFrameIndex, frames.length - 1)]

  useEffect(() => {
    if (activeFrameIndex >= frames.length) setActiveFrameIndex(frames.length - 1)
  }, [activeFrameIndex, frames.length])

  function getPoint(evt: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function updateCurrentFrameItems(updater: (items: Item[]) => Item[]) {
    onChange({
      ...value,
      frames: frames.map((frame, index) => (index === activeFrameIndex ? { ...frame, items: updater(frame.items) } : frame)),
    })
  }

  function addPersistentItem(item: Item) {
    const nextFrames = frames.map((frame) => ({ ...frame, items: [...frame.items, cloneItems([item])[0]] }))
    onChange({ ...value, frames: nextFrames })
    setSelectedId(item.id)
  }

  function removeItemEverywhere(itemId: string) {
    onChange({
      ...value,
      frames: frames.map((frame) => ({ ...frame, items: frame.items.filter((it) => it.id !== itemId) })),
    })
  }

  function updateItemEverywhere(itemId: string, updater: (item: Item) => Item) {
    onChange({
      ...value,
      frames: frames.map((frame) => ({
        ...frame,
        items: frame.items.map((item) => (item.id === itemId ? updater(item) : item)),
      })),
    })
  }

  function updateItemFromCurrentForward(itemId: string, updater: (item: Item) => Item) {
    onChange({
      ...value,
      frames: frames.map((frame, index) => ({
        ...frame,
        items: index < activeFrameIndex
          ? frame.items
          : frame.items.map((item) => (item.id === itemId ? updater(item) : item)),
      })),
    })
  }

  function deleteSelected() {
    if (!selectedId) return
    removeItemEverywhere(selectedId)
    setSelectedId(null)
  }

  function resetCurrentStep() {
    onChange({
      ...value,
      frames: createEmptyDiagramData().frames,
    })
    setActiveFrameIndex(0)
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setSelectedId(null)
  }

  function goToStep(index: number) {
    if (index < 0 || index >= frames.length) return
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setActiveFrameIndex(index)
    setSelectedId(null)
  }

  function goToPreviousStep() {
    goToStep(activeFrameIndex - 1)
  }

  function animateToNextStep(keepPlaying: boolean) {
    if (activeFrameIndex >= frames.length - 1) {
      setIsPlaying(false)
      setTransitionFromIndex(null)
      setTransitionProgress(0)
      return
    }

    const fromIndex = activeFrameIndex
    const duration = Math.max(220, Math.round(1000 / fps))
    const start = performance.now()
    setTransitionFromIndex(fromIndex)
    setTransitionProgress(0)

    let raf = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setTransitionProgress(progress)
      if (progress < 1) {
        raf = window.requestAnimationFrame(tick)
        return
      }
      setTransitionFromIndex(null)
      setTransitionProgress(0)
      setActiveFrameIndex(Math.min(fromIndex + 1, frames.length - 1))
      if (!keepPlaying) setIsPlaying(false)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }

  function goToNextStep() {
    if (isPlaying) return
    animateToNextStep(false)
  }

  function startPlayback() {
    if (frames.length <= 1) return
    setSelectedId(null)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    if (activeFrameIndex >= frames.length - 1) setActiveFrameIndex(0)
    setIsPlaying((current) => !current)
  }

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return
    if (activeFrameIndex >= frames.length - 1) {
      setIsPlaying(false)
      setTransitionFromIndex(null)
      setTransitionProgress(0)
      return
    }
    return animateToNextStep(true)
  }, [isPlaying, frames.length, fps, activeFrameIndex])

  function onCanvasDown(e: React.PointerEvent) {
    const raw = getPoint(e)
    const p = { x: snap(raw.x), y: snap(raw.y) }

    if (tool === 'player') {
      addPersistentItem({ type: 'player', id: uid(), x: p.x, y: p.y, color: 'blue', label: '' })
      return
    }

    if (tool === 'cone') {
      addPersistentItem({ type: 'cone', id: uid(), x: p.x, y: p.y })
      return
    }

    if (tool === 'cup') {
      addPersistentItem({ type: 'cup', id: uid(), x: p.x, y: p.y })
      return
    }

    if (tool === 'ball') {
      addPersistentItem({ type: 'ball', id: uid(), x: p.x, y: p.y })
      return
    }

    if (tool === 'post') {
      addPersistentItem({ type: 'post', id: uid(), x: p.x, y: p.y })
      return
    }

    if (tool === 'arrow') {
      const id = uid()
      arrowRef.current = { id }
      const arrow: Arrow = { type: 'arrow', id, from: p, to: p }
      updateCurrentFrameItems((items) => [...items, arrow])
      setSelectedId(id)
      return
    }

    setSelectedId(null)
  }

  function onCanvasMove(e: React.PointerEvent) {
    const raw = getPoint(e)
    const p = { x: snap(raw.x), y: snap(raw.y) }

    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current
      const currentItem = activeFrame.items.find((item) => item.id === id)
      const nextX = snap(p.x + dx)
      const nextY = snap(p.y + dy)
      if (currentItem && (currentItem.type === 'cone' || currentItem.type === 'cup' || currentItem.type === 'post')) {
        updateItemEverywhere(id, (item) => (item.type === 'arrow' ? item : { ...item, x: nextX, y: nextY }))
      } else if (currentItem && (currentItem.type === 'player' || currentItem.type === 'ball')) {
        updateItemFromCurrentForward(id, (item) => (item.type === 'arrow' ? item : { ...item, x: nextX, y: nextY }))
      } else {
        updateCurrentFrameItems((items) =>
          items.map((it) => {
            if (it.id !== id) return it
            if (it.type === 'arrow') return it
            return { ...it, x: nextX, y: nextY }
          }),
        )
      }
    }

    if (arrowRef.current) {
      updateCurrentFrameItems((items) =>
        items.map((it) => (it.id === arrowRef.current!.id && it.type === 'arrow' ? { ...it, to: p } : it)),
      )
    }
  }

  function onCanvasUp() {
    dragRef.current = null
    arrowRef.current = null
  }

  function startDrag(item: Item, e: React.PointerEvent) {
    e.stopPropagation()
    if (item.type === 'arrow') return
    const p = getPoint(e)
    dragRef.current = { id: item.id, dx: item.x - p.x, dy: item.y - p.y }
    setSelectedId(item.id)
  }

  const displayItems = useMemo(() => {
    if (!isPlaying || transitionFromIndex === null || transitionFromIndex >= frames.length - 1) return activeFrame.items
    const fromItems = frames[transitionFromIndex]?.items || []
    const toItems = frames[transitionFromIndex + 1]?.items || activeFrame.items
    const fromMap = new Map(fromItems.map((item) => [item.id, item]))
    const toIds = new Set(toItems.map((item) => item.id))
    const interpolated = toItems.map((item) => interpolateItem(fromMap.get(item.id), item, transitionProgress))
    if (transitionProgress < 1) {
      fromItems.forEach((item) => {
        if (!toIds.has(item.id)) interpolated.push(item)
      })
    }
    return interpolated
  }, [activeFrame.items, frames, isPlaying, transitionFromIndex, transitionProgress])

  const selected = useMemo(() => activeFrame.items.find((it) => it.id === selectedId) || null, [activeFrame.items, selectedId])

  return (
    <div className={`diagram-composer ${className || ''}`}>
      <div className="diagram-toolbar" role="toolbar" aria-label="Outils du diagramme">
        <div className="toolbar-group">
          <IconButton active={tool === 'select'} onClick={() => setTool('select')} label="Sélection" icon="⌖" />
          <IconButton active={false} onClick={deleteSelected} label="Supprimer" icon="⌫" disabled={!selectedId} danger />
        </div>
        <div className="toolbar-group toolbar-grow">
          <label className="material-picker">
            <span>Matériel</span>
            <select
              value={tool === 'cone' || tool === 'cup' || tool === 'post' ? tool : ''}
              onChange={(e) => setTool((e.target.value || 'select') as Tool)}
            >
              <option value="">Choisir un matériel</option>
              <option value="cone">Cône</option>
              <option value="cup">Coupelle</option>
              <option value="post">Poteau</option>
            </select>
          </label>
          <label className="material-picker">
            <span>Éléments</span>
            <select
              value={tool === 'player' || tool === 'ball' || tool === 'arrow' ? tool : ''}
              onChange={(e) => setTool((e.target.value || 'select') as Tool)}
            >
              <option value="">Choisir un élément</option>
              <option value="player">Joueur</option>
              <option value="ball">Ballon</option>
              <option value="arrow">Flèche</option>
            </select>
          </label>
        </div>
      </div>

      <div className="diagram-step-bar">
        <div className="step-status">Étape {activeFrameIndex + 1} / {frames.length}</div>
        <div className="frames-actions">
          <button type="button" className="ghost-btn" onClick={goToPreviousStep} disabled={activeFrameIndex === 0}>Précédente</button>
          <button type="button" className="ghost-btn" onClick={goToNextStep} disabled={activeFrameIndex >= frames.length - 1}>Suivante</button>
          <button type="button" className={`ghost-btn ${isPlaying ? 'active' : ''}`} disabled={frames.length <= 1} onClick={startPlayback}>
            {isPlaying ? 'Pause' : 'Lecture'}
          </button>
          <button type="button" className="ghost-btn" onClick={resetCurrentStep} disabled={frames.every((frame) => frame.items.length === 0)}>Reset</button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 600 380"
        className="diagram-canvas"
        style={{ minHeight }}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
      >
        <rect x={5} y={5} width={590} height={370} rx={8} ry={8} fill="white" stroke="#c7e2c7" />
        <line x1={300} y1={5} x2={300} y2={375} stroke="#c7e2c7" strokeDasharray="4 4" />
        <rect x={5} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
        <rect x={555} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
        {displayItems.map((item) => renderItem(item, selectedId, startDrag, setSelectedId))}
      </svg>

      <div className="step-buttons" aria-label="Sélection des étapes">
        {Array.from({ length: MAX_STEPS }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`step-button ${index === activeFrameIndex ? 'active' : ''}`}
            onClick={() => goToStep(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {selected && selected.type === 'player' && !isPlaying && (
        <div className="diagram-properties">
          <label>
            Couleur
            <select
              value={selected.color}
              onChange={(e) => {
                const color = e.target.value as PlayerColor
                updateItemEverywhere(selected.id, (item) => (item.type === 'player' ? { ...item, color } : item))
              }}
            >
              {PLAYER_COLOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Label
            <input
              value={selected.label || ''}
              onChange={(e) => {
                const label = e.target.value
                updateCurrentFrameItems((items) => items.map((it) => (it.id === selected.id && it.type === 'player' ? { ...it, label } : it)))
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

function renderItem(
  item: Item,
  selectedId: string | null,
  startDrag: (item: Item, e: React.PointerEvent) => void,
  setSelectedId: (id: string | null) => void,
) {
  if (item.type === 'arrow') {
    return (
      <g key={item.id}>
        <defs>
          <marker id={`arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 Z" fill="#111827" />
          </marker>
        </defs>
        <line
          x1={item.from.x}
          y1={item.from.y}
          x2={item.to.x}
          y2={item.to.y}
          stroke="#111827"
          strokeWidth={2}
          markerEnd={`url(#arrow-${item.id})`}
          onPointerDown={(e) => {
            e.stopPropagation()
            setSelectedId(item.id)
          }}
        />
      </g>
    )
  }

  if (item.type === 'cone') {
    return (
      <polygon
        key={item.id}
        points={`${item.x},${item.y - 10} ${item.x - 10},${item.y + 10} ${item.x + 10},${item.y + 10}`}
        fill="#f97316"
        stroke="#7c2d12"
        onPointerDown={(e) => startDrag(item, e)}
        opacity={selectedId === item.id ? 0.8 : 1}
      />
    )
  }

  if (item.type === 'cup') {
    return (
      <g key={item.id} onPointerDown={(e) => startDrag(item, e)} opacity={selectedId === item.id ? 0.8 : 1}>
        <circle cx={item.x} cy={item.y} r={10} fill="#fde047" stroke="#a16207" />
        <circle cx={item.x} cy={item.y} r={4} fill="#fffbeb" stroke="#a16207" />
      </g>
    )
  }

  if (item.type === 'ball') {
    return (
      <g key={item.id} onPointerDown={(e) => startDrag(item, e)} opacity={selectedId === item.id ? 0.8 : 1}>
        <circle cx={item.x} cy={item.y} r={10} fill="#ffffff" stroke="#111827" />
        <path d={`M${item.x - 5},${item.y} L${item.x + 5},${item.y} M${item.x},${item.y - 5} L${item.x},${item.y + 5}`} stroke="#111827" strokeWidth={1.2} />
      </g>
    )
  }

  if (item.type === 'post') {
    return (
      <g key={item.id} onPointerDown={(e) => startDrag(item, e)} opacity={selectedId === item.id ? 0.8 : 1}>
        <rect x={item.x - 4} y={item.y - 16} width={8} height={32} rx={2} fill="#94a3b8" stroke="#334155" />
      </g>
    )
  }

  return (
    <g key={item.id} onPointerDown={(e) => startDrag(item, e)} opacity={selectedId === item.id ? 0.85 : 1}>
      <circle cx={item.x} cy={item.y} r={14} fill={getPlayerFill(item.color)} stroke="#111827" />
      <text x={item.x} y={item.y + 4} textAnchor="middle" fontSize="12" fill="white" fontWeight={700}>
        {item.label || ''}
      </text>
    </g>
  )
}

function IconButton({
  active,
  onClick,
  label,
  icon,
  disabled,
  danger,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={`tool-btn icon-btn ${active ? 'active' : ''} ${danger ? 'danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}
