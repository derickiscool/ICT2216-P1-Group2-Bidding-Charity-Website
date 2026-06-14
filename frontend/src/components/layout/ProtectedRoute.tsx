import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types'

// ── Requires any logged-in user ──────────────────────────────────────────────
export function ProtectedRoute() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

// ── Requires a specific role ─────────────────────────────────────────────────
interface RoleProtectedRouteProps {
  allowedRoles: UserRole[]
}

export function RoleProtectedRoute({ allowedRoles }: RoleProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const hasRequiredRole = user?.roles?.some((r) => allowedRoles.includes(r))
  if (!hasRequiredRole) return <Navigate to="/" replace />

  return <Outlet />
}
