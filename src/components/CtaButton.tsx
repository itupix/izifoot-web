import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './CtaButton.module.css'

type CtaButtonProps = {
  children: ReactNode
  to?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>
  disabled?: boolean
  style?: CSSProperties
}

const baseStyle: CSSProperties = {
  appearance: 'none',
  border: 'none',
  textDecoration: 'none',
  padding: '13px 18px',
  borderRadius: 999,
  background: '#2dd4bf',
  color: '#042f2e',
  fontWeight: 800,
  fontSize: 16,
  lineHeight: 1.2,
  minHeight: 50,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

export default function CtaButton({
  children,
  to,
  type = 'button',
  onClick,
  disabled = false,
  style,
}: CtaButtonProps) {
  const mergedStyle: CSSProperties = {
    ...baseStyle,
    ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null),
    ...style,
  }

  if (to) {
    return (
      <Link to={to} onClick={onClick} style={mergedStyle} className={styles.ctaButton} aria-disabled={disabled}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} style={mergedStyle} className={styles.ctaButton}>
      {children}
    </button>
  )
}
