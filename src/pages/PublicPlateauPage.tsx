import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { useAsyncLoader } from '../hooks/useAsyncLoader'
import type { Plateau } from '../types/api'
import './TrainingDetailsPage.css'

type RotationGame = {
  pitch: string | number
  A: string
  B: string
}

type RotationSlot = {
  time: string
  games: RotationGame[]
}

type PublicPlateauResponse = {
  plateau: Plateau
  rotation: {
    updatedAt: string
    slots: RotationSlot[]
  } | null
}

export default function PublicPlateauPage() {
  const { token } = useParams<{ token: string }>()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [rotation, setRotation] = useState<PublicPlateauResponse['rotation']>(null)
  const [selectedTeam, setSelectedTeam] = useState('')

  const loadPublicPlateau = useCallback(async ({ isCancelled }: { isCancelled: () => boolean }) => {
    if (!token) return
    const data = await apiGet<PublicPlateauResponse>(apiRoutes.public.plateauByToken(token))
    if (isCancelled()) return
    setPlateau(data.plateau)
    setRotation(data.rotation)
  }, [token])

  const { loading, error } = useAsyncLoader(loadPublicPlateau)

  const dateLabel = useMemo(() => {
    if (!plateau?.date) return ''
    return new Date(plateau.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [plateau])

  const teamLabels = useMemo(() => {
    if (!rotation?.slots?.length) return [] as string[]
    const labels = new Set<string>()
    for (const slot of rotation.slots) {
      for (const game of slot.games) {
        labels.add(game.A)
        labels.add(game.B)
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [rotation])

  const visibleSlots = useMemo(() => {
    if (!rotation?.slots?.length) return []
    return rotation.slots
      .map((slot) => {
        const games = selectedTeam
          ? slot.games.filter((game) => game.A === selectedTeam || game.B === selectedTeam)
          : slot.games
        return { ...slot, games }
      })
      .filter((slot) => slot.games.length > 0)
  }, [rotation, selectedTeam])

  return (
    <div className="training-details-page">
      <header className="topbar" style={{ gridTemplateColumns: '1fr' }}>
        <div className="topbar-title">
          <h2>Plateau</h2>
          <p>{dateLabel}</p>
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && !plateau && <p className="error-text">Plateau introuvable.</p>}

      {plateau && (
        <>
          <section className="details-card">
            <div className="card-head">
              <h3>Informations</h3>
            </div>
            <div style={{ color: '#374151' }}>Lieu : <strong>{plateau.lieu}</strong></div>
          </section>

          <section className="details-card">
            <div className="card-head">
              <h3>Rotation</h3>
              <div className="head-actions">
                <span>{rotation ? '1' : '0'}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {rotation ? (
                <>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Mise à jour le {new Date(rotation.updatedAt).toLocaleString()}
                  </div>
                  {teamLabels.length > 0 && (
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Filtrer par équipe</span>
                      <select
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                        style={{ padding: 8, border: '1px solid #dbe5f1', borderRadius: 8 }}
                      >
                        <option value="">Toutes les équipes</option>
                        {teamLabels.map((team) => (
                          <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {visibleSlots.map((slot) => (
                      <div
                        key={slot.time}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: 10,
                          padding: 10,
                          background: '#fff',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{slot.time}</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {slot.games.map((game) => (
                            <div
                              key={`${slot.time}-${game.pitch}-${game.A}-${game.B}`}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 10px',
                                background: '#f8fafc',
                                display: 'grid',
                                gap: 6,
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Terrain {game.pitch}</div>
                              <div style={{ fontWeight: 600 }}>{game.A}</div>
                              <div style={{ fontWeight: 600 }}>{game.B}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {selectedTeam && visibleSlots.length === 0 && (
                      <div style={{ color: '#6b7280' }}>Aucun créneau pour cette équipe.</div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: '#6b7280' }}>Aucune rotation enregistrée pour ce plateau.</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
