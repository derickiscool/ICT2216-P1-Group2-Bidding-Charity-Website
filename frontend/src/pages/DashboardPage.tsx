import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import DonorDashboard from './DonorDashboard'
import BidderDashboard from './BidderDashboard'
import CharityDashboard from './CharityDashboard'

const C = {
  slate: '#2D3A3A', emerald: '#047857',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
}

export default function DashboardPage() {
  const { user } = useAuthStore()

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p>Please log in to view your dashboard.</p>
      </div>
    )
  }

  // Route to the correct dashboard based on user roles
  if (user.roles.includes('donor')) return <DonorDashboard />
  if (user.roles.includes('charity') || user.roles.includes('charity_staff')) return <CharityDashboard />
  if (user.roles.includes('bidder')) return <BidderDashboard />
  if (user.roles.includes('admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center max-w-md mx-auto p-8">
          <p className="text-lg font-bold mb-2" style={{ color: C.slate }}>Admin Dashboard</p>
          <p className="text-sm mb-6" style={{ color: C.muted }}>Admin dashboards are at the admin panel.</p>
          <Link to="/admin"
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.emerald }}>
            Go to Admin Panel →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 text-center">
      <p style={{ color: C.muted }}>No dashboard available for your account type.</p>
    </div>
  )
}
