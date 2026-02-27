import { useEffect, useMemo, useState } from 'react'
import { PLAYER_COLOR_OPTIONS, normalizeDiagramData, type Item, type PlayerColor } from './DiagramComposer'

interface Props {
  data: unknown
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress
}

function getPlayerFill(color: PlayerColor): string {
  return PLAYER_COLOR_OPTIONS.find((option) => option.value === color)?.fill || '#3b82f6'
}

function interpolateItem(fromItem: Item | undefined, toItem: Item, progress: number): Item {
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

export default function DiagramPlayer({ data }: Props) {
  const normalized = useMemo(() => normalizeDiagramData(data), [data])
  const frames = normalized.frames
  const fps = Math.max(1, Math.min(8, Math.round(normalized.fps || 2)))
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transitionFromIndex, setTransitionFromIndex] = useState<number | null>(null)
  const [transitionProgress, setTransitionProgress] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
  }, [data])

  function goToPrevious() {
    if (activeIndex <= 0) return
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setActiveIndex((idx) => Math.max(0, idx - 1))
  }

  function animateToNext(keepPlaying: boolean) {
    if (activeIndex >= frames.length - 1) {
      setIsPlaying(false)
      setTransitionFromIndex(null)
      setTransitionProgress(0)
      return
    }
    const fromIndex = activeIndex
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
      setActiveIndex(Math.min(fromIndex + 1, frames.length - 1))
      if (!keepPlaying) setIsPlaying(false)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }

  function goToNext() {
    if (isPlaying) return
    animateToNext(false)
  }

  function togglePlayback() {
    if (frames.length <= 1) return
    if (activeIndex >= frames.length - 1) setActiveIndex(0)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setIsPlaying((current) => !current)
  }

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return
    if (activeIndex >= frames.length - 1) {
      setIsPlaying(false)
      return
    }
    return animateToNext(true)
  }, [isPlaying, activeIndex, frames.length, fps])

  const displayItems = useMemo(() => {
    const activeItems = frames[Math.min(activeIndex, frames.length - 1)]?.items || []
    if (!isPlaying || transitionFromIndex === null || transitionFromIndex >= frames.length - 1) return activeItems
    const fromItems = frames[transitionFromIndex]?.items || []
    const toItems = frames[transitionFromIndex + 1]?.items || activeItems
    const fromMap = new Map(fromItems.map((item) => [item.id, item]))
    const toIds = new Set(toItems.map((item) => item.id))
    const interpolated = toItems.map((item) => interpolateItem(fromMap.get(item.id), item, transitionProgress))
    if (transitionProgress < 1) {
      fromItems.forEach((item) => {
        if (!toIds.has(item.id)) interpolated.push(item)
      })
    }
    return interpolated
  }, [activeIndex, frames, isPlaying, transitionFromIndex, transitionProgress])

  if (frames.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <svg viewBox="0 0 600 380" style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, background: '#f8fff8' }}>
        <rect x={5} y={5} width={590} height={370} rx={8} ry={8} fill="white" stroke="#c7e2c7" />
        <line x1={300} y1={5} x2={300} y2={375} stroke="#c7e2c7" strokeDasharray="4 4" />
        <rect x={5} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
        <rect x={555} y={130} width={40} height={120} fill="none" stroke="#c7e2c7" />
        {displayItems.map((item) => {
          if (item.type === 'arrow') {
            return (
              <g key={item.id}>
                <defs>
                  <marker id={`player-arrow-${item.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
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
                  markerEnd={`url(#player-arrow-${item.id})`}
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
              />
            )
          }
          if (item.type === 'cup') {
            return (
              <g key={item.id}>
                <circle cx={item.x} cy={item.y} r={10} fill="#fde047" stroke="#a16207" />
                <circle cx={item.x} cy={item.y} r={4} fill="#fffbeb" stroke="#a16207" />
              </g>
            )
          }
          if (item.type === 'ball') {
            return (
              <g key={item.id}>
                <circle cx={item.x} cy={item.y} r={10} fill="#ffffff" stroke="#111827" />
                <path d={`M${item.x - 5},${item.y} L${item.x + 5},${item.y} M${item.x},${item.y - 5} L${item.x},${item.y + 5}`} stroke="#111827" strokeWidth={1.2} />
              </g>
            )
          }
          if (item.type === 'post') {
            return (
              <g key={item.id}>
                <rect x={item.x - 4} y={item.y - 16} width={8} height={32} rx={2} fill="#94a3b8" stroke="#334155" />
              </g>
            )
          }
          return (
            <g key={item.id}>
              <circle cx={item.x} cy={item.y} r={14} fill={getPlayerFill(item.color)} stroke="#111827" />
              <text x={item.x} y={item.y + 4} textAnchor="middle" fontSize="12" fill="white" fontWeight={700}>
                {item.label || ''}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button type="button" onClick={goToPrevious} disabled={activeIndex === 0} style={playerButtonStyle}>
          Précédent
        </button>
        <button type="button" onClick={togglePlayback} disabled={frames.length <= 1} style={playerButtonStyle}>
          {isPlaying ? 'Pause' : 'Lecture'}
        </button>
        <button type="button" onClick={goToNext} disabled={activeIndex >= frames.length - 1} style={playerButtonStyle}>
          Suivant
        </button>
      </div>
    </div>
  )
}

const playerButtonStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 42,
  borderRadius: 999,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  fontSize: 14,
  fontWeight: 600,
}
