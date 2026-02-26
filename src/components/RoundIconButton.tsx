import type { ButtonHTMLAttributes, ReactNode } from 'react'

type RoundIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  ariaLabel?: string
  children: ReactNode
  size?: number
}

export default function RoundIconButton({
  ariaLabel,
  children,
  size = 32,
  className,
  style,
  type = 'button',
  disabled,
  ...buttonProps
}: RoundIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      {...buttonProps}
      style={{
        appearance: 'none',
        border: 'none',
        background: '#fff',
        width: size,
        height: size,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
