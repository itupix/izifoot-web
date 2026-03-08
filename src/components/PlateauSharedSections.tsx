import type { ReactNode } from 'react'

export type PlateauRotationDisplayGame = {
  key: string
  pitch: string | number
  teamA: string
  teamB: string
  teamAColor: string
  teamBColor: string
  isClickable?: boolean
  scoreLabel?: string | null
  onOpen?: () => void
}

export type PlateauRotationDisplaySlot = {
  key: string
  time: string
  games: PlateauRotationDisplayGame[]
}

type PlateauHeaderProps = {
  title: string
  subtitle: string
  action?: ReactNode
  backAction?: ReactNode
}

type PlateauInfoSectionProps = {
  tab: 'LIEU' | 'HORAIRES'
  onTabChange: (tab: 'LIEU' | 'HORAIRES') => void
  addressLabel: string
  startTimeLabel: string
  meetingTimeLabel: string
  addressAction?: ReactNode
  startTimeAction?: ReactNode
  meetingTimeAction?: ReactNode
}

type PlateauRotationContentProps = {
  updatedAtLabel?: string | null
  filterValue: string
  filterOptions: string[]
  onFilterChange: (value: string) => void
  slots: PlateauRotationDisplaySlot[]
  emptyMessage: string
  topAction?: ReactNode
}

export function PlateauPageHeader({ title, subtitle, action, backAction }: PlateauHeaderProps) {
  return (
    <header className="details-page-head">
      {backAction}
      <div className="details-page-mainrow">
        <div className="details-page-title-wrap">
          <h1 className="details-page-title">{title}</h1>
          <p className="details-page-subtitle">{subtitle}</p>
        </div>
        {action ? <div className="topbar-menu-wrap">{action}</div> : null}
      </div>
    </header>
  )
}

export function PlateauInfoSection({
  tab,
  onTabChange,
  addressLabel,
  startTimeLabel,
  meetingTimeLabel,
  addressAction,
  startTimeAction,
  meetingTimeAction,
}: PlateauInfoSectionProps) {
  return (
    <section className="details-card">
      <div className="info-tabs" role="tablist" aria-label="Informations du plateau">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'LIEU'}
          className={`info-tab ${tab === 'LIEU' ? 'is-active' : ''}`}
          onClick={() => onTabChange('LIEU')}
        >
          Lieu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'HORAIRES'}
          className={`info-tab ${tab === 'HORAIRES' ? 'is-active' : ''}`}
          onClick={() => onTabChange('HORAIRES')}
        >
          Horaires
        </button>
      </div>
      {tab === 'LIEU' ? (
        <div className="info-pane-grid">
          <div className="map-preview-wrap">
            <iframe
              title="Aperçu carte du lieu"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(addressLabel)}&z=14&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="info-address">
            <div className="info-row-head">
              <p className="info-label">Adresse</p>
              {addressAction}
            </div>
            <p className="info-value">{addressLabel}</p>
          </div>
        </div>
      ) : (
        <div className="info-hours-grid">
          <div className="info-hour-card">
            <div className="info-row-head">
              <p className="info-label">Début du plateau</p>
              {startTimeAction}
            </div>
            <p className="info-value">{startTimeLabel}</p>
          </div>
          <div className="info-hour-card">
            <div className="info-row-head">
              <p className="info-label">Rendez-vous sur le lieu</p>
              {meetingTimeAction}
            </div>
            <p className="info-value">{meetingTimeLabel}</p>
          </div>
        </div>
      )}
    </section>
  )
}

export function PlateauRotationContent({
  updatedAtLabel,
  filterValue,
  filterOptions,
  onFilterChange,
  slots,
  emptyMessage,
  topAction,
}: PlateauRotationContentProps) {
  return (
    <div className="matches-section-body">
      {updatedAtLabel ? (
        <div className="rotation-panel-meta">
          <span>{updatedAtLabel}</span>
          {topAction}
        </div>
      ) : null}
      {filterOptions.length > 0 ? (
        <label className="rotation-team-select">
          <select value={filterValue} onChange={(e) => onFilterChange(e.target.value)}>
            <option value="">Toutes les équipes</option>
            {filterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="rotation-slots">
        {slots.map((slot) => (
          <div key={slot.key} className="rotation-slot-row">
            <div className="rotation-slot-time">{slot.time}</div>
            <div className="rotation-slot-games">
              {slot.games.map((game) => (
                <div
                  key={game.key}
                  className={`rotation-game-card ${game.isClickable ? 'is-clickable' : ''}`}
                  role={game.isClickable ? 'button' : undefined}
                  tabIndex={game.isClickable ? 0 : undefined}
                  onClick={game.isClickable ? game.onOpen : undefined}
                  onKeyDown={game.isClickable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      game.onOpen?.()
                    }
                  } : undefined}
                >
                  <div className="rotation-game-pitch">Terrain {game.pitch}</div>
                  <div className="rotation-game-teams-row">
                    <div className="rotation-game-side is-left">
                      <div
                        className="rotation-game-team team-left"
                        style={{ ['--team-accent' as string]: game.teamAColor }}
                      >
                        <span>{game.teamA}</span>
                      </div>
                    </div>
                    <div className="rotation-game-side is-score">
                      <div className={`rotation-game-score ${game.scoreLabel ? '' : 'rotation-game-score-muted'}`}>
                        {game.scoreLabel || 'vs'}
                      </div>
                    </div>
                    <div className="rotation-game-side is-right">
                      <div
                        className="rotation-game-team team-right"
                        style={{ ['--team-accent' as string]: game.teamBColor }}
                      >
                        <span>{game.teamB}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {slots.length === 0 ? (
          <div className="rotation-empty-state">{emptyMessage}</div>
        ) : null}
      </div>
    </div>
  )
}
