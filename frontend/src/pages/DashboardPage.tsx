import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import DonorDashboard from './DonorDashboard'
import BidderDashboard from './BidderDashboard'
import CharityDashboard from './CharityDashboard'

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
  if (user.roles.includes('admin')) return <Navigate to="/admin" replace />
  if (user.roles.includes('donor')) return <DonorDashboard />
  if (user.roles.includes('charity') || user.roles.includes('charity_staff')) return <CharityDashboard />
  if (user.roles.includes('bidder')) return <BidderDashboard />

  return (
    <div className="container mx-auto px-4 py-12 text-center">
      <p style={{ color: '#5C6E6E' }}>No dashboard available for your account type.</p>
    </div>
  )
}
