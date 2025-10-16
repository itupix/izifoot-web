// src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'

export default function AuthPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [playerMode, setPlayerMode] = useState<{ ready: boolean; isPlayer: boolean; redirect?: string }>(
    { ready: false, isPlayer: false }
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      nav('/planning');
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  React.useEffect(() => {
    (async () => {
      try {
        const me = await fetch(`${API_BASE}/api/player/me`, { credentials: 'include' })
        if (me.ok) {
          const pls = await fetch(`${API_BASE}/api/player/plateaus`, { credentials: 'include' })
          if (pls.ok) {
            const list = await pls.json()
            const target = Array.isArray(list) && list.length ? `/match-day/${list[0].id}` : '/'
            setPlayerMode({ ready: true, isPlayer: true, redirect: target })
            // Rediriger automatiquement si on est déjà dans le flux d'invitation
            nav(target)
            return
          }
        }
      } catch { }
      setPlayerMode({ ready: true, isPlayer: false })
    })()
  }, [nav])

  return (
    <div style={{ maxWidth: 420 }}>
      {playerMode.ready && playerMode.isPlayer ? (
        <div>
          <h2>Accès joueur</h2>
          <p>Vous êtes connecté via une invitation joueur. Votre accès est limité aux plateaux où vous êtes convoqué.</p>
          <button onClick={() => playerMode.redirect && nav(playerMode.redirect)}>
            Voir mon prochain plateau
          </button>
        </div>
      ) : (
        <>
          <h2>{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</h2>
          <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
            <label>
              Email
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
            </label>
            <label>
              Mot de passe
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} />
            </label>
            <button type="submit">{mode === 'login' ? 'Connexion' : 'Créer le compte'}</button>
          </form>
          <div style={{ marginTop: 8 }}>
            {mode === 'login' ? (
              <button onClick={() => setMode('register')}>Pas de compte ? Inscription</button>
            ) : (
              <button onClick={() => setMode('login')}>J’ai déjà un compte</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}