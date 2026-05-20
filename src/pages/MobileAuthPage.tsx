import React from 'react'
import { useLocation } from 'react-router-dom'
import { apiUrl } from '../apiClient'
import { toErrorMessage } from '../errors'
import { useAuth } from '../useAuth'
import brandLogo from '../assets/izifoot-logo-header.png'
import './MobileAuthPage.css'

type AuthMode = 'login' | 'register'

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

function IzifootBrand() {
  return (
    <div className="mobile-auth-brand">
      <div className="mobile-auth-brand-badge">
        <img src={brandLogo} alt="izifoot" className="mobile-auth-brand-logo" />
      </div>
    </div>
  )
}

function MobileAuthCard(props: { eyebrow?: string, title: string, subtitle: string, children?: React.ReactNode }) {
  return (
    <div className="mobile-auth-shell">
      <div className="mobile-auth-card">
        <div className="mobile-auth-header">
          {props.eyebrow ? <div className="mobile-auth-eyebrow">{props.eyebrow}</div> : null}
          <IzifootBrand />
          <h1 className="mobile-auth-title">{props.title}</h1>
          <p className="mobile-auth-subtitle">{props.subtitle}</p>
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
      eyebrow="Connexion sécurisée"
      title="Ouverture sécurisée"
      subtitle="Préparation de la connexion izifoot.fr avant le retour vers l’app."
    >
      <div className="mobile-auth-spinner" aria-hidden="true" />
    </MobileAuthCard>
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

  const pageTitle = mode === 'login' ? 'Connexion' : 'Création de compte coach'
  const pageSubtitle = mode === 'login'
    ? 'Connectez-vous à votre compte izifoot.'
    : 'Rejoignez izifoot pour gérer votre équipe.'

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

  function toggleMode() {
    setAuthError(null)
    setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))
  }

  if (!isValidRequest) {
    return (
      <MobileAuthCard
        eyebrow="Connexion sécurisée"
        title="Lien invalide"
        subtitle="Cette tentative de connexion mobile n’est pas exploitable. Relancez l’authentification depuis l’app iOS."
      />
    )
  }

  if (loading && !me) {
    return (
      <MobileAuthCard
        eyebrow="Connexion sécurisée"
        title="Vérification en cours"
        subtitle="Nous vérifions si une session web izifoot est déjà active pour ce navigateur."
      >
        <div className="mobile-auth-spinner" aria-hidden="true" />
      </MobileAuthCard>
    )
  }

  if (me) {
    return (
      <MobileAuthCard
        eyebrow="Connexion sécurisée"
        title="Prêt à revenir dans l’app"
        subtitle={`Vous êtes connecté en tant que ${me.email}. Finalisez maintenant la connexion iOS.`}
      >
        {authError ? (
          <p className="mobile-auth-error" role="alert">
            {authError}
          </p>
        ) : null}
        <div className="mobile-auth-button-stack">
          <button type="button" className="mobile-auth-primary-button" onClick={continueToApp} disabled={isContinuing}>
            {isContinuing ? 'Retour vers l’app…' : 'Ouvrir l’app'}
          </button>
          <button
            type="button"
            className="mobile-auth-secondary-button"
            onClick={switchAccount}
            disabled={authLoading || isContinuing}
          >
            Utiliser un autre compte
          </button>
        </div>
      </MobileAuthCard>
    )
  }

  return (
    <MobileAuthCard eyebrow="Connexion sécurisée" title={pageTitle} subtitle={pageSubtitle}>
      <form onSubmit={submitAuth} className="mobile-auth-form">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="mobile-auth-field"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="Mot de passe"
          className="mobile-auth-field"
        />
        {mode === 'register' ? (
          <input
            value={clubName}
            onChange={(event) => setClubName(event.target.value)}
            type="text"
            required
            minLength={2}
            autoComplete="organization"
            placeholder="Nom du club"
            className="mobile-auth-field"
          />
        ) : null}
        {authError ? (
          <p className="mobile-auth-error" role="alert">
            {authError}
          </p>
        ) : null}
        <button type="submit" className="mobile-auth-primary-button" disabled={authLoading}>
          {authLoading ? (mode === 'login' ? 'Connexion…' : 'Création…') : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>

      <div className="mobile-auth-switch">
        <span className="mobile-auth-switch-label">
          {mode === 'login' ? 'Vous n’avez pas encore de compte coach ?' : 'Vous avez déjà un compte ?'}
        </span>
        <button type="button" className="mobile-auth-switch-button" onClick={toggleMode} disabled={authLoading}>
          {mode === 'login' ? 'Création de compte coach' : 'Revenir à la connexion'}
        </button>
      </div>
    </MobileAuthCard>
  )
}
