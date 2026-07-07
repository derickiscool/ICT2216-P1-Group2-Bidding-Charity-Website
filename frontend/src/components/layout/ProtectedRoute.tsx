import { Navigate, Outlet, useLocation } from 'react-router-dom'
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

function ForcePasswordChangeRedirect({ path }: { path: string }) {
  if (path === '/change-password') return <Outlet />
  return <Navigate to="/change-password" replace />
}

// ── Requires any logged-in user ──────────────────────────────────────────────
export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()
  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Temporary-password staff sessions are intentionally restricted until the
  // first-login password change is completed. This mirrors the backend guard so
  // users get a clean page instead of repeated 403 responses. Tiny UX shield, big security win.
  if (user?.mustChangePassword) return <ForcePasswordChangeRedirect path={location.pathname} />

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

  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />

  const hasRequiredRole = user?.roles?.some((r) => allowedRoles.includes(r))
  if (!hasRequiredRole) return <Navigate to="/" replace />

  return <Outlet />
}
