import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, TrendingUp, Package, Loader2, AlertCircle, Info } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { Listing, CharityStats, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusBadge = (status: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#F3F4F6', text: '#6B7280' },
    pending: { bg: '#FEF3C7', text: '#92400E' },
    active: { bg: '#ECFDF5', text: '#047857' },
    sold: { bg: '#DBEAFE', text: '#1E40AF' },
    expired: { bg: '#FEE2E2', text: '#991B1B' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  }
  const style = colors[status] || colors.draft
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: style.bg, color: style.text }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function CharityDashboard() {
  const { user } = useAuthStore()
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<CharityStats | null>(null)
  const [notRegistered, setNotRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<{ charity: Record<string, unknown> | null; listings: Listing[]; stats: CharityStats }>('/charities/dashboard')
        if (!res.data.charity) setNotRegistered(true)
        setListings(res.data.listings)
        setStats(res.data.stats)
      } catch (err) {
        const ae = err as ApiError
        setError(ae.message || 'Failed to load charity dashboard.')
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

  // Show message if the charity org hasn't been registered yet
  if (notRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center max-w-md mx-auto p-8">
          <Info className="w-12 h-12 mx-auto mb-4" style={{ color: '#92400E' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>No Charity Organisation Registered</h2>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            Your account hasn't been linked to a charity organisation yet.
            Register your charity first to start viewing donations and auction items.
          </p>
          <Link to="/register/charity"
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.emerald }}>
            Register Charity →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.linen }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Charity Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Welcome back, {user?.full_name}</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Package className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalItems ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Items</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                <TrendingUp className="w-5 h-5" style={{ color: C.emerald }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.activeItems ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Active Auctions</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                <Building2 className="w-5 h-5" style={{ color: '#C2410C' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(stats?.totalRaised ?? 0)}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Raised</p>
          </div>
        </div>

        {/* Charity listings */}
        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
            <h2 className="font-bold" style={{ color: C.slate }}>Auction Items</h2>
          </div>
          {listings.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
              <p style={{ color: C.muted }}>No auction items yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Title</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Donor</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Status</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Current Bid</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr key={listing.id} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                      </td>
                      <td className="px-6 py-4" style={{ color: C.muted }}>{listing.donor_id}</td>
                      <td className="px-6 py-4">{statusBadge(listing.status)}</td>
                      <td className="px-6 py-4 text-right font-medium" style={{ color: C.slate }}>{money(listing.current_bid)}</td>
                      <td className="px-6 py-4 text-right text-xs" style={{ color: C.muted }}>
                        {new Date(listing.end_time).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
