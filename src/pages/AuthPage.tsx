// src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';

export default function AuthPage() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      nav('/planning');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur';
      alert(message);
    }
  };

  return (
    <div style={{ maxWidth: 420 }}>
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
    </div>
  );
}
