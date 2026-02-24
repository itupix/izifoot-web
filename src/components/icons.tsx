import type { CSSProperties, ReactNode } from 'react'

type IconProps = {
  size?: number
  style?: CSSProperties
}

function IconBase({
  size = 24,
  style,
  children,
}: IconProps & { children: ReactNode }) {
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

export function SoccerBallIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <polygon points="12,8.5 9.6,10.2 10.5,13 13.5,13 14.4,10.2" fill="currentColor" />
      <path d="M12 3.5v3M5.6 6.2l2.3 2M18.4 6.2l-2.3 2M4 12h3M20 12h-3M5.6 17.8l2.3-2M18.4 17.8l-2.3-2M12 20.5v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </IconBase>
  )
}

export function TrophyIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <path d="M8 4.5h8v3.8a4 4 0 0 1-4 4 4 4 0 0 1-4-4V4.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.2 12.2V15h5.6v-2.8M10 18.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 6H6.5A2.5 2.5 0 0 0 9 8.5M16 6h1.5A2.5 2.5 0 0 1 15 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </IconBase>
  )
}

export function MenuIcon({ size, style }: IconProps) {
  return (
    <IconBase size={size} style={style}>
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </IconBase>
  )
}
