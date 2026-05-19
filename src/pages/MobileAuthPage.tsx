import React from 'react'
import { useLocation } from 'react-router-dom'
import { apiUrl } from '../apiClient'
import { toErrorMessage } from '../errors'
import { useAuth } from '../useAuth'

type AuthMode = 'login' | 'register'

const shellStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#ffffff',
  border: '1px solid #dbe7ff',
  borderRadius: 18,
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
  padding: 20,
  display: 'grid',
  gap: 14,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  outline: 'none',
}

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  border: 0,
  borderRadius: 12,
  padding: '13px 16px',
  background: '#0f172a',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 12,
  padding: '12px 16px',
  background: '#ffffff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
}

function errorMessageForCode(code: string | null) {
  switch (code) {
    case 'state_invalid':
      return "La tentative de connexion n'est plus valide."
    case 'state_expired':
      return "La tentative a expiré. Relancez la connexion depuis l’app."
    case 'auth_required':
      return 'Connectez-vous pour finaliser le retour vers l’app.'
    default:
      return null
  }
}

function MobileAuthCard(props: { title: string, subtitle: string, children?: React.ReactNode }) {
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>izifoot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{props.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#475569' }}>{props.subtitle}</div>
        </div>
        {props.children}
      </div>
    </div>
  )
}

export function MobileAuthStartPage() {
  React.useEffect(() => {
    window.location.replace(apiUrl('/auth/mobile/start?platform=ios'))
  }, [])

  return (
    <MobileAuthCard
      title="Ouverture sécurisée"
      subtitle="Préparation de la connexion izifoot.fr avant le retour vers l’app."
    />
  )
}

export default function MobileAuthPage() {
  const location = useLocation()
  const { me, loading, login, register, logout } = useAuth()

  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search])
  const platform = (searchParams.get('platform') || '').toLowerCase()
  const state = searchParams.get('state') || ''
  const serverError = errorMessageForCode(searchParams.get('error'))

  const [mode, setMode] = React.useState<AuthMode>('login')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [clubName, setClubName] = React.useState('')
  const [authError, setAuthError] = React.useState<string | null>(serverError)
  const [authLoading, setAuthLoading] = React.useState(false)
  const [isContinuing, setIsContinuing] = React.useState(false)

  React.useEffect(() => {
    setAuthError(serverError)
  }, [serverError])

  const isValidRequest = platform === 'ios' && state.length >= 16
  const callbackUrl = React.useMemo(() => {
    if (!isValidRequest) return ''
    return apiUrl(`/auth/mobile/callback?state=${encodeURIComponent(state)}`)
  }, [isValidRequest, state])

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        const normalizedClubName = clubName.trim()
        if (!normalizedClubName) {
          setAuthError('Le nom du club est requis.')
          return
        }
        await register(email.trim(), password, normalizedClubName)
      }
    } catch (error: unknown) {
      setAuthError(toErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function switchAccount() {
    setAuthError(null)
    setAuthLoading(true)
    try {
      await logout()
    } catch (error: unknown) {
      setAuthError(toErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  function continueToApp() {
    if (!callbackUrl) return
    setIsContinuing(true)
    window.location.assign(callbackUrl)
  }

  if (!isValidRequest) {
    return (
      <MobileAuthCard
        title="Lien invalide"
        subtitle="Cette tentative de connexion mobile n’est pas exploitable. Relancez l’authentification depuis l’app iOS."
      />
    )
  }

  if (loading && !me) {
    return (
      <MobileAuthCard
        title="Vérification en cours"
        subtitle="Nous vérifions si une session web izifoot est déjà active pour ce navigateur."
      />
    )
  }

  if (me) {
    return (
      <MobileAuthCard
        title="Prêt à revenir dans l’app"
        subtitle={`Vous êtes connecté en tant que ${me.email}. Finalisez maintenant la connexion iOS.`}
      >
        {authError ? (
          <div style={{ color: '#b91c1c', fontSize: 13 }}>{authError}</div>
        ) : null}
        <button type="button" style={primaryButtonStyle} onClick={continueToApp} disabled={isContinuing}>
          {isContinuing ? 'Retour vers l’app…' : 'Ouvrir l’app'}
        </button>
        <button type="button" style={secondaryButtonStyle} onClick={switchAccount} disabled={authLoading || isContinuing}>
          Utiliser un autre compte
        </button>
      </MobileAuthCard>
    )
  }

  return (
    <MobileAuthCard
      title="Connexion iPhone"
      subtitle="Connectez-vous sur izifoot.fr. Une fois authentifié, vous reviendrez dans l’app iOS pour terminer l’échange sécurisé."
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode('login')}
          style={{
            ...secondaryButtonStyle,
            background: mode === 'login' ? '#0f172a' : '#ffffff',
            color: mode === 'login' ? '#ffffff' : '#0f172a',
          }}
        >
          Connexion
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          style={{
            ...secondaryButtonStyle,
            background: mode === 'register' ? '#0f172a' : '#ffffff',
            color: mode === 'register' ? '#ffffff' : '#0f172a',
          }}
        >
          Inscription
        </button>
      </div>

      <form onSubmit={submitAuth} style={{ display: 'grid', gap: 10 }}>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder="Email"
          style={inputStyle}
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          minLength={6}
          placeholder="Mot de passe"
          style={inputStyle}
        />
        {mode === 'register' ? (
          <input
            value={clubName}
            onChange={(event) => setClubName(event.target.value)}
            type="text"
            required
            minLength={2}
            placeholder="Nom du club"
            style={inputStyle}
          />
        ) : null}
        {authError ? (
          <div style={{ color: '#b91c1c', fontSize: 13 }}>{authError}</div>
        ) : null}
        <button type="submit" style={primaryButtonStyle} disabled={authLoading}>
          {authLoading ? 'Connexion…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>
    </MobileAuthCard>
  )
}
