import { useEffect, useState } from 'react'
import { Users, Package, Gavel, Building2, Clock, Loader2, AlertCircle } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { AdminStats, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', warning: '#92400E', warningLight: '#FFFBEB',
}

export default function AdminPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<AdminStats>('/admin/stats')
        setStats(res.data)
      } catch (err) {
        const ae = err as ApiError
        setError(ae.message || 'Failed to load admin stats.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.danger }} />
          <p style={{ color: C.danger }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.linen }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Admin Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Welcome, {user?.full_name}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Users className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalUsers ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Users</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                <Package className="w-5 h-5" style={{ color: C.emerald }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalListings ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Listings</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                <Gavel className="w-5 h-5" style={{ color: '#92400E' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalBids ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Bids</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                <Building2 className="w-5 h-5" style={{ color: '#C2410C' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.pendingCharities ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Pending Charities</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEE2E2' }}>
                <Clock className="w-5 h-5" style={{ color: '#B91C1C' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.pendingListings ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Pending Listings</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a href="/admin/charities"
            className="rounded-2xl p-6 bg-white block hover:shadow-md transition-shadow"
            style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Building2 className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            </div>
            <h3 className="font-bold" style={{ color: C.slate }}>Charity Approvals</h3>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              {stats?.pendingCharities ?? 0} charities pending review
            </p>
          </a>
          <a href="/listings/admin/pending"
            className="rounded-2xl p-6 bg-white block hover:shadow-md transition-shadow"
            style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                <Package className="w-5 h-5" style={{ color: C.emerald }} />
              </div>
            </div>
            <h3 className="font-bold" style={{ color: C.slate }}>Listing Approvals</h3>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              {stats?.pendingListings ?? 0} listings pending review
            </p>
          </a>
          <a href="/admin/audit-events"
            className="rounded-2xl p-6 bg-white block hover:shadow-md transition-shadow"
            style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                <Gavel className="w-5 h-5" style={{ color: '#92400E' }} />
              </div>
            </div>
            <h3 className="font-bold" style={{ color: C.slate }}>Audit Log</h3>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              View all security events
            </p>
          </a>
        </div>
      </div>
    </div>
  )
}
