import { useMemo, useState, type ReactNode } from 'react'
import type { Player } from '../types/api'
import SelectionModal from './SelectionModal'

type PlayersPresenceSectionProps = {
  players: Player[]
  presentPlayerIds: Set<string>
  intentByPlayerId?: Record<string, 'PRESENT' | 'ABSENT' | 'UNKNOWN'>
  onTogglePresence: (playerId: string, present: boolean) => void | Promise<void>
  cardDisabled?: boolean
  selectionDisabled?: boolean
  selectionDisabledMessage?: ReactNode
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function colorFromName(name: string) {
  const palette = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#0e7490', '#b91c1c']
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function getAvatarUrl(player: Player) {
  const withAvatar = player as Player & {
    avatarUrl?: string | null
    avatar?: string | null
    photoUrl?: string | null
    imageUrl?: string | null
  }
  return withAvatar.avatarUrl || withAvatar.avatar || withAvatar.photoUrl || withAvatar.imageUrl || null
}

export default function PlayersPresenceSection({
  players,
  presentPlayerIds,
  intentByPlayerId,
  onTogglePresence,
  cardDisabled = false,
  selectionDisabled = false,
  selectionDisabledMessage,
}: PlayersPresenceSectionProps) {
  const [isPlayersModalOpen, setIsPlayersModalOpen] = useState(false)
  const presentPlayers = useMemo(
    () => players.filter((player) => presentPlayerIds.has(player.id)),
    [players, presentPlayerIds],
  )

  return (
    <>
      <section
        className={`details-card players-presence-card ${cardDisabled ? 'is-disabled' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setIsPlayersModalOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsPlayersModalOpen(true)
          }
        }}
        aria-label="Ouvrir la sélection des joueurs présents"
      >
        <div className="card-head">
          <h3>Joueurs</h3>
          <div className="head-actions">
            <span>{presentPlayerIds.size}/{players.length}</span>
          </div>
        </div>
        <div className="players-avatar-stack">
          {presentPlayers.length === 0 ? (
            <p className="muted-line">Aucun joueur présent.</p>
          ) : (
            presentPlayers.slice(0, 12).map((player) => {
              const avatarUrl = getAvatarUrl(player)
              const initials = getInitials(player.name)
              return (
                <div key={player.id} className="player-avatar-chip" title={player.name}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={player.name} />
                  ) : (
                    <span style={{ background: colorFromName(player.name) }}>{initials}</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      <SelectionModal
        isOpen={isPlayersModalOpen}
        onClose={() => setIsPlayersModalOpen(false)}
        title="Joueurs présents"
        ariaLabel="Sélection des joueurs présents"
        className="players-selection-modal"
        titleAside={<span className="players-selection-count">{presentPlayerIds.size}/{players.length}</span>}
        topContent={selectionDisabled ? selectionDisabledMessage : undefined}
        bodyClassName="attendance-list-simple players-selection-list"
      >
        {players.map((player) => {
          const present = presentPlayerIds.has(player.id)
          const intent = intentByPlayerId?.[player.id] ?? 'UNKNOWN'
          return (
            <label key={player.id} className="attendance-row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {getFirstName(player.name)}
                <span className={`intent-badge intent-badge--${intent.toLowerCase()}`}>
                  {intent === 'PRESENT' ? '✓' : intent === 'ABSENT' ? '✕' : '?'}
                </span>
              </span>
              <input
                type="checkbox"
                className="players-selection-checkbox"
                checked={present}
                disabled={selectionDisabled}
                onChange={(event) => { void onTogglePresence(player.id, event.target.checked) }}
              />
            </label>
          )
        })}
      </SelectionModal>
    </>
  )
}
