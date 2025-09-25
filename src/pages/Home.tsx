// src/pages/Home.tsx
import { Link } from 'react-router-dom';
import { useAuth } from '../useAuth';
import '../index.css';

export default function Home() {
  const { me } = useAuth();

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

  const features: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
    gap: 16,
    padding: '28px 16px',
    maxWidth: 1100,
    margin: '0 auto',
  };

  const card: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: 16,
    background: 'rgba(255,255,255,0.8)',
    backdropFilter: 'blur(8px)',
  };

  const iconCircle = (bg: string) => ({
    width: 36,
    height: 36,
    borderRadius: 999,
    background: bg,
    display: 'grid',
    placeItems: 'center',
    color: 'white',
    fontWeight: 800,
    fontSize: 18,
    boxShadow: '0 6px 16px rgba(0,0,0,0.08)'
  } as React.CSSProperties);

  const footer: React.CSSProperties = {
    padding: '32px 16px',
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
  };

  return (
    <div style={wrapper}>
      {/* HERO */}
      <section style={hero}>
        <span style={badge}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981', display: 'inline-block' }} />
          Planifie tes plateaux en 2 minutes
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
      </section>

      {/* FEATURES */}
      <section id="features" style={{ paddingBottom: 28 }}>
        <div style={features}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={iconCircle('linear-gradient(180deg,#22c55e,#16a34a)')}>✓</div>
              <h3 style={{ margin: 0 }}>Génération intelligente</h3>
            </div>
            <p style={{ margin: 0, color: '#475569' }}>Évite les rencontres intra‑club, équilibre les terrains et respecte les pauses. Planning reproductible et partageable.</p>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={iconCircle('linear-gradient(180deg,#3b82f6,#2563eb)')}>↻</div>
              <h3 style={{ margin: 0 }}>Exports & partage</h3>
            </div>
            <p style={{ margin: 0, color: '#475569' }}>Export CSV / Impression, lien public, QR code et envoi par email pour diffuser ton plateau en un clic.</p>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={iconCircle('linear-gradient(180deg,#f97316,#ea580c)')}>★</div>
              <h3 style={{ margin: 0 }}>Gratuit puis Premium</h3>
            </div>
            <p style={{ margin: 0, color: '#475569' }}>Crée un planning gratuit pour ta prochaine date. Passe en Premium pour en gérer plusieurs toute la saison.</p>
          </div>
        </div>
      </section>

      {/* MOCKUP / ILLUSTRATION */}
      <section style={{ padding: '0 16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: 'white',
            boxShadow: '0 30px 60px rgba(2,6,23,0.08)'
          }}>
            <div style={{ display: 'flex', gap: 0 }}>
              <div style={{ flex: 1, padding: 18 }}>
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Aperçu planning</h4>
                <p style={{ marginTop: 0, color: '#64748b' }}>Heures, terrains, équipes, pauses… exactement comme vos feuilles de match.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>10:{String(10 + i).padStart(2, '0')}</div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>Terrain {((i % 3) + 1)}</div>
                      <div style={{ fontSize: 12, marginTop: 6, display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#22c55e', display: 'inline-block' }} />
                          US Flinois 1
                        </div>
                        <div style={{ opacity: 0.6, textAlign: 'center' }}>vs</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#3b82f6', display: 'inline-block' }} />
                          RC Lens 1
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ width: 320, padding: 18, borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Créer un planning</h4>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
                  <li>Coller la liste des équipes</li>
                  <li>Renseigner terrains & horaires</li>
                  <li>Générer le planning</li>
                  <li>Partager le lien ou le QR</li>
                </ul>
                <div style={{ marginTop: 12 }}>
                  {me ? (
                    <Link to="/plannings/new" style={primaryBtn}>Nouveau planning</Link>
                  ) : (
                    <Link to="/auth" style={secondaryBtn}>Commencer</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer style={footer}>
        © {new Date().getFullYear()} izifoot — Fait avec ❤ pour les éducateurs
      </footer>
    </div>
  );
}