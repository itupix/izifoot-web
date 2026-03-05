import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getDefaultRouteByRole, type AccountRole } from '../authz'
import { useAuth } from '../useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>
  if (!me) return <Navigate to="/" replace state={{ from: location }} />
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: AccountRole[]; children: ReactNode }) {
  const { me, role, loading } = useAuth()

  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>
  if (!me || !role) return <Navigate to="/" replace />
  if (!roles.includes(role)) return <Navigate to={getDefaultRouteByRole(role)} replace />
  return <>{children}</>
}
