import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAuth } from '../useAuth'
import type { InvitationDetails } from '../types/api'
import whistleImg from '../assets/whistle.png'
import './InviteAcceptPage.css'

type InviteState = 'loading' | 'ready' | 'invalid' | 'expired' | 'conflict' | 'error'

function extractStatusCode(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err && typeof (err as Error & { status?: unknown }).status === 'number') {
    return (err as Error & { status: number }).status
  }
  return undefined
}

export default function InviteAcceptPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  const [state, setState] = useState<InviteState>('loading')
  const [details, setDetails] = useState<InvitationDetails | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [apiErrorMessage, setApiErrorMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordConfirmError, setPasswordConfirmError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadInvitation = useCallback(async () => {
    if (!token) {
      setState('invalid')
      return
    }

    setState('loading')
    setApiErrorMessage('')

    try {
      const invitation = await apiGet<InvitationDetails>(apiRoutes.auth.invitationByToken(token))
      setDetails(invitation)
      setState('ready')
    } catch (err: unknown) {
      const status = extractStatusCode(err)
      if (status === 404) {
        setState('invalid')
        return
      }
      if (status === 410) {
        setState('expired')
        return
      }
      if (status === 409) {
        setState('conflict')
        return
      }
      setState('error')
      setApiErrorMessage(toErrorMessage(err, 'Impossible de charger l’invitation.'))
    }
  }, [token])

  useEffect(() => {
    void loadInvitation()
  }, [loadInvitation])

  async function acceptInvitation(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return

    setApiErrorMessage('')
    setPasswordError('')
    setPasswordConfirmError('')

    if (password.length < 6) {
      setPasswordError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (password !== passwordConfirm) {
      setPasswordConfirmError('Les mots de passe ne correspondent pas.')
      return
    }

    setSubmitting(true)
    try {
      await apiPost(apiRoutes.auth.acceptInvitation, { token, password })
      await refresh().catch(() => undefined)
      navigate('/planning', { replace: true })
    } catch (err: unknown) {
      const status = extractStatusCode(err)
      if (status === 400) {
        setApiErrorMessage(toErrorMessage(err, 'Données invalides.'))
        return
      }
      if (status === 404) {
        setState('invalid')
        return
      }
      if (status === 410) {
        setState('expired')
        return
      }
      if (status === 409) {
        setState('conflict')
        return
      }
      setApiErrorMessage(toErrorMessage(err, 'Erreur lors de l’inscription.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="invite-accept-page">
      <div className="panel invite-accept-card">
        <div className="invite-accept-brand">
          <img src={whistleImg} alt="Izifoot" />
          <span>izifoot</span>
        </div>
        <h2 className="invite-accept-title">Rejoindre Izifoot</h2>
        <p className="invite-accept-subtitle">
          Izifoot est l&apos;application des clubs pour suivre le planning de l&apos;équipe, les séances et les matchs.
        </p>
        <p className="invite-accept-subtitle">
          Créez votre mot de passe pour accéder à votre espace.
        </p>

        {state === 'loading' && <p>Vérification de votre invitation…</p>}

        {state === 'invalid' && (
          <div className="invite-accept-message-block">
            <p className="invite-accept-error">Lien d’invitation invalide.</p>
            <p>Vérifiez le lien reçu ou contactez votre club.</p>
          </div>
        )}

        {state === 'expired' && (
          <div className="invite-accept-message-block">
            <p className="invite-accept-error">Cette invitation a expiré.</p>
            <p>Demandez une nouvelle invitation à la direction.</p>
          </div>
        )}

        {state === 'conflict' && (
          <div className="invite-accept-message-block">
            <p className="invite-accept-error">Cette invitation est déjà utilisée ou annulée.</p>
            <p>Contactez la direction si besoin.</p>
          </div>
        )}

        {state === 'error' && <p className="invite-accept-error">{apiErrorMessage || 'Erreur inconnue.'}</p>}

        {state === 'ready' && details && (
          <form onSubmit={acceptInvitation} className="invite-accept-form" noValidate>
            <div className="invite-accept-meta"><strong>Email:</strong> {details.email}</div>
            <label className="invite-accept-label" htmlFor="invite-password">Mot de passe</label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError('')
              }}
              minLength={6}
              required
              className={`invite-accept-input ${passwordError ? 'is-error' : ''}`}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'invite-password-error' : undefined}
            />
            {passwordError && <p id="invite-password-error" className="invite-accept-error">{passwordError}</p>}
            <label className="invite-accept-label" htmlFor="invite-password-confirm">Confirmer le mot de passe</label>
            <input
              id="invite-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value)
                if (passwordConfirmError) setPasswordConfirmError('')
              }}
              minLength={6}
              required
              className={`invite-accept-input ${passwordConfirmError ? 'is-error' : ''}`}
              aria-invalid={Boolean(passwordConfirmError)}
              aria-describedby={passwordConfirmError ? 'invite-password-confirm-error' : undefined}
            />
            {passwordConfirmError && <p id="invite-password-confirm-error" className="invite-accept-error">{passwordConfirmError}</p>}
            {apiErrorMessage && <p className="invite-accept-error">{apiErrorMessage}</p>}
            <button type="submit" disabled={submitting} className="invite-accept-submit">
              {submitting ? 'Inscription…' : 'Rejoindre Izifoot'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
