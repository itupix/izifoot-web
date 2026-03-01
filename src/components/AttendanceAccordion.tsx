import type { ReactNode } from 'react'
import { ChevronRightIcon } from './icons'

type AttendanceAccordionProps = {
  title?: string
  countLabel: string
  isOpen: boolean
  onToggle: () => void
  toggleLabel: string
  disabled?: boolean
  disabledMessage?: ReactNode
  children: ReactNode
}

export default function AttendanceAccordion({
  title = 'Présents',
  countLabel,
  isOpen,
  onToggle,
  toggleLabel,
  disabled = false,
  disabledMessage,
  children,
}: AttendanceAccordionProps) {
  return (
    <section className={`details-card ${disabled ? 'is-disabled' : ''}`}>
      {!disabled ? (
        <button
          type="button"
          className="card-head-button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={toggleLabel}
        >
          <div className="card-head">
            <h3>{title}</h3>
            <div className="head-actions">
              <span>{countLabel}</span>
              <ChevronRightIcon size={18} style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
            </div>
          </div>
        </button>
      ) : (
        <div className="card-head">
          <h3>{title}</h3>
          <div className="head-actions">
            <span>{countLabel}</span>
          </div>
        </div>
      )}
      {disabled ? disabledMessage : isOpen ? children : null}
    </section>
  )
}
