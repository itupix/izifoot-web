import React from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import { apiUrl } from '../apiClient'
import { toErrorMessage } from '../errors'
import { useAuth } from '../useAuth'
import brandLogo from '../assets/izifoot-logo-header.png'
import brandLogoDark from '../assets/izifoot-logo-header-dark.png'
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
      <picture>
        <source srcSet={brandLogoDark} media="(prefers-color-scheme: dark)" />
        <img src={brandLogo} alt="izifoot" className="mobile-auth-brand-logo" />
      </picture>
    </div>
  )
}

function MobileAuthCard(props: { title: string, subtitle: string, children?: React.ReactNode }) {
  return (
    <div className="mobile-auth-shell">
      <div className="mobile-auth-stage">
        <IzifootBrand />
        <div className="mobile-auth-card">
          <div className="mobile-auth-header">
            <h1 className="mobile-auth-title">{props.title}</h1>
            <p className="mobile-auth-subtitle">{props.subtitle}</p>
          </div>
          {props.children}
        </div>
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
    >
      <div className="mobile-auth-spinner" aria-hidden="true" />
    </MobileAuthCard>
  )
}

export default function MobileAuthPage() {
  const location = useLocation()
  const { me, loading, login, register } = useAuth()
  const hasAutoContinuedRef = React.useRef(false)
  const submittedAuthRef = React.useRef(false)

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
  const [isConfirmingSession, setIsConfirmingSession] = React.useState(false)
  const [canAutoContinue, setCanAutoContinue] = React.useState(false)

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

  React.useEffect(() => {
    if (!me) {
      setCanAutoContinue(false)
      return
    }
    if (!submittedAuthRef.current && !loading) {
      setCanAutoContinue(true)
    }
  }, [loading, me])

  React.useEffect(() => {
    if (!me || !callbackUrl || !canAutoContinue || hasAutoContinuedRef.current) return
    hasAutoContinuedRef.current = true
    window.location.assign(callbackUrl)
  }, [callbackUrl, canAutoContinue, me])

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    try {
      if (mode === 'login') {
        submittedAuthRef.current = true
        await login(email.trim(), password)
      } else {
        const normalizedClubName = clubName.trim()
        if (!normalizedClubName) {
          setAuthError('Le nom du club est requis.')
          return
        }
        submittedAuthRef.current = true
        await register(email.trim(), password, normalizedClubName)
      }
      setIsConfirmingSession(true)
      await api.me()
      setCanAutoContinue(true)
    } catch (error: unknown) {
      submittedAuthRef.current = false
      setCanAutoContinue(false)
      setAuthError(toErrorMessage(error))
    } finally {
      setIsConfirmingSession(false)
      setAuthLoading(false)
    }
  }

  function toggleMode() {
    setAuthError(null)
    setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))
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
      >
        <div className="mobile-auth-spinner" aria-hidden="true" />
      </MobileAuthCard>
    )
  }

  if (me) {
    const isWaitingToResume = isConfirmingSession || canAutoContinue
    return (
      <MobileAuthCard
        title={isWaitingToResume ? 'Retour vers l’app' : 'Connexion confirmée'}
        subtitle={isWaitingToResume
          ? `Connexion validée pour ${me.email}. Réouverture automatique de l’app iOS.`
          : `Session active pour ${me.email}.`}
      >
        {authError ? (
          <p className="mobile-auth-error" role="alert">
            {authError}
          </p>
        ) : null}
        {isWaitingToResume ? <div className="mobile-auth-spinner" aria-hidden="true" /> : null}
      </MobileAuthCard>
    )
  }

  return (
    <MobileAuthCard title={pageTitle} subtitle={pageSubtitle}>
      <form onSubmit={submitAuth} className="mobile-auth-form">
        {mode === 'register' ? (
          <input
            value={clubName}
            onChange={(event) => setClubName(event.target.value)}
            type="text"
            required
            minLength={2}
            autoComplete="organization"
            placeholder="Nom de votre club"
            className="mobile-auth-field mobile-auth-field-emphasis"
          />
        ) : null}
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
        <button type="button" className="mobile-auth-switch-button" onClick={toggleMode} disabled={authLoading}>
          {mode === 'login' ? 'Vous êtes coach ? Inscrivez votre club à izifoot.' : 'Revenir à la connexion'}
        </button>
      </div>
    </MobileAuthCard>
  )
}
