import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import { toErrorMessage } from '../errors'
import { useAuth } from '../useAuth'
import type { InvitationDetails } from '../types/api'

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
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadInvitation = useCallback(async () => {
    if (!token) {
      setState('invalid')
      return
    }

    setState('loading')
    setErrorMessage('')

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
      setErrorMessage(toErrorMessage(err, 'Impossible de charger l’invitation.'))
    }
  }, [token])

  useEffect(() => {
    void loadInvitation()
  }, [loadInvitation])

  async function acceptInvitation(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return

    setErrorMessage('')

    if (password.length < 6) {
      setErrorMessage('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (password !== passwordConfirm) {
      setErrorMessage('Les mots de passe ne correspondent pas.')
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
        setErrorMessage(toErrorMessage(err, 'Données invalides.'))
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
      setErrorMessage(toErrorMessage(err, 'Erreur lors de la finalisation du compte.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Finaliser mon compte</h2>

        {state === 'loading' && <p>Vérification de l’invitation…</p>}

        {state === 'invalid' && (
          <div>
            <p style={errorTextStyle}>Lien d’invitation invalide.</p>
            <p>Vérifiez le lien reçu ou contactez votre club.</p>
          </div>
        )}

        {state === 'expired' && (
          <div>
            <p style={errorTextStyle}>Cette invitation a expiré.</p>
            <p>Demandez une nouvelle invitation à la direction.</p>
          </div>
        )}

        {state === 'conflict' && (
          <div>
            <p style={errorTextStyle}>Cette invitation est déjà utilisée ou annulée.</p>
            <p>Contactez la direction si besoin.</p>
          </div>
        )}

        {state === 'error' && <p style={errorTextStyle}>{errorMessage || 'Erreur inconnue.'}</p>}

        {state === 'ready' && details && (
          <form onSubmit={acceptInvitation} style={{ display: 'grid', gap: 10 }}>
            <div style={metaStyle}><strong>Email:</strong> {details.email}</div>
            <div style={metaStyle}><strong>Rôle:</strong> {details.role}</div>
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              style={inputStyle}
            />
            <label style={labelStyle}>Confirmer le mot de passe</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              minLength={6}
              required
              style={inputStyle}
            />
            {errorMessage && <p style={errorTextStyle}>{errorMessage}</p>}
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? 'Validation…' : 'Finaliser le compte'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const wrapperStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 16,
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  padding: 16,
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
}

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: '#64748b',
}

const metaStyle: CSSProperties = {
  fontSize: 14,
  color: '#334155',
}

const buttonStyle: CSSProperties = {
  border: '1px solid #16a34a',
  background: '#16a34a',
  color: '#fff',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
}

const errorTextStyle: CSSProperties = {
  margin: 0,
  color: '#b91c1c',
}
