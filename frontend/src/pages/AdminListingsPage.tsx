import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Loader2, AlertCircle, CheckCircle, ExternalLink, XCircle } from 'lucide-react'
import api from '../services/api'
import type { Listing, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AdminListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [rejectUuid, setRejectUuid] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<Listing[]>('/listings/admin/pending')
        if (!cancelled) setListings(res.data)
      } catch (err) {
        if (!cancelled) setError((err as ApiError).message || 'Failed to load pending listings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleApprove = async (uuid: string) => {
    setApproving(uuid)
    try {
      await api.post(`/listings/${uuid}/approve`)
      setListings(prev => prev.filter(l => l.uuid !== uuid))
    } catch (err) {
      setError((err as ApiError).message || 'Failed to approve listing.')
    } finally {
      setApproving(null)
    }
  }

  const handleReject = async (uuid: string) => {
    if (!rejectReason.trim()) return
    setRejecting(uuid)
    try {
      await api.post(`/listings/${uuid}/reject`, { reason: rejectReason })
      setListings(prev => prev.filter(l => l.uuid !== uuid))
      setRejectUuid(null)
      setRejectReason('')
    } catch (err) {
      setError((err as ApiError).message || 'Failed to reject listing.')
    } finally {
      setRejecting(null)
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

        <h1 className="text-2xl font-bold mb-6" style={{ color: C.slate }}>Listing Approvals</h1>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: '1px solid', borderColor: C.beige }}>
            <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
            <p style={{ color: C.muted }}>No pending listings to review.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Title</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Category</th>
                    <th className="text-right px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Starting Price</th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell" style={{ color: C.muted }}>Charity</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.uuid} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                          {new Date(l.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell" style={{ color: C.muted }}>{l.category}</td>
                      <td className="px-6 py-4 text-right hidden md:table-cell font-medium" style={{ color: C.slate }}>{money(l.starting_price)}</td>
                      <td className="px-6 py-4 hidden lg:table-cell" style={{ color: C.muted }}>{l.charityName}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/auctions/${l.uuid}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-opacity hover:opacity-80"
                            style={{ color: C.emerald, border: '1px solid', borderColor: C.emerald }}>
                            <ExternalLink className="w-3 h-3" /> View
                          </Link>
                          {rejectUuid === l.uuid ? (
                            <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleReject(l.uuid!) }}
                              className="flex items-center gap-2">
                              <input
                                type="text" value={rejectReason} autoFocus
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Rejection reason..."
                                className="w-36 px-2 py-1 text-xs rounded-lg outline-none"
                                style={{ border: '1px solid', borderColor: C.danger, background: C.dangerLight }}
                              />
                              <button type="submit" disabled={!rejectReason.trim() || rejecting === l.uuid}
                                className="px-2 py-1 text-xs font-bold rounded-lg text-white"
                                style={{ background: rejecting === l.uuid ? C.muted : C.danger }}>
                                {rejecting === l.uuid ? '...' : 'Confirm'}
                              </button>
                              <button type="button" onClick={() => { setRejectUuid(null); setRejectReason('') }}
                                className="px-2 py-1 text-xs rounded-lg" style={{ color: C.muted }}>
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <button onClick={() => handleApprove(l.uuid!)} disabled={approving === l.uuid || rejecting !== null}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                style={{ background: C.emerald }}>
                                {approving === l.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                {approving === l.uuid ? 'Approving...' : 'Approve'}
                              </button>
                              <button onClick={() => setRejectUuid(l.uuid!)} disabled={approving !== null}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                style={{ background: C.danger }}>
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
