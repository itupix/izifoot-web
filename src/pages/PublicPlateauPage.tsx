import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { apiGet } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { PlateauInfoSection, PlateauPageHeader, PlateauRotationContent } from '../components/PlateauSharedSections'
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
  absent?: boolean
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
  const [infoTab, setInfoTab] = useState<'LIEU' | 'HORAIRES'>('LIEU')
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
  const absentTeamLabels = useMemo(() => {
    const teams = Array.isArray(rotation?.teams) ? rotation.teams : []
    return new Set(
      teams
        .filter((team) => Boolean(team?.label) && Boolean(team?.absent))
        .map((team) => team.label.trim())
        .filter(Boolean)
    )
  }, [rotation?.teams])
  const plateauStartTimeLabel = useMemo(() => {
    if (plateau?.startTime) return plateau.startTime
    if (rotation?.slots?.[0]?.time) return rotation.slots[0].time
    if (!plateau?.date) return 'À définir'
    const date = new Date(plateau.date)
    if (Number.isNaN(date.getTime())) return 'À définir'
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    if (hh === '00' && mm === '00') return 'À définir'
    return `${hh}:${mm}`
  }, [plateau?.date, plateau?.startTime, rotation?.slots])
  const plateauAddressLabel = useMemo(
    () => plateau?.address?.trim() || plateau?.lieu || 'À définir',
    [plateau?.address, plateau?.lieu]
  )
  const rendezVousTimeLabel = useMemo(() => {
    if (plateau?.meetingTime) return plateau.meetingTime
    const source = plateauStartTimeLabel
    const match = source.match(/^(\d{2}):(\d{2})$/)
    if (!match) return 'À définir'
    const hour = Number(match[1])
    const minute = Number(match[2])
    const total = Math.max(0, hour * 60 + minute - 30)
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }, [plateau?.meetingTime, plateauStartTimeLabel])
  const publicPlateauUrl = useMemo(() => {
    if (!token) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/plateau/public/${encodeURIComponent(token)}`
  }, [token])
  const rotationDisplaySlots = useMemo(() => (
    visibleSlots.map((slot) => ({
      key: slot.time,
      time: slot.time,
      games: slot.games.map((game) => ({
        key: `${slot.time}-${game.pitch}-${game.A}-${game.B}`,
        pitch: game.pitch,
        teamA: game.A,
        teamB: game.B,
        teamAColor: teamColorMap.get(game.A) ?? TEAM_COLORS[0],
        teamBColor: teamColorMap.get(game.B) ?? TEAM_COLORS[1],
        isCancelled: absentTeamLabels.has(game.A) || absentTeamLabels.has(game.B),
      })),
    }))
  ), [absentTeamLabels, teamColorMap, visibleSlots])

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
    <div className="training-details-page public-plateau-page">
      <PlateauPageHeader
        title="Plateau"
        subtitle={dateLabel}
        action={(
          <button type="button" className="add-button" onClick={() => setIsShareModalOpen(true)}>
            Partager le plateau
          </button>
        )}
      />

      {loading && <p>Chargement…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && !plateau && <p className="error-text">Plateau introuvable.</p>}

      {plateau && (
        <>
          <div className="training-details-grid public-plateau-grid">
            <PlateauInfoSection
              tab={infoTab}
              onTabChange={setInfoTab}
              addressLabel={plateauAddressLabel}
              startTimeLabel={plateauStartTimeLabel}
              meetingTimeLabel={rendezVousTimeLabel}
            />
          </div>

          <section className="details-card">
            <div className="card-head">
              <h3>Rotation</h3>
            </div>
            {rotation ? (
              <PlateauRotationContent
                updatedAtLabel={`Mise à jour le ${new Date(rotation.updatedAt).toLocaleString()}`}
                filterValue={selectedTeam}
                filterOptions={teamLabels}
                onFilterChange={setSelectedTeam}
                slots={rotationDisplaySlots}
                emptyMessage={selectedTeam ? 'Aucun créneau pour cette équipe.' : 'Aucun créneau disponible.'}
              />
            ) : (
              <div className="matches-section-body">
                <div className="rotation-empty-state">Aucune rotation enregistrée pour ce plateau.</div>
              </div>
            )}
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
