import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, IdCard, Mail, Phone, ShieldCheck, UserRoundCheck, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE, HttpError } from '../api'
import { apiGetAllItems } from '../adapters/pagination'
import { apiDelete, apiGet, apiPost, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { ChevronLeftIcon, DotsHorizontalIcon } from '../components/icons'
import RoundIconButton from '../components/RoundIconButton'
import { toErrorMessage } from '../errors'
import { uiAlert } from '../ui'
import type { AttendanceRow, MatchLite, Player, Training } from '../types/api'
import './PlayerDetailsPage.css'

const POSITIONS = ['GARDIEN', 'DEFENSEUR', 'MILIEU', 'ATTAQUANT'] as const
const POSITION_UNDEFINED = 'NON DEFINI'

function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function getPlayerNames(player: Player): { firstName: string; lastName: string } {
  const firstName =
    (typeof player.firstName === 'string' ? player.firstName : '') ||
    (typeof player.first_name === 'string' ? player.first_name : '') ||
    (typeof player.prenom === 'string' ? player.prenom : '')
  const lastName =
    (typeof player.lastName === 'string' ? player.lastName : '') ||
    (typeof player.last_name === 'string' ? player.last_name : '') ||
    (typeof player.nom === 'string' ? player.nom : '')

  if (firstName.trim() || lastName.trim()) {
    return { firstName: firstName.trim(), lastName: lastName.trim() }
  }

  return splitFullName(player.name || '')
}

function getPlayerDisplayName(player: Player): string {
  const { firstName, lastName } = getPlayerNames(player)
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || player.name || 'Joueur'
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

function formatPositionLabel(position: string): string {
  const normalized = position.trim().toUpperCase()
  if (normalized === 'GARDIEN') return 'Gardien'
  if (normalized === 'DEFENSEUR') return 'Défenseur'
  if (normalized === 'MILIEU') return 'Milieu'
  if (normalized === 'ATTAQUANT') return 'Attaquant'
  if (normalized === POSITION_UNDEFINED) return 'Non défini'
  return position || 'Non défini'
}

function isChildPlayer(player: Player): boolean {
  if (typeof player.isChild === 'boolean') return player.isChild
  if (typeof player.enfant === 'boolean') return player.enfant
  return false
}

function getParentNames(player: Player): { parentFirstName: string; parentLastName: string } {
  const parentFirstName =
    (typeof player.parentFirstName === 'string' ? player.parentFirstName : '') ||
    (typeof player.parent_first_name === 'string' ? player.parent_first_name : '') ||
    (typeof player.parentPrenom === 'string' ? player.parentPrenom : '')
  const parentLastName =
    (typeof player.parentLastName === 'string' ? player.parentLastName : '') ||
    (typeof player.parent_last_name === 'string' ? player.parent_last_name : '') ||
    (typeof player.parentNom === 'string' ? player.parentNom : '')
  return { parentFirstName: parentFirstName.trim(), parentLastName: parentLastName.trim() }
}

function getLicence(player: Player): string {
  const raw = (typeof player.licence === 'string' ? player.licence : '') || (typeof player.license === 'string' ? player.license : '')
  return raw.trim()
}

type InvitationStatusValue = 'NONE' | 'PENDING' | 'ACCEPTED'
type PlayerInvitationStatusResponse = {
  playerId: string
  status: InvitationStatusValue
  lastInvitationAt?: string | null
  invitationId?: string | null
}
type PlayerInviteResponse = {
  status: InvitationStatusValue
  invitationId?: string | null
  sentAt?: string | null
  expiresAt?: string | null
  inviteUrl?: string | null
}

function normalizeInvitationStatus(value: unknown): InvitationStatusValue {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (normalized === 'PENDING' || normalized === 'ACCEPTED') return normalized
  return 'NONE'
}

export default function PlayerDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [matches, setMatches] = useState<MatchLite[]>([])
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [inviteSending, setInviteSending] = useState(false)
  const [invitationStatus, setInvitationStatus] = useState<InvitationStatusValue | null>(null)
  const [invitationLoading, setInvitationLoading] = useState(false)
  const [invitationStatusError, setInvitationStatusError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteParentModalOpen, setInviteParentModalOpen] = useState(false)
  const [inviteParentEmail, setInviteParentEmail] = useState('')
  const [inviteParentPhone, setInviteParentPhone] = useState('')
  const [deletingParentId, setDeletingParentId] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isChild, setIsChild] = useState(false)
  const [parentFirstName, setParentFirstName] = useState('')
  const [parentLastName, setParentLastName] = useState('')
  const [licence, setLicence] = useState('')
  const [primaryPosition, setPrimaryPosition] = useState(POSITION_UNDEFINED)

  async function refreshInvitationStatus(playerId: string) {
    setInvitationLoading(true)
    setInvitationStatusError(null)
    try {
      const response = await apiGet<PlayerInvitationStatusResponse>(apiRoutes.players.invitationStatus(playerId))
      setInvitationStatus(normalizeInvitationStatus(response?.status))
    } catch (err: unknown) {
      setInvitationStatus(null)
      setInvitationStatusError(toErrorMessage(err, 'Statut invitation indisponible.'))
    } finally {
      setInvitationLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!id) {
        setError('Joueur introuvable.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      setInvitationStatus(null)
      setInvitationStatusError(null)
      setInviteUrl(null)
      try {
        const [playerData, matchData, attendanceData, trainingData] = await Promise.all([
          apiGet<Player>(apiRoutes.players.byId(id)),
          apiGetAllItems<MatchLite>(apiRoutes.matches.list).catch(() => []),
          apiGetAllItems<AttendanceRow>(apiRoutes.attendance.list).catch(() => []),
          apiGetAllItems<Training>(apiRoutes.trainings.list).catch(() => []),
        ])
        if (!cancelled) {
          setPlayer(playerData)
          setMatches(matchData)
          setAttendanceRows(attendanceData)
          setTrainings(trainingData)
          void refreshInvitationStatus(playerData.id)
        }
      } catch (err: unknown) {
        if (!cancelled) setError(toErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [id])

  const playerName = useMemo(() => (player ? getPlayerDisplayName(player) : 'Joueur'), [player])
  const playerPosition = useMemo(() => formatPositionLabel(player?.primary_position || POSITION_UNDEFINED), [player])
  const parentContacts = useMemo(() => {
    if (!player) return []
    const contacts = Array.isArray(player.parentContacts) ? player.parentContacts : []
    return contacts.map((contact) => {
      const firstName = (contact?.firstName || '').trim()
      const lastName = (contact?.lastName || '').trim()
      const fullName = `${firstName} ${lastName}`.trim() || 'Parent'
      const email = (contact?.email || '').trim()
      const phone = (contact?.phone || '').trim()
      const parentId = typeof contact?.parentId === 'string' ? contact.parentId : ''
      return { parentId, fullName, email, phone, firstName, lastName }
    })
  }, [player])
  const hasLicence = useMemo(() => Boolean(player && getLicence(player)), [player])
  const playerGoals = useMemo(() => (
    matches.reduce((sum, match) => {
      const list = Array.isArray(match.scorers) ? match.scorers : []
      const goals = list.filter((scorer) => scorer.playerId === id && scorer.side === 'home').length
      return sum + goals
    }, 0)
  ), [id, matches])
  const matchesPlayed = useMemo(() => (
    matches.reduce((sum, match) => {
      const isPresent = (match.teams || []).some((team) => (
        (team.players || []).some((teamPlayer) => teamPlayer.playerId === id || teamPlayer.player?.id === id)
      ))
      return sum + (isPresent ? 1 : 0)
    }, 0)
  ), [id, matches])
  const canComputeMatchesPlayed = useMemo(
    () => matches.some((match) => (match.teams || []).some((team) => Array.isArray(team.players) && team.players.length > 0)),
    [matches],
  )
  const totalActiveTrainings = useMemo(
    () => trainings.filter((training) => training.status !== 'CANCELLED').length,
    [trainings],
  )
  const attendedTrainings = useMemo(() => (
    attendanceRows.filter((row) => row.playerId === id && row.session_type === 'TRAINING' && row.present === true).length
  ), [attendanceRows, id])
  const trainingAttendanceRate = useMemo(() => {
    if (totalActiveTrainings <= 0) return 0
    return Math.round((attendedTrainings / totalActiveTrainings) * 100)
  }, [attendedTrainings, totalActiveTrainings])

  function openEditModal() {
    if (!player) return
    const names = getPlayerNames(player)
    const parentNames = getParentNames(player)
    setFirstName(names.firstName)
    setLastName(names.lastName)
    setEmail((player.email || '').trim())
    setPhone((player.phone || '').trim())
    setIsChild(isChildPlayer(player))
    setParentFirstName(parentNames.parentFirstName)
    setParentLastName(parentNames.parentLastName)
    setLicence(getLicence(player))
    setPrimaryPosition((player.primary_position || POSITION_UNDEFINED).trim() || POSITION_UNDEFINED)
    setEditModalOpen(true)
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!player?.id) return

    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const normalizedEmail = email.trim()
    const normalizedPhone = phone.trim()
    const normalizedParentFirstName = parentFirstName.trim()
    const normalizedParentLastName = parentLastName.trim()
    const normalizedLicence = licence.trim()

    if (!normalizedFirstName || !normalizedLastName || (!isChild && (!normalizedEmail || !normalizedPhone))) {
      uiAlert(isChild ? 'Merci de renseigner prénom et nom.' : 'Merci de renseigner prénom, nom, e-mail et téléphone.')
      return
    }
    if (isChild && (!normalizedParentFirstName || !normalizedParentLastName)) {
      uiAlert('Merci de renseigner le prénom et le nom du parent.')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: `${normalizedFirstName} ${normalizedLastName}`.trim(),
        firstName: normalizedFirstName,
        first_name: normalizedFirstName,
        prenom: normalizedFirstName,
        lastName: normalizedLastName,
        last_name: normalizedLastName,
        nom: normalizedLastName,
        email: isChild ? '' : normalizedEmail,
        phone: isChild ? '' : normalizedPhone,
        primary_position: (primaryPosition || POSITION_UNDEFINED).trim() || POSITION_UNDEFINED,
        isChild,
        enfant: isChild,
      }
      if (normalizedLicence) {
        body.licence = normalizedLicence
        body.license = normalizedLicence
      }
      if (isChild) {
        body.parentFirstName = normalizedParentFirstName
        body.parent_first_name = normalizedParentFirstName
        body.parentPrenom = normalizedParentFirstName
        body.parentLastName = normalizedParentLastName
        body.parent_last_name = normalizedParentLastName
        body.parentNom = normalizedParentLastName
      } else {
        body.parentFirstName = null
        body.parent_first_name = null
        body.parentPrenom = null
        body.parentLastName = null
        body.parent_last_name = null
        body.parentNom = null
      }

      const updated = await apiPut<Player>(apiRoutes.players.byId(player.id), body)
      setPlayer(updated)
      await refreshInvitationStatus(updated.id)
      setEditModalOpen(false)
    } catch (err: unknown) {
      uiAlert(`Erreur modification joueur: ${toErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function deletePlayer() {
    if (!player?.id) return
    setDeleting(true)
    try {
      await apiDelete(apiRoutes.players.byId(player.id))
      navigate('/effectif')
    } catch (err: unknown) {
      uiAlert(`Erreur suppression joueur: ${toErrorMessage(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  async function sendPlayerInvitation(payloadOverride?: { email?: string; phone?: string }) {
    if (!player?.id) return
    setInviteSending(true)
    try {
      const isResend = invitationStatus === 'PENDING'
      const payload: { email?: string; phone?: string } = payloadOverride || {}
      if (isChildPlayer(player) && !payloadOverride) {
        setInviteParentModalOpen(true)
        return
      }
      const response = await apiPost<PlayerInviteResponse>(apiRoutes.players.invite(player.id), payload)
      await refreshInvitationStatus(player.id)
      const nextInviteUrl = typeof response?.inviteUrl === 'string' ? response.inviteUrl.trim() : ''
      if (nextInviteUrl) {
        setInviteUrl(nextInviteUrl)
        setInviteModalOpen(true)
      } else {
        uiAlert(isResend ? 'Invitation renvoyée.' : 'Invitation envoyée.')
      }
    } catch (err: unknown) {
      if (err instanceof HttpError && err.status === 409) {
        uiAlert('Compte déjà activé.')
        await refreshInvitationStatus(player.id)
        return
      }
      if (err instanceof HttpError && err.status === 400) {
        uiAlert(toErrorMessage(err, 'Coordonnée parent requise (e-mail ou téléphone).'))
        return
      }
      uiAlert(`Erreur invitation joueur: ${toErrorMessage(err)}`)
    } finally {
      setInviteSending(false)
    }
  }

  function submitParentInviteModal(event: React.FormEvent) {
    event.preventDefault()
    const normalizedEmail = inviteParentEmail.trim()
    const normalizedPhone = inviteParentPhone.trim()
    if (!normalizedEmail && !normalizedPhone) {
      uiAlert('Merci de renseigner au moins un e-mail ou un téléphone parent.')
      return
    }
    setInviteParentModalOpen(false)
    void sendPlayerInvitation({
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    })
  }

  async function deleteParentLink(parentId: string, parentName: string) {
    if (!player?.id) return
    if (!parentId) {
      uiAlert('Impossible de supprimer ce parent (lien incomplet).')
      return
    }
    const ok = window.confirm(`Supprimer le lien parent-enfant pour ${parentName} ?`)
    if (!ok) return
    setDeletingParentId(parentId)
    try {
      await apiDelete(apiRoutes.players.parentById(player.id, parentId))
      const refreshed = await apiGet<Player>(apiRoutes.players.byId(player.id))
      setPlayer(refreshed)
      uiAlert('Parent retiré.')
    } catch (err: unknown) {
      uiAlert(`Erreur suppression parent: ${toErrorMessage(err)}`)
    } finally {
      setDeletingParentId(null)
    }
  }

  if (!id) return <div className="page-shell">Joueur introuvable.</div>

  return (
    <div className="page-shell player-details-page">
      <header className="player-details-head">
        <button type="button" className="back-link-button" onClick={() => navigate('/effectif')}>
          <ChevronLeftIcon size={18} />
          <span>Retour à l&apos;effectif</span>
        </button>
      </header>

      {loading && <p>Chargement...</p>}
      {error && <p className="inline-alert error">{error}</p>}

      {!loading && !error && player && (
        <section className="panel player-details-profile">
          <div className="player-profile-hero">
            <div className="player-profile-background" aria-hidden="true" />
            <div className="player-profile-main">
              <PlayerHeroAvatar player={player} />
              <div className="player-profile-texts">
                <h2>{playerName}</h2>
                <p>{playerPosition}</p>
                <div className="player-profile-badges">
                  <span><UserRoundCheck size={13} />{isChildPlayer(player) ? 'Enfant' : 'Adulte'}</span>
                  <span><ShieldCheck size={13} />{hasLicence ? 'Licence OK' : 'Licence manquante'}</span>
                  <span><CalendarCheck2 size={13} />{trainingAttendanceRate}% assiduité</span>
                </div>
                {invitationLoading && (
                  <div className="player-invite-row">
                    <span className="player-invite-pending-text">Chargement du statut d&apos;invitation...</span>
                  </div>
                )}
                {!invitationLoading && invitationStatusError && (
                  <div className="player-invite-row">
                    <span className="player-invite-error-text">{invitationStatusError}</span>
                    <button
                      type="button"
                      className="player-invite-btn secondary"
                      onClick={() => { if (player?.id) void refreshInvitationStatus(player.id) }}
                      disabled={inviteSending}
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                {!invitationLoading && !invitationStatusError && invitationStatus && (invitationStatus !== 'ACCEPTED' || isChildPlayer(player)) && (
                  <div className="player-invite-row">
                    {invitationStatus === 'PENDING' ? <span className="player-invite-label">Invité</span> : null}
                    <button
                      type="button"
                      className="player-invite-btn"
                      onClick={() => { void sendPlayerInvitation() }}
                      disabled={inviteSending}
                    >
                      {inviteSending ? 'Envoi...' : invitationStatus === 'PENDING' ? 'Renvoyer l’invitation' : (isChildPlayer(player) ? 'Inviter un parent' : 'Inviter')}
                    </button>
                  </div>
                )}
              </div>
              <div className="player-details-menu-wrap player-details-menu-wrap--hero">
                <RoundIconButton
                  ariaLabel="Ouvrir le menu d'actions"
                  className="player-details-menu-btn"
                  onClick={() => setActionsMenuOpen((prev) => !prev)}
                >
                  <DotsHorizontalIcon size={18} />
                </RoundIconButton>
                {actionsMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="player-details-menu-backdrop"
                      aria-label="Fermer le menu"
                      onClick={() => setActionsMenuOpen(false)}
                    />
                    <div className="player-details-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          openEditModal()
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setActionsMenuOpen(false)
                          setDeleteModalOpen(true)
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="player-profile-stats-grid">
            <article className="player-stat-card">
              <strong>Matchs joués</strong>
              <p>{canComputeMatchesPlayed ? matchesPlayed : '—'}</p>
            </article>
            <article className="player-stat-card">
              <strong>Buts marqués</strong>
              <p>{playerGoals}</p>
            </article>
            <article className="player-stat-card">
              <strong>Assiduité entraînement</strong>
              <p>{trainingAttendanceRate}%</p>
            </article>
            <article className="player-stat-card">
              <strong>Présences entraînement</strong>
              <p>{attendedTrainings}/{totalActiveTrainings}</p>
            </article>
          </div>

          <div className="player-details-grid">
            {isChildPlayer(player) && (
              <div className="player-details-parent-card">
                <span className="player-info-icon"><Users size={15} /></span>
                <strong>Parents</strong>
                {parentContacts.length > 0 ? (
                  <div className="player-parent-list">
                    {parentContacts.map((contact, index) => (
                      <div key={`${contact.fullName}-${contact.email}-${contact.phone}-${index}`} className="player-parent-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <strong>{`Parent ${index + 1}`}</strong>
                          <button
                            type="button"
                            className="players-danger-btn"
                            onClick={() => { void deleteParentLink(contact.parentId, contact.fullName) }}
                            disabled={!contact.parentId || deletingParentId === contact.parentId}
                          >
                            {deletingParentId === contact.parentId ? 'Suppression...' : 'Supprimer'}
                          </button>
                        </div>
                        <p><span>Prénom:</span> {contact.firstName || '—'}</p>
                        <p><span>Nom:</span> {contact.lastName || '—'}</p>
                        <p><span>E-mail:</span> {contact.email || '—'}</p>
                        <p><span>Téléphone:</span> {contact.phone || '—'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>—</p>
                )}
              </div>
            )}
            {!isChildPlayer(player) && (
              <div>
                <span className="player-info-icon"><Phone size={15} /></span>
                <strong>Numéro de téléphone</strong>
                <p>{player.phone || '—'}</p>
              </div>
            )}
            {!isChildPlayer(player) && (
              <div>
                <span className="player-info-icon"><Mail size={15} /></span>
                <strong>Adresse e-mail</strong>
                <p>{player.email || '—'}</p>
              </div>
            )}
            <div>
              <span className="player-info-icon"><IdCard size={15} /></span>
              <strong>Licence</strong>
              <p>{getLicence(player) || '—'}</p>
            </div>
          </div>
        </section>
      )}

      {editModalOpen && (
        <>
          <div className="player-modal-overlay" onClick={() => !saving && setEditModalOpen(false)} />
          <div className="player-modal" role="dialog" aria-modal="true" aria-label="Modifier le joueur">
            <div className="player-modal-head">
              <h3>Modifier le joueur</h3>
              <button type="button" onClick={() => setEditModalOpen(false)} disabled={saving}>x</button>
            </div>

            <form onSubmit={submitEdit} className="player-form-grid">
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-edit-last-name">Nom</label>
                <input id="player-edit-last-name" className="players-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-edit-first-name">Prénom</label>
                <input id="player-edit-first-name" className="players-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="players-form-field">
                <label className="players-checkbox" htmlFor="player-edit-is-child">
                  <input id="player-edit-is-child" type="checkbox" checked={isChild} onChange={(e) => setIsChild(e.target.checked)} />
                  <span>Enfant</span>
                </label>
              </div>
              {isChild && (
                <>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-edit-parent-last-name">Nom du parent</label>
                    <input id="player-edit-parent-last-name" className="players-input" value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} required />
                  </div>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-edit-parent-first-name">Prénom du parent</label>
                    <input id="player-edit-parent-first-name" className="players-input" value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} required />
                  </div>
                </>
              )}
              {!isChild && (
                <>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-edit-phone">Numéro de téléphone</label>
                    <input id="player-edit-phone" className="players-input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                  <div className="players-form-field">
                    <label className="players-field-label" htmlFor="player-edit-email">Adresse e-mail</label>
                    <input id="player-edit-email" className="players-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                </>
              )}
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-edit-licence">Licence</label>
                <input id="player-edit-licence" className="players-input" value={licence} onChange={(e) => setLicence(e.target.value)} />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="player-edit-position">Poste</label>
                <select id="player-edit-position" className="players-input" value={primaryPosition} onChange={(e) => setPrimaryPosition(e.target.value)}>
                  <option value={POSITION_UNDEFINED}>{formatPositionLabel(POSITION_UNDEFINED)}</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {formatPositionLabel(position)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="player-modal-actions">
                <button type="button" className="players-secondary-btn" onClick={() => setEditModalOpen(false)} disabled={saving}>Annuler</button>
                <button type="submit" className="players-primary-btn" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteModalOpen && (
        <>
          <div className="player-modal-overlay" onClick={() => !deleting && setDeleteModalOpen(false)} />
          <div className="player-modal" role="dialog" aria-modal="true" aria-label="Supprimer le joueur">
            <div className="player-modal-head">
              <h3>Supprimer le joueur</h3>
              <button type="button" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>x</button>
            </div>
            <p>Confirmer la suppression de {playerName} ?</p>
            <div className="player-modal-actions">
              <button type="button" className="players-secondary-btn" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>Annuler</button>
              <button type="button" className="players-danger-btn" onClick={() => { void deletePlayer() }} disabled={deleting}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </>
      )}

      {inviteParentModalOpen && player && (
        <>
          <div className="player-modal-overlay" onClick={() => setInviteParentModalOpen(false)} />
          <div className="player-modal" role="dialog" aria-modal="true" aria-label="Coordonnées du parent">
            <div className="player-modal-head">
              <h3>Inviter un parent</h3>
              <button type="button" onClick={() => setInviteParentModalOpen(false)}>x</button>
            </div>
            <form onSubmit={submitParentInviteModal} className="player-form-grid">
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="parent-invite-email">Adresse e-mail du parent</label>
                <input id="parent-invite-email" className="players-input" type="email" value={inviteParentEmail} onChange={(event) => setInviteParentEmail(event.target.value)} />
              </div>
              <div className="players-form-field">
                <label className="players-field-label" htmlFor="parent-invite-phone">Téléphone du parent</label>
                <input id="parent-invite-phone" className="players-input" value={inviteParentPhone} onChange={(event) => setInviteParentPhone(event.target.value)} />
              </div>
              <p style={{ margin: 0, color: '#475569', fontSize: 13 }}>Au moins un des deux champs est requis.</p>
              <div className="player-modal-actions">
                <button type="button" className="players-secondary-btn" onClick={() => setInviteParentModalOpen(false)}>Annuler</button>
                <button type="submit" className="players-primary-btn">Continuer</button>
              </div>
            </form>
          </div>
        </>
      )}

      {inviteModalOpen && player && inviteUrl && (
        <>
          <div className="player-modal-overlay" onClick={() => setInviteModalOpen(false)} />
          <div className="player-modal player-modal--invite" role="dialog" aria-modal="true" aria-label="Invitation joueur">
            <div className="player-modal-head">
              <h3>Invitation prête</h3>
              <button type="button" onClick={() => setInviteModalOpen(false)}>x</button>
            </div>
            <p>Partagez ce lien avec {playerName}. Le QR code ouvre la même page d&apos;activation.</p>
            <div className="player-invite-qr-wrap">
              <img src={`${API_BASE}${apiRoutes.players.inviteQr(player.id)}`} alt="QR code d'invitation joueur" />
            </div>
            <div className="player-invite-link-row">
              <input className="players-input" value={inviteUrl} readOnly />
            </div>
            <div className="player-modal-actions">
              <button
                type="button"
                className="players-secondary-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl)
                    uiAlert('Lien copié.')
                  } catch {
                    uiAlert('Impossible de copier automatiquement le lien.')
                  }
                }}
              >
                Copier le lien
              </button>
              <button type="button" className="players-primary-btn" onClick={() => setInviteModalOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PlayerHeroAvatar({ player }: { player: Player }) {
  const avatarUrl = getAvatarUrl(player)
  const displayName = getPlayerDisplayName(player)
  const initials = getInitials(displayName)
  return (
    <div className="player-hero-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} />
      ) : (
        <span style={{ background: colorFromName(displayName) }}>{initials}</span>
      )}
    </div>
  )
}
