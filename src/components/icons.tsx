import type { CSSProperties } from 'react'

type IconProps = {
  size?: number
  style?: CSSProperties
}

function IconBase({
  size = 20,
  style,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', ...style }}
    >
      {children}
    </svg>
  )
}

export function ChevronLeftIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  )
}

export function ChevronRightIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <path d="M9.5 5.5L16 12l-6.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  )
}

export function CalendarIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5v4M16 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8.5" cy="13" r="1.2" fill="currentColor" />
      <circle cx="12" cy="13" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="13" r="1.2" fill="currentColor" />
    </IconBase>
  )
}
