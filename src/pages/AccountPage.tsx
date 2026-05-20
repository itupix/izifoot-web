// src/pages/AccountPage.tsx
import { useEffect, useMemo, useState } from 'react'
import type { Me } from '../api'
import { apiGet, apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import type { Team } from '../types/api'
import { uiAlert } from '../ui'
import { useAuth } from '../useAuth'

type LinkedChild = {
  id: string
  name: string | null
  firstName: string | null
  lastName: string | null
  licence: string | null
  teamId: string | null
  teamName: string | null
}

export default function AccountPage() {
  const { me, updateMe } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [teamNameById, setTeamNameById] = useState<Map<string, string>>(new Map())
  const [linkedChild, setLinkedChild] = useState<LinkedChild | null>(null)

  useEffect(() => {
    if (!me) return
    setFirstName(me.firstName || '')
    setLastName(me.lastName || '')
    setEmail(me.email || '')
    setPhone(me.phone || '')
  }, [me])

  useEffect(() => {
    if (!me) return
    let cancelled = false

    const loadTeamNames = async () => {
      try {
        const teams = await apiGet<Team[]>(apiRoutes.teams.list)
        if (cancelled) return
        const map = new Map<string, string>()
        for (const team of teams || []) {
          if (team?.id && team?.name) map.set(team.id, team.name)
        }
        setTeamNameById(map)
      } catch {
        if (!cancelled) setTeamNameById(new Map())
      }
    }

    void loadTeamNames()
    return () => {
      cancelled = true
    }
  }, [me?.id])

  useEffect(() => {
    if (!me || me.role !== 'PARENT') {
      setLinkedChild(null)
      return
    }

    let cancelled = false
    const loadLinkedChild = async () => {
      try {
        const child = await apiGet<LinkedChild | null>(apiRoutes.meChild)
        if (!cancelled) setLinkedChild(child)
      } catch {
        if (!cancelled) setLinkedChild(null)
      }
    }

    void loadLinkedChild()
    return () => {
      cancelled = true
    }
  }, [me?.id, me?.role])

  const meTeamName = useMemo(() => {
    if (!me?.teamId) return '—'
    return teamNameById.get(me.teamId) || me.teamId
  }, [me?.teamId, teamNameById])

  function resetPasswordDraft() {
    setCurrentPassword('')
    setNewPassword('')
    setPasswordConfirmation('')
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    if (!me) return

    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const normalizedEmail = email.trim()
    const normalizedPhone = phone.trim()

    if (!normalizedFirstName || !normalizedLastName || (!normalizedEmail && !normalizedPhone)) {
      uiAlert('Merci de renseigner prénom, nom et au moins un contact (e-mail ou téléphone).')
      return
    }

    const wantsPasswordChange = Boolean(currentPassword || newPassword || passwordConfirmation)
    if (wantsPasswordChange) {
      if (!currentPassword || !newPassword || !passwordConfirmation) {
        uiAlert('Pour changer votre mot de passe, renseignez le mot de passe actuel, le nouveau et sa confirmation.')
        return
      }
      if (newPassword.length < 6) {
        uiAlert('Le nouveau mot de passe doit contenir au moins 6 caractères.')
        return
      }
      if (newPassword !== passwordConfirmation) {
        uiAlert('La confirmation du nouveau mot de passe ne correspond pas.')
        return
      }
      if (currentPassword === newPassword) {
        uiAlert('Le nouveau mot de passe doit être différent du mot de passe actuel.')
        return
      }
    }

    const hasProfileChanges =
      normalizedFirstName !== (me.firstName || '').trim()
      || normalizedLastName !== (me.lastName || '').trim()
      || normalizedEmail !== (me.email || '')
      || (normalizedPhone || null) !== me.phone

    setSaving(true)
    try {
      if (hasProfileChanges) {
        const payload: Record<string, unknown> = {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          phone: normalizedPhone || null,
        }
        if (normalizedEmail) payload.email = normalizedEmail
        const updatedMe = await apiPut<Me>(apiRoutes.meProfile, payload)
        updateMe(updatedMe)
      }

      if (wantsPasswordChange) {
        try {
          await apiPut<{ ok: boolean }>(apiRoutes.mePassword, {
            currentPassword,
            newPassword,
          })
        } catch (err: unknown) {
          if (hasProfileChanges) {
            uiAlert(`Le profil a été mis à jour, mais le mot de passe n'a pas pu être modifié: ${toErrorMessage(err)}`)
          } else {
            uiAlert(`Erreur mise à jour mot de passe: ${toErrorMessage(err)}`)
          }
          return
        }
      }

      resetPasswordDraft()
      setIsEditOpen(false)
    } catch (err: unknown) {
      uiAlert(`Erreur mise à jour profil: ${toErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!me) return null

  return (
    <div className="page-shell">
      <header className="page-head">
        <h2 className="page-title">Mon compte</h2>
        <p className="page-subtitle">Informations de profil.</p>
      </header>

      <section className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Moi</h3>
          <button
            type="button"
            onClick={() => {
              resetPasswordDraft()
              setIsEditOpen(true)
            }}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
          >
            Modifier
          </button>
        </div>
        <div><strong>Prénom:</strong> {me.firstName || '—'}</div>
        <div><strong>Nom:</strong> {me.lastName || '—'}</div>
        <div><strong>Email:</strong> {me.email || '—'}</div>
        <div><strong>Téléphone:</strong> {me.phone || '—'}</div>
        {me.role !== 'PARENT' && <div><strong>Équipe:</strong> {meTeamName}</div>}
      </section>

      {me.role === 'PARENT' && (
        <section className="panel" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Mon enfant</h3>
          {linkedChild ? (
            <>
              <div><strong>Prénom:</strong> {linkedChild.firstName || '—'}</div>
              <div><strong>Nom:</strong> {linkedChild.lastName || linkedChild.name || '—'}</div>
              <div><strong>Licence:</strong> {linkedChild.licence || '—'}</div>
              <div><strong>Équipe:</strong> {linkedChild.teamName || linkedChild.teamId || '—'}</div>
            </>
          ) : (
            <div>Aucun enfant lié</div>
          )}
        </section>
      )}

      {isEditOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.36)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 30,
            padding: 12,
          }}
          onClick={() => {
            resetPasswordDraft()
            setIsEditOpen(false)
          }}
        >
          <section
            className="panel"
            style={{ width: 'min(720px, 100%)', borderRadius: 18, maxHeight: '88vh', overflow: 'auto', display: 'grid', gap: 10 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Modifier mon profil</h3>
              <button
                type="button"
                onClick={() => {
                  resetPasswordDraft()
                  setIsEditOpen(false)
                }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                Fermer
              </button>
            </div>
            <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Prénom</span>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Nom</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>E-mail</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span>Téléphone</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <div style={{ display: 'grid', gap: 10, paddingTop: 8 }}>
                <strong>Changer mon mot de passe</strong>
                <span style={{ color: '#64748b', fontSize: 13 }}>
                  Laissez ces champs vides si vous ne souhaitez pas modifier votre mot de passe.
                </span>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span>Mot de passe actuel</span>
                  <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span>Nouveau mot de passe</span>
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span>Confirmer le nouveau mot de passe</span>
                  <input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
