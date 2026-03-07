// src/App.tsx
import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, Building2, CalendarRange, Dumbbell, Users } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import style from './App.module.css'
import { getDefaultRouteByRole, type AccountRole } from './authz'
import { CloseIcon, MenuIcon } from './components/icons'
import RoundIconButton from './components/RoundIconButton'
import { RequireAuth, RequireRole } from './components/RouteGuards'
import { useAuth } from './useAuth'
import { useTeamScope } from './useTeamScope'
import AccountPage from './pages/AccountPage'
import ClubManagementPage from './pages/ClubManagementPage'
import DiagramEditor from './pages/DiagramEditor'
import DrillDetailsPage from './pages/DrillDetailsPage'
import DrillsPage from './pages/Drills'
import Home from './pages/Home'
import MatchDay from './pages/MatchDay'
import PlateauDetailsPage from './pages/PlateauDetailsPage'
import PlayersPage from './pages/PlayersPage'
import PublicPlateauPage from './pages/PublicPlateauPage'
import StatsPage from './pages/Stats'
import TrainingDetailsPage from './pages/TrainingDetailsPage'
import TrainingsPage from './pages/TrainingsPage'
import InviteAcceptPage from './pages/InviteAcceptPage'

type NavItem = {
  to: string
  label: string
  roles: AccountRole[]
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/club', label: 'Club', roles: ['DIRECTION'], icon: Building2 },
  { to: '/planning', label: 'Planning', roles: ['DIRECTION', 'COACH', 'PLAYER', 'PARENT'], icon: CalendarRange },
  { to: '/exercices', label: 'Exercices', roles: ['DIRECTION', 'COACH'], icon: Dumbbell },
  { to: '/effectif', label: 'Effectif', roles: ['DIRECTION', 'COACH'], icon: Users },
  { to: '/stats', label: 'Stats', roles: ['DIRECTION', 'COACH'], icon: BarChart3 },
]

function RoleAwareFallback() {
  const { me } = useAuth()
  return <Navigate to={me ? getDefaultRouteByRole(me.role) : '/'} replace />
}

export default function App() {
  const { me, logout } = useAuth()
  const { selectedTeamId, setSelectedTeamId, teamOptions, loading: teamLoading, canSelectTeam, requiresSelection } = useTeamScope()
  const location = useLocation()
  const navigate = useNavigate()
  const needsClubSetup = Boolean(me?.role === 'DIRECTION' && !teamLoading && !selectedTeamId)

  const isHome = location.pathname === '/'
  const isPublicPlateau = location.pathname.startsWith('/plateau/public/')
  const isInviteAccept = location.pathname.startsWith('/invite/accept')
  const showSidebarShell = !isHome && !isPublicPlateau && !isInviteAccept
  const [menuOpen, setMenuOpen] = React.useState(false)
  const headerHeight = 64
  const pageWidth = 980

  const isActivePath = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const navItems = React.useMemo(() => {
    if (!me) return [] as NavItem[]
    const roleItems = NAV_ITEMS.filter((item) => item.roles.includes(me.role))
    if (!needsClubSetup) return roleItems
    return roleItems.filter((item) => item.to === '/club')
  }, [me, needsClubSetup])

  React.useEffect(() => {
    if (!needsClubSetup) return
    if (location.pathname === '/club') return
    navigate('/club', { replace: true })
  }, [location.pathname, navigate, needsClubSetup])

  return (
    <>
      {!isHome && !isInviteAccept && (
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
            {showSidebarShell ? (
              <RoundIconButton ariaLabel="Ouvrir le menu" onClick={() => setMenuOpen(true)}>
                <MenuIcon size={18} />
              </RoundIconButton>
            ) : (
              <div style={{ width: 34, height: 34 }} />
            )}
            {showSidebarShell ? (
              <Link
                to={me ? getDefaultRouteByRole(me.role) : '/planning'}
                className={style.logo}
                style={{ textDecoration: 'none', fontWeight: 800, fontSize: 28, lineHeight: 1 }}
              >
                izifoot
              </Link>
            ) : (
              <span
                className={style.logo}
                style={{ textDecoration: 'none', fontWeight: 800, fontSize: 28, lineHeight: 1 }}
              >
                izifoot
              </span>
            )}
          </header>
          {showSidebarShell && menuOpen && (
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 40 }}
            />
          )}
          {showSidebarShell && (
            <aside
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 280,
                padding: 16,
                background: '#fff',
                borderRight: '1px solid #e2e8f0',
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
                transform: menuOpen ? 'translateX(0)' : 'translateX(-110%)',
                transition: 'transform 200ms ease',
                zIndex: 60,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <RoundIconButton ariaLabel="Fermer le menu" onClick={() => setMenuOpen(false)} style={{ color: '#334155' }}>
                  <CloseIcon size={16} />
                </RoundIconButton>
              </div>
              <nav className={style.sidebarNav}>
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={`${style.sidebarLink} ${isActivePath(item.to) ? style.sidebarLinkActive : ''}`.trim()}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </Link>
                ))}
              </nav>
              {canSelectTeam && (
                <div className={style.teamScopeBlock}>
                  <label htmlFor="team-scope-select" className={style.teamScopeLabel}>Équipe active</label>
                  <select
                    id="team-scope-select"
                    className={style.teamScopeSelect}
                    value={selectedTeamId || ''}
                    onChange={(e) => setSelectedTeamId(e.target.value || null)}
                    disabled={teamLoading}
                  >
                    {!requiresSelection && <option value="">Toutes les équipes</option>}
                    {teamOptions.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={style.sidebarFooter}>
                {me ? (
                  <button className={style.logoutButton} onClick={handleLogout}>
                    Se déconnecter
                  </button>
                ) : null}
              </div>
            </aside>
          )}
        </>
      )}

      <main
        style={
          isHome || isInviteAccept
            ? { padding: 0, display: 'flex', justifyContent: 'center' }
            : { padding: 16, paddingTop: headerHeight + 16, display: 'flex', justifyContent: 'center' }
        }
      >
        <div style={{ width: '100%', maxWidth: pageWidth }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/plateau/public/:token" element={<PublicPlateauPage />} />
            <Route path="/invite/accept" element={<InviteAcceptPage />} />

            <Route
              path="/account"
              element={
                <RequireAuth>
                  <AccountPage />
                </RequireAuth>
              }
            />

            <Route
              path="/club"
              element={
                <RequireRole roles={['DIRECTION']}>
                  <ClubManagementPage />
                </RequireRole>
              }
            />

            <Route
              path="/planning"
              element={
                <RequireAuth>
                  <TrainingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/training/:id"
              element={
                <RequireAuth>
                  <TrainingDetailsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/plateau/:id"
              element={
                <RequireAuth>
                  <PlateauDetailsPage />
                </RequireAuth>
              }
            />

            <Route
              path="/exercices"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <DrillsPage />
                </RequireRole>
              }
            />
            <Route
              path="/exercices/:id"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <DrillDetailsPage />
                </RequireRole>
              }
            />
            <Route
              path="/diagram-editor"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <DiagramEditor />
                </RequireRole>
              }
            />
            <Route
              path="/effectif"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <PlayersPage />
                </RequireRole>
              }
            />
            <Route
              path="/stats"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <StatsPage />
                </RequireRole>
              }
            />
            <Route
              path="/match-day/:id"
              element={
                <RequireRole roles={['DIRECTION', 'COACH']}>
                  <MatchDay />
                </RequireRole>
              }
            />

            <Route path="*" element={<RoleAwareFallback />} />
          </Routes>
        </div>
      </main>
    </>
  )
}
