import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
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

type RotationTeam = {
  label: string
  color: string
}

type PublicPlateauResponse = {
  plateau: Plateau
  rotation: {
    updatedAt: string
    teams?: RotationTeam[]
    slots: RotationSlot[]
  } | null
}

const TEAM_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c2410c',
  '#9333ea', '#0f766e', '#be123c', '#1d4ed8', '#15803d',
  '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4338ca',
]

export default function PublicPlateauPage() {
  const { token } = useParams<{ token: string }>()
  const [plateau, setPlateau] = useState<Plateau | null>(null)
  const [rotation, setRotation] = useState<PublicPlateauResponse['rotation']>(null)
  const [selectedTeam, setSelectedTeam] = useState('')
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareQrDataUrl, setShareQrDataUrl] = useState('')
  const [shareQrLoading, setShareQrLoading] = useState(false)

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
  const teamColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const saved = Array.isArray(rotation?.teams) ? rotation.teams : []
    for (const team of saved) {
      if (team?.label && team?.color) map.set(team.label, team.color)
    }
    for (const [index, label] of teamLabels.entries()) {
      if (!map.has(label)) map.set(label, TEAM_COLORS[index % TEAM_COLORS.length])
    }
    return map
  }, [rotation, teamLabels])
  const publicPlateauUrl = useMemo(() => {
    if (!token) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/plateau/public/${encodeURIComponent(token)}`
  }, [token])

  useEffect(() => {
    let cancelled = false
    if (!isShareModalOpen || !publicPlateauUrl) {
      setShareQrDataUrl('')
      setShareQrLoading(false)
      return
    }
    setShareQrLoading(true)
    void QRCode.toDataURL(publicPlateauUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl: string) => {
        if (cancelled) return
        setShareQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (cancelled) return
        setShareQrDataUrl('')
      })
      .finally(() => {
        if (cancelled) return
        setShareQrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isShareModalOpen, publicPlateauUrl])

  function closeShareModal() {
    setIsShareModalOpen(false)
    setShareCopied(false)
    setShareQrDataUrl('')
    setShareQrLoading(false)
  }

  async function copyShareLink() {
    if (!publicPlateauUrl) return
    try {
      await navigator.clipboard.writeText(publicPlateauUrl)
      setShareCopied(true)
    } catch {
      setShareCopied(false)
    }
  }

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
                <button type="button" className="add-button" onClick={() => setIsShareModalOpen(true)}>
                  Partager le plateau
                </button>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                                  <circle cx="6" cy="6" r="6" fill={teamColorMap.get(game.A) ?? TEAM_COLORS[0]} />
                                </svg>
                                {game.A}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                                  <circle cx="6" cy="6" r="6" fill={teamColorMap.get(game.B) ?? TEAM_COLORS[1]} />
                                </svg>
                                {game.B}
                              </div>
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

      {isShareModalOpen && (
        <>
          <div className="modal-overlay" onClick={closeShareModal} />
          <div className="drill-modal share-modal" role="dialog" aria-modal="true" aria-label="Partager le plateau">
            <div className="drill-modal-head">
              <h3>Partager le plateau</h3>
              <button type="button" onClick={closeShareModal}>✕</button>
            </div>
            <div className="share-content">
              <p className="muted-line">
                Ce lien ouvre la version publique du plateau avec les blocs titre/date, informations et rotation.
              </p>
              <label className="share-url-block">
                <span>Lien public</span>
                <input type="text" readOnly value={publicPlateauUrl} />
              </label>
              <div className="share-actions">
                <button type="button" onClick={() => void copyShareLink()} disabled={!publicPlateauUrl}>
                  {shareCopied ? 'Lien copié' : 'Copier le lien'}
                </button>
                <a
                  href={publicPlateauUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!publicPlateauUrl) e.preventDefault()
                  }}
                  aria-disabled={!publicPlateauUrl}
                >
                  Ouvrir le lien
                </a>
              </div>
              {shareQrLoading && <p className="muted-line">Génération du QR code…</p>}
              {shareQrDataUrl && (
                <div className="share-qr-wrap">
                  <img src={shareQrDataUrl} alt="QR code du lien public du plateau" width={220} height={220} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
