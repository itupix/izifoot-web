// src/App.tsx
import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './pages/AuthPage'
import AccountPage from './pages/AccountPage';
import PlanningsListPage from './pages/PlanningsListPage';
import PlanningDetailPage from './pages/PlanningDetailsPage';
import CreatePlanningPage from './pages/CreatePlanningPage';
import Home from './pages/Home';
import { useAuth } from './useAuth';
import style from './App.module.css'

function Protected({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>;
  if (!me) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  const { me, logout } = useAuth();
  return (
    <>
      <header style={{ display: 'flex', gap: 16, padding: 12, borderBottom: '1px solid #ddd' }}>
        <Link to="/" className={style.logo} style={{ textDecoration: 'none', fontWeight: 700 }}>izifoot</Link>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/entrainements">Entrainements</Link>
          <Link to="/plannings">Plateaux</Link>
          {me ? <Link to="/account">Mon compte</Link> : <Link to="/auth">Login / Register</Link>}
        </nav>
        <div style={{ marginLeft: 'auto' }}>
          {me ? (
            <button onClick={logout}>Se déconnecter</button>
          ) : null}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<Protected><AccountPage /></Protected>} />
          <Route path="/plannings" element={<Protected><PlanningsListPage /></Protected>} />
          <Route path="/plannings/new" element={<Protected><CreatePlanningPage /></Protected>} />
          <Route path="/plannings/:id" element={<Protected><PlanningDetailPage /></Protected>} />
        </Routes>
      </main>
    </>
  );
}