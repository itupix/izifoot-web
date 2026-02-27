import type { CSSProperties, MouseEventHandler } from 'react'

type FloatingPlusButtonProps = {
  ariaLabel: string
  onClick: MouseEventHandler<HTMLButtonElement>
  right?: number
  bottom?: number
  zIndex?: number
}

export default function FloatingPlusButton({
  ariaLabel,
  onClick,
  right = 24,
  bottom = 24,
  zIndex = 30,
}: FloatingPlusButtonProps) {
  const style: CSSProperties = {
    position: 'fixed',
    right,
    bottom,
    width: 54,
    height: 54,
    borderRadius: '50%',
    border: 'none',
    background: '#2dd4bf',
    color: '#042f2e',
    fontSize: 30,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(45, 212, 191, 0.35)',
    zIndex,
  }

  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} style={style}>
      +
    </button>
  )
}
