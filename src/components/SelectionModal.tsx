import type { ReactNode } from 'react'

type SelectionModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  titleAside?: ReactNode
  ariaLabel?: string
  className?: string
  topContent?: ReactNode
  bodyClassName?: string
  children: ReactNode
}

export default function SelectionModal({
  isOpen,
  onClose,
  title,
  titleAside,
  ariaLabel,
  className,
  topContent,
  bodyClassName,
  children,
}: SelectionModalProps) {
  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div
        className={`drill-modal selection-modal ${className || ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
      >
        <div className="selection-modal-top">
          <div className="drill-modal-head selection-modal-head">
            <div className="selection-modal-title-wrap">
              <h3>{title}</h3>
              {titleAside}
            </div>
            <button type="button" onClick={onClose}>✕</button>
          </div>
          {topContent ? <div className="selection-modal-top-content">{topContent}</div> : null}
        </div>
        <div className={`selection-modal-body ${bodyClassName || ''}`.trim()}>
          {children}
        </div>
      </div>
    </>
  )
}
