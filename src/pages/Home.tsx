// src/pages/Home.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../useAuth';
import '../index.css';
import { API_BASE } from '../api';

export default function Home() {
  const { me } = useAuth();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  function validateEmail(v: string) {
    return /[^@ \t\r\n]+@[^@ \t\r\n]+\.[^@ \t\r\n]+/.test(v);
  }

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email)) {
      setStatus("error");
      setMessage("Adresse e‑mail invalide");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      // Remplace `/api/waitlist` par ton endpoint (Netlify/Cloudflare/Next API/etc.)
      const res = await fetch(`${API_BASE}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Bad status ' + res.status);
      setStatus("success");
      setMessage("Merci ! On te prévient dès que l'app est dispo ✉️");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Oups, une erreur est survenue. Réessaie dans un instant.");
    }
  }

  const wrapper: React.CSSProperties = {
    minHeight: 'calc(100dvh - 56px)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',

  };

  const hero: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    placeItems: 'center',
    padding: '64px 16px 24px',
    textAlign: 'center',
  };

  const badge: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(16,185,129,0.12)',
    color: '#065f46',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid rgba(16,185,129,0.25)'
  };

  const title: React.CSSProperties = {
    margin: '14px 0 8px',
    fontSize: 48,
    lineHeight: 1.05,
    letterSpacing: -0.5,
    fontWeight: 800,
    background: 'linear-gradient(90deg, #0ea5e9, #22c55e)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  } as any;

  const subtitle: React.CSSProperties = {
    color: '#334155',
    fontSize: 18,
    maxWidth: 740,
    margin: '0 auto 22px',
  };

  const ctaRow: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
  };

  const primaryBtn: React.CSSProperties = {
    appearance: 'none',
    border: 'none',
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #2563eb, #1d4ed8)',
    color: 'white',
    fontWeight: 700,
    boxShadow: '0 10px 20px rgba(29,78,216,0.15), 0 2px 6px rgba(29,78,216,0.2)'
  };

  const secondaryBtn: React.CSSProperties = {
    appearance: 'none',
    border: '1px solid #e2e8f0',
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: 12,
    background: 'white',
    color: '#0f172a',
    fontWeight: 700,
  };

  const footer: React.CSSProperties = {
    padding: '32px 16px',
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
  };

  const waitlistWrap: React.CSSProperties = {
    marginTop: 18,
    width: '100%',
    maxWidth: 560,
  };

  const formRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 10,
    alignItems: 'center',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    fontSize: 16,
    outline: 'none',
  };

  const helperText: React.CSSProperties = {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  };

  const noteStyle: React.CSSProperties = {
    fontSize: 12,
    color: status === 'error' ? '#b91c1c' : '#065f46',
    marginTop: 8,
    textAlign: 'left',
  };

  return (
    <div style={wrapper}>
      {/* HERO */}
      <section style={hero}>
        <span style={badge}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981', display: 'inline-block' }} />
          Bientôt disponible
        </span>
        <h1 style={title}>izifoot</h1>
        <p style={subtitle}>Génère, partage et gère les plannings de tes plateaux. Anti matchs intra-club, multi-terrains, pauses, export, partage par lien et QR code… tout y est.</p>
        <div style={ctaRow}>
          {me ? (
            <>
              <Link to="/plannings" style={primaryBtn}>Voir mes plannings</Link>
              <Link to="/plannings/new" style={secondaryBtn}>Créer un planning</Link>
            </>
          ) : (
            <>
              <Link to="/auth" style={primaryBtn}>Se connecter / Créer un compte</Link>
              <a href="#features" style={secondaryBtn}>Découvrir</a>
            </>
          )}
        </div>
        <div style={waitlistWrap}>
          <form onSubmit={handleWaitlistSubmit} style={formRow}>
            <label htmlFor="waitlist-email" className="sr-only">Adresse e‑mail</label>
            <input
              id="waitlist-email"
              type="email"
              placeholder="Ton e‑mail pour être averti"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              disabled={status === 'loading'}
            />
            <button
              type="submit"
              style={primaryBtn}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Envoi…' : 'Préviens‑moi'}
            </button>
          </form>
          <div style={helperText}>Aucune pub, aucun spam. Juste un e‑mail au lancement.</div>
          {message && (
            <div style={noteStyle} role={status === 'error' ? 'alert' : undefined}>
              {message}
            </div>
          )}
        </div>
      </section>

      <footer style={footer}>
        © {new Date().getFullYear()} izifoot — Fait avec ❤ pour les éducateurs
      </footer>
    </div>
  );
}
