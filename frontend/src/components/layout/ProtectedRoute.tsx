import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types'

function AuthLoading() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: '#F7F5F0' }}>
      <div className="text-sm font-medium" style={{ color: '#5C6E6E' }}>Checking your session…</div>
    </div>
  )
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Staff accounts with temporary passwords may authenticate, but they must not
  // continue into normal dashboards/API workflows until they choose a new password.
  if (user?.mustChangePassword && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />
  }

  return <Outlet />
}

interface RoleProtectedRouteProps {
  allowedRoles: UserRole[]
}

export function RoleProtectedRoute({ allowedRoles }: RoleProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (user?.mustChangePassword && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />
  }

  const hasRequiredRole = user?.roles?.some((r) => allowedRoles.includes(r))
  if (!hasRequiredRole) return <Navigate to="/" replace />

  return <Outlet />
}
