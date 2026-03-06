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
        border: '1px solid #dbe5f1',
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
        boxShadow: '0 4px 10px rgba(15, 23, 42, 0.06)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
