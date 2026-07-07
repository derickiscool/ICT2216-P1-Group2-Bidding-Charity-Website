import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Package, TrendingUp, Clock, CheckCircle, Plus, Loader2, AlertCircle, Truck } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { Listing, DonorStats, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusBadge = (status: string) => {
  const colors = new Map<string, { bg: string; text: string }>([
    ['draft', { bg: '#F3F4F6', text: '#6B7280' }],
    ['pending', { bg: '#FEF3C7', text: '#92400E' }],
    ['active', { bg: '#ECFDF5', text: '#047857' }],
    ['sold', { bg: '#DBEAFE', text: '#1E40AF' }],
    ['expired', { bg: '#FEE2E2', text: '#991B1B' }],
    ['cancelled', { bg: '#FEE2E2', text: '#991B1B' }],
  ])
  const style = colors.get(status) ?? colors.get('draft')!
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: style.bg, color: style.text }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function DonorDashboard() {
  const { user } = useAuthStore()
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<DonorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shippingUuid, setShippingUuid] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [courier, setCourier] = useState('')
  const [shippingLoading, setShippingLoading] = useState<string | null>(null)
  const [shippingSuccess, setShippingSuccess] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ listings: Listing[]; stats: DonorStats }>('/listings/donor')
      setListings(res.data.listings)
      setStats(res.data.stats)
    } catch (err) {
      const ae = err as ApiError
      setError(ae.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => {}) }, [])

  const handleShipping = async (uuid: string) => {
    if (!trackingNumber.trim() || !courier.trim()) return
    setShippingLoading(uuid)
    try {
      await api.post(`/listings/${uuid}/shipping`, { tracking_number: trackingNumber, courier })
      setShippingUuid(null)
      setTrackingNumber('')
      setCourier('')
      setShippingSuccess('Shipping details submitted successfully.')
      setTimeout(() => setShippingSuccess(null), 3000)
      await load()
    } catch (err) {
      const msg = (err as ApiError).message || 'Failed to submit shipping details.'
      setError(msg)
      console.error('Shipping error:', msg)
    } finally {
      setShippingLoading(null)
    }
  }

  const shipReadyListings = listings.filter(l => l.status === 'sold' && l.can_ship)
  const unpaidListings = listings.filter(l => l.status === 'sold' && !l.payment_held && !l.has_shipped)
  const shippedListings = listings.filter(l => l.status === 'sold' && l.has_shipped)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.linen }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {shippingSuccess && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.emeraldLight, color: C.emerald }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{shippingSuccess}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Donor Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>Welcome back, {user?.full_name}</p>
          </div>
          <Link to="/listings/create"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: C.emerald }}
            onMouseEnter={e => (e.currentTarget.style.background = '#035c43')}
            onMouseLeave={e => (e.currentTarget.style.background = C.emerald)}>
            <Plus className="w-4 h-4" /> Donate an Item
          </Link>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                <Package className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.total ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Listings</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                <TrendingUp className="w-5 h-5" style={{ color: C.emerald }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.active ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Active Auctions</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#DBEAFE' }}>
                <CheckCircle className="w-5 h-5" style={{ color: '#1E40AF' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.sold ?? 0}</p>
            <p className="text-xs" style={{ color: C.muted }}>Sold Items</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                <Clock className="w-5 h-5" style={{ color: '#C2410C' }} />
              </div>
            </div>
            <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(stats?.totalRaised ?? 0)}</p>
            <p className="text-xs" style={{ color: C.muted }}>Total Raised</p>
          </div>
        </div>

        {/* Ready to ship */}
        {shipReadyListings.length > 0 && (
          <div className="rounded-2xl bg-white overflow-hidden mb-6" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.beige }}>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4" style={{ color: C.emerald }} />
                <h2 className="font-bold" style={{ color: C.slate }}>Ready to Ship</h2>
              </div>
            </div>
            {shipReadyListings.map((listing) => (
              <div key={listing.id} className="px-6 py-4 border-t" style={{ borderColor: C.beige }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sold for {money(listing.current_bid)}</p>
                  </div>
                </div>
                {shippingUuid === listing.uuid ? (
                  <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleShipping(listing.uuid!) }}
                    className="flex flex-col sm:flex-row gap-3">
                    <input type="text" value={trackingNumber} autoFocus required
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Tracking number"
                      className="flex-1 px-3 py-2 text-sm rounded-lg outline-none"
                      style={{ border: '1px solid', borderColor: C.beige }}
                    />
                    <input type="text" value={courier} required
                      onChange={(e) => setCourier(e.target.value)}
                      placeholder="Courier (e.g. DHL, FedEx)"
                      className="flex-1 px-3 py-2 text-sm rounded-lg outline-none"
                      style={{ border: '1px solid', borderColor: C.beige }}
                    />
                    <button type="submit" disabled={shippingLoading === listing.uuid || !trackingNumber.trim() || !courier.trim()}
                      className="px-4 py-2 text-sm font-bold text-white rounded-lg"
                      style={{ background: C.emerald }}>
                      {shippingLoading === listing.uuid ? 'Submitting...' : 'Submit'}
                    </button>
                    <button type="button" onClick={() => { setShippingUuid(null); setTrackingNumber(''); setCourier('') }}
                      className="px-4 py-2 text-sm rounded-lg" style={{ color: C.muted }}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button onClick={() => setShippingUuid(listing.uuid!)}
                    className="px-4 py-2 text-sm font-bold text-white rounded-lg"
                    style={{ background: C.emerald }}>
                    Provide Tracking
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Awaiting buyer payment */}
        {unpaidListings.length > 0 && (
          <div className="rounded-2xl bg-white overflow-hidden mb-6" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.beige }}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: '#92400E' }} />
                <h2 className="font-bold" style={{ color: C.slate }}>Awaiting Buyer Payment</h2>
              </div>
            </div>
            {unpaidListings.map((listing) => (
              <div key={listing.id} className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: C.beige }}>
                <div>
                  <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sold for {money(listing.current_bid)}</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>
                  Awaiting Payment
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Shipped items */}
        {shippedListings.length > 0 && (
          <div className="rounded-2xl bg-white overflow-hidden mb-6" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.beige }}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" style={{ color: C.emerald }} />
                <h2 className="font-bold" style={{ color: C.slate }}>Shipped</h2>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: C.beige }}>
              {shippedListings.map((listing) => (
                <div key={listing.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sold for {money(listing.current_bid)}</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.emeraldLight, color: C.emerald }}>
                    Shipped
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Listings table */}
        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
            <h2 className="font-bold" style={{ color: C.slate }}>My Listings</h2>
          </div>
          {listings.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
              <p style={{ color: C.muted }}>You haven't created any listings yet.</p>
              <Link to="/listings/create" className="inline-block mt-3 text-sm font-semibold" style={{ color: C.emerald }}>
                Donate an Item →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Title</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Status</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Current Bid</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Bids</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Ends</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr key={listing.id} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{listing.category}</p>
                      </td>
                      <td className="px-6 py-4">{statusBadge(listing.status)}</td>
                      <td className="px-6 py-4 text-right font-medium" style={{ color: C.slate }}>{money(listing.current_bid)}</td>
                      <td className="px-6 py-4 text-right" style={{ color: C.muted }}>{listing.bid_count}</td>
                      <td className="px-6 py-4 text-right text-xs" style={{ color: C.muted }}>
                        {new Date(listing.end_time).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {listing.status === 'pending' ? (
                          <span className="text-xs" style={{ color: C.muted }}>Pending review</span>
                        ) : listing.status === 'draft' ? (
                          <span className="text-xs" style={{ color: C.muted }}>Draft</span>
                        ) : (
                          <Link to={`/auctions/${listing.uuid}`}
                            className="text-xs font-semibold" style={{ color: C.emerald }}>
                            View →
                          </Link>
                        )}
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
