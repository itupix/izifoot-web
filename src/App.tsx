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
import DrillsPage from './pages/Drills';
import PlayersPage from './pages/PlayersPage';
import DiagramEditor from './pages/DiagramEditor';
import StatsPage from './pages/Stats';
import MatchDay from './pages/MatchDay';

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
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };
  return (
    <>
      {!isHome && (
        <header style={{ display: 'flex', gap: 16, padding: 12, borderBottom: '1px solid #ddd' }}>
          <Link to="/planning" className={style.logo} style={{ textDecoration: 'none', fontWeight: 700 }}>izifoot</Link>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link to="/planning">Planning</Link>
            <Link to="/exercices">Exercices</Link>
            <Link to="/effectif">Effectif</Link>
            <Link to="/stats">Stats</Link>
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/plannings/new" style={{ fontWeight: 600, textDecoration: 'none' }}>Organiser un plateau</Link>
            {me ? (
              <button onClick={handleLogout}>Se déconnecter</button>
            ) : null}
          </div>
        </header>
      )}

      <main style={isHome ? { padding: 0 } : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Protected><AccountPage /></Protected>} />
          <Route path="/planning" element={<Protected><TrainingsPage /></Protected>} />
          <Route path="/exercices" element={<Protected><DrillsPage /></Protected>} />
          <Route path="/exercices/:id" element={<Protected><DrillsPage /></Protected>} />
          <Route path="/diagram-editor" element={<Protected><DiagramEditor /></Protected>} />
          <Route path="/effectif" element={<Protected><PlayersPage /></Protected>} />
          <Route path="/plannings" element={<Protected><PlanningsListPage /></Protected>} />
          <Route path="/plannings/new" element={<Protected><CreatePlanningPage /></Protected>} />
          <Route path="/plannings/:id" element={<Protected><PlanningDetailPage /></Protected>} />
          <Route path="/stats" element={<Protected><StatsPage /></Protected>} />
          <Route path="/match-day/:id" element={<Protected><MatchDay /></Protected>} />
        </Routes>
      </main>
    </>
  );
}
