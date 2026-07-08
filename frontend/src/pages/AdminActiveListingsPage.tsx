import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, AlertCircle, ExternalLink, Gavel, CheckCircle, X } from 'lucide-react'
import api from '../services/api'
import type { Listing, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const timeLeft = (endTime: string): string => {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

export default function AdminActiveListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<{ uuid: string; title: string } | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: Listing[] }>('/listings')
      setListings(res.data.data.filter(l => l.status === 'active'))
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load active listings.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [])

  const handleForceClose = async (uuid: string, title: string) => {
    setClosing(uuid)
    try {
      await api.post(`/listings/${uuid}/force-close`)
      setListings(prev => prev.filter(l => l.uuid !== uuid))
      setConfirmClose(null)
      setSuccess(`"${title}" closed successfully`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to close listing.')
    } finally {
      setClosing(null)
    }
  }

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
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-6" style={{ color: C.emerald }}>
          <ArrowLeft className="w-4 h-4" /> Back to Admin Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6" style={{ color: C.slate }}>Active Auctions</h1>

        {success && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.emeraldLight, color: C.emerald }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{success}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: '1px solid', borderColor: C.beige }}>
            <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
            <p style={{ color: C.muted }}>No active auctions running.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Title</th>
                    <th className="text-right px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Current Bid</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Ends In</th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell" style={{ color: C.muted }}>Charity</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.uuid} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{l.bid_count} bid{l.bid_count !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-6 py-4 text-right hidden md:table-cell font-medium" style={{ color: C.slate }}>{money(l.current_bid)}</td>
                      <td className="px-6 py-4 hidden md:table-cell" style={{ color: C.muted }}>
                        <span className="text-xs">{timeLeft(l.end_time)}</span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell" style={{ color: C.muted }}>{l.charityName}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/auctions/${l.uuid}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-opacity hover:opacity-80"
                            style={{ color: C.emerald, border: '1px solid', borderColor: C.emerald }}>
                            <ExternalLink className="w-3 h-3" /> View
                          </Link>
                          <button onClick={() => setConfirmClose({ uuid: l.uuid!, title: l.title })} disabled={closing === l.uuid}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            style={{ background: C.danger }}>
                            {closing === l.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gavel className="w-3 h-3" />}
                            {closing === l.uuid ? 'Closing...' : 'Force Close'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Admin-only confirmation: the backend route is protected by requireRole('admin'),
            but the UI still asks for confirmation because force close immediately ends
            an active auction and creates/updates payment deadline state. */}
        {confirmClose && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setConfirmClose(null)}>
            <div className="rounded-2xl bg-white w-full max-w-md mx-4 overflow-hidden shadow-xl"
              style={{ border: '1px solid', borderColor: C.beige }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
                <div>
                  <h2 className="font-black text-base" style={{ color: C.slate }}>Confirm Close Auction</h2>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>Admin action required</p>
                </div>
                <button type="button" onClick={() => setConfirmClose(null)} aria-label="Close confirmation">
                  <X className="w-5 h-5" style={{ color: C.muted }} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-3">
                <p className="text-sm" style={{ color: C.slate }}>
                  Are you sure you want to close <strong>{confirmClose.title}</strong>?
                </p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                  This ends the auction immediately. If there is a valid highest bid, the winner receives a payment deadline. If there are no bids, the auction expires.
                </p>
              </div>

              <div className="px-6 pb-5 flex gap-3">
                <button type="button" onClick={() => setConfirmClose(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                  style={{ border: '1px solid', borderColor: C.beige, color: C.slate }}>
                  Cancel
                </button>
                <button type="button" onClick={() => handleForceClose(confirmClose.uuid, confirmClose.title)}
                  disabled={closing === confirmClose.uuid}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: C.danger }}>
                  {closing === confirmClose.uuid ? 'Closing…' : 'Confirm Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}