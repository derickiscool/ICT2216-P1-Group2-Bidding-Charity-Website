import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types'
import { Loader2 } from 'lucide-react'

// ── Loading spinner ──────────────────────────────────────────────────────────
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F5F0' }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#047857' }} />
    </div>
  )
}

// ── Requires any logged-in user ──────────────────────────────────────────────
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

// ── Requires a specific role ─────────────────────────────────────────────────
interface RoleProtectedRouteProps {
  allowedRoles: UserRole[]
}

export function RoleProtectedRoute({ allowedRoles }: RoleProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore()

  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  const hasRequiredRole = user?.roles?.some((r) => allowedRoles.includes(r))
  if (!hasRequiredRole) return <Navigate to="/" replace />

  return <Outlet />
}
