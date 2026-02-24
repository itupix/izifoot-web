// src/pages/Home.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';
import '../index.css';
import whistleImg from '../assets/whistle.png';
import slateImg from '../assets/slate.png';
import ballImg from '../assets/ball.png';

export default function Home() {
  const { me, login, register } = useAuth();
  const navigate = useNavigate();

  const wrapper: React.CSSProperties = {
    minHeight: '100dvh',
    display: 'grid',
    gridTemplateRows: '1fr auto',
    background: 'linear-gradient(180deg, #f7fbf9 0%, #f5f7ff 60%, #ffffff 100%)',
  };

  const hero: React.CSSProperties = {
    padding: 0,
    maxWidth: '100%',
    margin: 0,
  };

  const title: React.CSSProperties = {
    margin: '14px 0 8px',
    fontSize: 48,
    lineHeight: 1.05,
    letterSpacing: -0.5,
    fontWeight: 800,
    color: '#0f172a',
  };

  const ctaRow: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
  };

  const visualWrap: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    marginTop: 8,
  };

  const visualImage: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 12px 24px rgba(15, 23, 42, 0.10))',
  };

  const authCard: React.CSSProperties = {
    width: '100%',
    maxWidth: 380,
    margin: '0 auto',
    borderRadius: 16,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.06)',
    padding: 16,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    fontSize: 14,
    outline: 'none',
  };
  const fieldRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 8,
    alignItems: 'center',
  };
  const checkDot = (ok: boolean): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${ok ? '#16a34a' : '#e2e8f0'}`,
    color: ok ? '#16a34a' : 'transparent',
    fontSize: 12,
    fontWeight: 700,
  });

  const helperText: React.CSSProperties = {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  };

  const footerWrap: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    background: 'white',
    borderTop: '1px solid #e2e8f0',
  };

  const primaryBtn: React.CSSProperties = {
    appearance: 'none',
    border: 'none',
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #6ee7b7, #34d399)',
    color: 'white',
    fontWeight: 700,
    boxShadow: '0 10px 20px rgba(52,211,153,0.25), 0 2px 6px rgba(52,211,153,0.2)'
  };

  const footer: React.CSSProperties = {
    padding: '16px',
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
  };

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const heroImage = React.useMemo(() => {
    const imgs = [whistleImg, slateImg, ballImg];
    return imgs[Math.floor(Math.random() * imgs.length)];
  }, []);

  function passwordScore(value: string) {
    let score = 0;
    if (value.length > 0) score++;
    if (value.length >= 10) score += 2;
    if (/[^A-Za-z0-9]/.test(value)) score += 2;
    return Math.min(score, 5);
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      if (mode === 'register' && password !== passwordConfirm) {
        setAuthError('Les mots de passe ne correspondent pas.');
        return;
      }
      setAuthLoading(true);
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/planning');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div style={wrapper}>
      {/* HERO */}
      <section className="home-hero" style={hero}>
        <div className="home-col" style={{ justifyItems: 'center' }}>
          <h1 style={title}>izifoot</h1>
          <div style={ctaRow}>
            {me ? (
              <Link to="/plannings" style={primaryBtn}>Voir mes plannings</Link>
            ) : null}
          </div>
          <div style={visualWrap}>
            <img src={heroImage} alt="Illustration aquarelle" style={visualImage} />
          </div>
        </div>

        {!me && (
          <div className="home-col" style={authCard}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Bienvenue</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
              Gérez votre équipe
            </div>
            <form onSubmit={submitAuth} style={{ display: 'grid', gap: 10, width: '100%', textAlign: 'left' }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>Email</label>
              <div style={fieldRow}>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" required style={inputStyle} />
                <span style={checkDot(!!email)}>✓</span>
              </div>
              <label style={{ fontSize: 12, color: '#64748b' }}>Mot de passe</label>
              <div style={fieldRow}>
                <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} style={inputStyle} />
                <span style={checkDot(mode === 'login' ? password.length >= 1 : passwordScore(password) === 5)} title="Sécurité max: longueur ≥ 10 et caractère spécial.">
                  ✓
                </span>
              </div>
              {mode === 'register' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999 }}>
                    <div
                      style={{
                        height: 8,
                        width: `${(passwordScore(password) / 5) * 100}%`,
                        borderRadius: 999,
                        background:
                          passwordScore(password) <= 1
                            ? '#f87171'
                            : passwordScore(password) === 2
                              ? '#fbbf24'
                              : passwordScore(password) === 3
                                ? '#60a5fa'
                                : '#34d399',
                        transition: 'width 200ms ease',
                      }}
                      title="Sécurité max: longueur ≥ 10 et caractère spécial."
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Sécurité : {['Très faible', 'Faible', 'Moyenne', 'Bonne', 'Très bonne'][Math.max(0, passwordScore(password) - 1) || 0]}
                  </div>
                </div>
              )}
              {mode === 'register' && (
                <>
                  <label style={{ fontSize: 12, color: '#64748b' }}>Confirmer le mot de passe</label>
                  <div style={fieldRow}>
                    <input
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      type="password"
                      required
                      minLength={6}
                      style={inputStyle}
                    />
                    <span style={checkDot(password === passwordConfirm && passwordConfirm.length > 0)}>✓</span>
                  </div>
                  {passwordConfirm.length > 0 && password !== passwordConfirm && (
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>
                      Les mots de passe ne correspondent pas.
                    </div>
                  )}
                </>
              )}
              {authError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{authError}</div>}
              <button type="submit" disabled={authLoading} style={primaryBtn}>
                {authLoading ? 'Envoi…' : (mode === 'login' ? 'Se connecter' : 'Créer le compte')}
              </button>
              <div style={helperText}>
                {mode === 'login' ? 'Pas de compte ?' : 'Vous avez un compte ?'}{' '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  style={{ border: 'none', background: 'transparent', color: '#2563eb', fontWeight: 600, padding: 0 }}
                >
                  {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      <div style={footerWrap}>
        <footer style={footer}>
          © {new Date().getFullYear()} izifoot — Fait avec ❤ pour les éducateurs
        </footer>
      </div>
    </div>
  );
}
