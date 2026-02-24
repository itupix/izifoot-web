// src/App.tsx
import React from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AccountPage from './pages/AccountPage';
import PlanningsListPage from './pages/PlanningsListPage';
import PlanningDetailPage from './pages/PlanningDetailsPage';
import CreatePlanningPage from './pages/CreatePlanningPage';
import Home from './pages/Home';
import { useAuth } from './useAuth';
import style from './App.module.css'
import TrainingsPage from './pages/TrainingsPage';
import TrainingDetailsPage from './pages/TrainingDetailsPage';
import PlateauDetailsPage from './pages/PlateauDetailsPage';
import DrillsPage from './pages/Drills';
import PlayersPage from './pages/PlayersPage';
import DiagramEditor from './pages/DiagramEditor';
import StatsPage from './pages/Stats';
import MatchDay from './pages/MatchDay';
import { MenuIcon } from './components/icons';

function Protected({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>;
  if (!me) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { me, logout } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const headerHeight = 64;
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };
  return (
    <>
      {!isHome && (
        <>
          <header
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: headerHeight,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 12px',
              background: '#fff',
              borderBottom: '1px solid #e2e8f0',
              zIndex: 50,
            }}
          >
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 999,
                background: '#fff',
                width: 44,
                height: 44,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <MenuIcon size={24} />
            </button>
            <Link
              to="/planning"
              className={style.logo}
              style={{ textDecoration: 'none', fontWeight: 800, fontSize: 34, lineHeight: 1 }}
            >
              izifoot
            </Link>
          </header>
          {menuOpen && (
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 40 }}
            />
          )}
          <aside
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              padding: 16,
              background: '#fff',
              borderRight: '1px solid #e2e8f0',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
              transform: menuOpen ? 'translateX(0)' : 'translateX(-110%)',
              transition: 'transform 200ms ease',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setMenuOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>✕</button>
            </div>
            <nav style={{ display: 'grid', gap: 8 }}>
              <Link to="/planning" onClick={() => setMenuOpen(false)}>Planning</Link>
              <Link to="/exercices" onClick={() => setMenuOpen(false)}>Exercices</Link>
              <Link to="/effectif" onClick={() => setMenuOpen(false)}>Effectif</Link>
              <Link to="/stats" onClick={() => setMenuOpen(false)}>Stats</Link>
            </nav>
            <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
              <Link to="/plannings/new" onClick={() => setMenuOpen(false)} style={{ fontWeight: 600, textDecoration: 'none' }}>
                Organiser un plateau
              </Link>
              {me ? (
                <button onClick={handleLogout}>Se déconnecter</button>
              ) : null}
            </div>
          </aside>
        </>
      )}

      <main style={isHome ? { padding: 0 } : { padding: 16, paddingTop: headerHeight + 16 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Protected><AccountPage /></Protected>} />
          <Route path="/planning" element={<Protected><TrainingsPage /></Protected>} />
          <Route path="/training/:id" element={<Protected><TrainingDetailsPage /></Protected>} />
          <Route path="/plateau/:id" element={<Protected><PlateauDetailsPage /></Protected>} />
          <Route path="/exercices" element={<Protected><DrillsPage /></Protected>} />
          <Route path="/exercices/:id" element={<Protected><DrillsPage /></Protected>} />
          <Route path="/diagram-editor" element={<Protected><DiagramEditor /></Protected>} />
          <Route path="/effectif" element={<Protected><PlayersPage /></Protected>} />
          <Route path="/plannings" element={<Protected><PlanningsListPage /></Protected>} />
          <Route path="/plannings/new" element={<Protected><CreatePlanningPage /></Protected>} />
          <Route path="/plannings/:id" element={<Protected><PlanningDetailPage /></Protected>} />
          <Route path="/stats" element={<Protected><StatsPage /></Protected>} />
          <Route path="/match-day/:id" element={<Protected><MatchDay /></Protected>} />
          <Route path="*" element={<Navigate to={me ? "/planning" : "/"} replace />} />
        </Routes>
      </main>
    </>
  );
}
