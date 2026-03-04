import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getFieldSizeForQuarterTurns,
  getPlayerFill,
  interpolateItem,
  normalizeDiagramData,
  normalizeRotationQuarterTurns,
  rotateDiagramToQuarterTurns,
} from './diagramShared'
import { FullscreenIcon, OrientationIcon, PauseIcon, PlayIcon, SkipBackIcon, StepBackIcon, StepForwardIcon } from './icons'

interface Props {
  data: unknown
}

export default function DiagramPlayer({ data }: Props) {
  const normalized = useMemo(() => normalizeDiagramData(data), [data])
  const [rotationQuarterTurns, setRotationQuarterTurns] = useState<number>(
    normalizeRotationQuarterTurns(normalized.rotationQuarterTurns, normalized.orientation),
  )
  const frames = useMemo(() => {
    const oriented = rotateDiagramToQuarterTurns(normalized, rotationQuarterTurns)
    const compressed = oriented.frames.filter((frame, index, list) => {
      if (index === 0) return true
      return JSON.stringify(frame.items) !== JSON.stringify(list[index - 1].items)
    })
    return compressed.length > 0 ? compressed : oriented.frames.slice(0, 1)
  }, [normalized, rotationQuarterTurns])
  const fps = Math.max(1, Math.min(8, Math.round(normalized.fps || 2)))
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transitionFromIndex, setTransitionFromIndex] = useState<number | null>(null)
  const [transitionProgress, setTransitionProgress] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const effectiveFullscreen = isFullscreen || isPseudoFullscreen
  const fieldSize = getFieldSizeForQuarterTurns(rotationQuarterTurns)
  const isPortrait = rotationQuarterTurns % 2 === 1
  const fieldWidth = fieldSize.width
  const fieldHeight = fieldSize.height
  const innerWidth = fieldWidth - 10
  const innerHeight = fieldHeight - 10
  const midX = fieldWidth / 2
  const midY = fieldHeight / 2
  const penaltyY = fieldHeight / 2 - 60
  const penaltyX = fieldWidth / 2 - 60

  useEffect(() => {
    setActiveIndex(0)
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setRotationQuarterTurns(normalizeRotationQuarterTurns(normalized.rotationQuarterTurns, normalized.orientation))
  }, [data, normalized.orientation, normalized.rotationQuarterTurns])

  function goToPrevious() {
    if (activeIndex <= 0) return
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setActiveIndex((idx) => Math.max(0, idx - 1))
  }

  function restart() {
    setIsPlaying(false)
    setTransitionFromIndex(null)
    setTransitionProgress(0)
    setActiveIndex(0)
  }

  const animateToNext = useCallback((keepPlaying: boolean) => {
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
  }, [activeIndex, fps, frames.length])

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

  function toggleOrientation() {
    setRotationQuarterTurns((current) => (current + 1) % 4)
  }

  async function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (effectiveFullscreen) {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen()
      } else {
        setIsPseudoFullscreen(false)
      }
      return
    }
    if (typeof stage.requestFullscreen === 'function') {
      try {
        await stage.requestFullscreen()
        return
      } catch {
        setIsPseudoFullscreen(true)
        return
      }
    }
    setIsPseudoFullscreen(true)
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    if (!effectiveFullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [effectiveFullscreen])

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return
    if (activeIndex >= frames.length - 1) {
      setIsPlaying(false)
      return
    }
    return animateToNext(true)
  }, [activeIndex, animateToNext, frames.length, isPlaying])

  const displayItems = useMemo(() => {
    const activeItems = frames[Math.min(activeIndex, frames.length - 1)]?.items || []
    if (transitionFromIndex === null || transitionFromIndex >= frames.length - 1) return activeItems
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
  }, [activeIndex, frames, transitionFromIndex, transitionProgress])

  const progressRatio = frames.length <= 1
    ? 1
    : Math.min(
        1,
        Math.max(
          0,
          ((transitionFromIndex ?? activeIndex) + (transitionFromIndex === null ? 0 : transitionProgress)) / (frames.length - 1),
        ),
      )

  if (frames.length === 0) return null

  const stageStyle: React.CSSProperties = {
    display: 'grid',
    gap: 12,
    ...(effectiveFullscreen
      ? {
          background: '#fff',
          padding: 12,
          minHeight: '100vh',
          boxSizing: 'border-box',
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          overflow: 'auto',
        }
      : {}),
  }

  return (
    <div style={stageStyle} ref={stageRef}>
      <svg
        viewBox={`0 0 ${fieldWidth} ${fieldHeight}`}
        style={{ width: '100%', minHeight: effectiveFullscreen ? 'calc(100vh - 190px)' : 320, border: '1px solid #e5e7eb', borderRadius: 12, background: '#f8fff8' }}
      >
        <rect x={5} y={5} width={innerWidth} height={innerHeight} rx={8} ry={8} fill="white" stroke="#c7e2c7" />
        {!isPortrait ? (
          <>
            <line x1={midX} y1={5} x2={midX} y2={fieldHeight - 5} stroke="#c7e2c7" strokeDasharray="4 4" />
            <rect x={5} y={penaltyY} width={40} height={120} fill="none" stroke="#c7e2c7" />
            <rect x={fieldWidth - 45} y={penaltyY} width={40} height={120} fill="none" stroke="#c7e2c7" />
          </>
        ) : (
          <>
            <line x1={5} y1={midY} x2={fieldWidth - 5} y2={midY} stroke="#c7e2c7" strokeDasharray="4 4" />
            <rect x={penaltyX} y={5} width={120} height={40} fill="none" stroke="#c7e2c7" />
            <rect x={penaltyX} y={fieldHeight - 45} width={120} height={40} fill="none" stroke="#c7e2c7" />
          </>
        )}
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
      <div style={progressTrackStyle} aria-hidden="true">
        <div style={{ ...progressFillStyle, width: `${Math.round(progressRatio * 100)}%` }} />
      </div>
      <div style={playerBarStyle}>
        <div style={playerControlsStyle}>
          <button type="button" onClick={restart} disabled={activeIndex === 0 && !isPlaying} style={playerButtonStyle} aria-label="Début" title="Début">
            <SkipBackIcon size={28} />
          </button>
          <button type="button" onClick={goToPrevious} disabled={activeIndex === 0} style={playerButtonStyle} aria-label="Précédent" title="Précédent">
            <StepBackIcon size={28} />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            disabled={frames.length <= 1}
            style={playerButtonStyle}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
            title={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? <PauseIcon size={32} /> : <PlayIcon size={32} style={{ marginLeft: 3 }} />}
          </button>
          <button type="button" onClick={goToNext} disabled={activeIndex >= frames.length - 1} style={playerButtonStyle} aria-label="Suivant" title="Suivant">
            <StepForwardIcon size={28} />
          </button>
        </div>
        <div style={playerRightActionsStyle}>
          <button
            type="button"
            onClick={toggleOrientation}
            style={playerButtonStyle}
            aria-label="Pivoter de 90° (horaire)"
            title="Pivoter de 90° (horaire)"
          >
            <OrientationIcon size={24} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            style={playerButtonStyle}
            aria-label={effectiveFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            title={effectiveFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            <FullscreenIcon size={24} />
          </button>
        </div>
      </div>
    </div>
  )
}

const playerButtonStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  fontSize: 24,
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
}

const playerBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const playerControlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '0 auto',
}

const playerRightActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginLeft: 'auto',
}

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 8,
  borderRadius: 999,
  background: '#e2e8f0',
  overflow: 'hidden',
}

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)',
  transition: 'width 140ms linear',
}
