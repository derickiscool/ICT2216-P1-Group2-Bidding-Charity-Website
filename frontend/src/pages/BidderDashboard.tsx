import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, DollarSign, Target, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { AutoBid, Bid, BidderStats, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BidderDashboard() {
  const { user } = useAuthStore()
  const [bids, setBids] = useState<Bid[]>([])
  const [autoBids, setAutoBids] = useState<AutoBid[]>([])
  const [stats, setStats] = useState<BidderStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [bidRes, autoBidRes] = await Promise.all([
          api.get<{ bids: Bid[]; stats: BidderStats }>('/bids/bidder'),
          api.get<AutoBid[]>('/bids/auto-bids'),
        ])
        setBids(bidRes.data.bids)
        setStats(bidRes.data.stats)
        setAutoBids(autoBidRes.data)
      } catch (err) {
        const ae = err as ApiError
        setError(ae.message || 'Failed to load dashboard.')
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
          <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Bidder Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Welcome back, {user?.full_name}</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                <Gavel className="w-5 h-5" style={{ color: C.emerald }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.total ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Bids Placed</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Target className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.uniqueListings ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Unique Auctions</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                <DollarSign className="w-5 h-5" style={{ color: '#C2410C' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(stats?.totalSpent ?? 0)}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Spent</p>
          </div>
        </div>


        {/* Auto-bid settings */}
        <div className="rounded-2xl bg-white overflow-hidden mb-8" style={{ border: '1px solid', borderColor: C.beige }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
            <h2 className="font-bold" style={{ color: C.slate }}>Auto-Bid Settings</h2>
            <p className="text-xs mt-1" style={{ color: C.muted }}>Your maximum amounts are shown only to you.</p>
          </div>
          {autoBids.filter(autoBid => autoBid.is_active).length === 0 ? (
            <div className="px-6 py-6 text-sm" style={{ color: C.muted }}>
              No active auto-bids yet. Open an auction listing to set one.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.beige }}>
              {autoBids.filter(autoBid => autoBid.is_active).map((autoBid) => (
                <div key={autoBid.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium" style={{ color: C.slate }}>
                        {autoBid.listingTitle || `Listing #${autoBid.listing_id}`}
                      </p>
                      {autoBid.listingUuid && (
                        <Link to={`/auctions/${autoBid.listingUuid}`} className="flex-shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" style={{ color: C.emerald }} />
                        </Link>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: C.muted }}>
                      Current bid: {money(autoBid.currentBid ?? 0)} · Status: {autoBid.listingStatus ?? 'active'}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-xs" style={{ color: C.muted }}>Private max</p>
                    <p className="font-bold" style={{ color: C.emerald }}>{money(autoBid.max_amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bid history */}
        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
            <h2 className="font-bold" style={{ color: C.slate }}>Bid History</h2>
          </div>
          {bids.length === 0 ? (
            <div className="p-12 text-center">
              <Gavel className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
              <p style={{ color: C.muted }}>You haven't placed any bids yet.</p>
              <Link to="/auctions" className="inline-block mt-3 text-sm font-semibold" style={{ color: C.emerald }}>
                Browse auctions →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Listing</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Your Bid</th>
                    <th className="text-center px-6 py-3 font-semibold" style={{ color: C.muted }}>Auto</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((bid) => (
                    <tr key={bid.id} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium" style={{ color: C.slate }}>
                            {bid.listingTitle || `Listing #${bid.listing_id}`}
                          </p>
                          {bid.listingUuid && (
                            <Link to={`/auctions/${bid.listingUuid}`} className="flex-shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" style={{ color: C.emerald }} />
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium" style={{ color: C.emerald }}>{money(bid.amount)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: bid.is_auto_bid ? '#EEF2FF' : '#F3F4F6', color: bid.is_auto_bid ? '#4F46E5' : '#6B7280' }}>
                          {bid.is_auto_bid ? 'Auto' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs" style={{ color: C.muted }}>
                        {new Date(bid.created_at).toLocaleDateString()}
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