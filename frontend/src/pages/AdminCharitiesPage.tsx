import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Building2, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import api from '../services/api'
import type { CharityOrganisation, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2',
  warning: '#92400E', warningLight: '#FFFBEB',
}

const statusBadge = (status: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    approved: { bg: '#ECFDF5', text: '#047857' },
    rejected: { bg: '#FEE2E2', text: '#991B1B' },
  }
  const s = colors[status] || colors.pending
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.text }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function AdminCharitiesPage() {
  const [charities, setCharities] = useState<CharityOrganisation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectUuid, setRejectUuid] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionUuid, setActionUuid] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<CharityOrganisation[]>('/charities')
        if (!cancelled) setCharities(res.data)
      } catch (err) {
        if (!cancelled) setError((err as ApiError).message || 'Failed to load charities.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleApprove = async (uuid: string) => {
    setActionUuid(uuid)
    try {
      await api.post(`/charities/${uuid}/review`, { decision: 'approved' })
      await load()
    } catch (err) {
      setError((err as ApiError).message || 'Failed to approve charity.')
    } finally {
      setActionUuid(null)
    }
  }

  const handleReject = async (uuid: string) => {
    if (!rejectReason.trim()) return
    setActionUuid(uuid)
    try {
      await api.post(`/charities/${uuid}/review`, { decision: 'rejected', reason: rejectReason })
      setRejectUuid(null)
      setRejectReason('')
      await load()
    } catch (err) {
      setError((err as ApiError).message || 'Failed to reject charity.')
    } finally {
      setActionUuid(null)
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

        <h1 className="text-2xl font-bold mb-6" style={{ color: C.slate }}>Charity Approvals</h1>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {charities.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: '1px solid', borderColor: C.beige }}>
            <Building2 className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
            <p style={{ color: C.muted }}>No charity registrations found.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Organisation</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Description</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Status</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {charities.map((c) => (
                    <tr key={c.uuid} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{c.organisationName}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{c.documentName}</p>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell" style={{ color: C.muted }}>
                        <p className="truncate max-w-xs">{c.description}</p>
                      </td>
                      <td className="px-6 py-4">{statusBadge(c.status)}</td>
                      <td className="px-6 py-4 text-right">
                        {c.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            {rejectUuid === c.uuid ? (
                              <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleReject(c.uuid) }}
                                className="flex items-center gap-2">
                                <input
                                  type="text" value={rejectReason} autoFocus
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Rejection reason..."
                                  className="w-40 px-2 py-1 text-xs rounded-lg outline-none"
                                  style={{ border: '1px solid', borderColor: C.danger, background: C.dangerLight }}
                                />
                                <button type="submit" disabled={!rejectReason.trim() || actionUuid === c.uuid}
                                  className="px-2 py-1 text-xs font-bold rounded-lg text-white"
                                  style={{ background: actionUuid === c.uuid ? C.muted : C.danger }}>
                                  {actionUuid === c.uuid ? '...' : 'Confirm'}
                                </button>
                                <button type="button" onClick={() => { setRejectUuid(null); setRejectReason('') }}
                                  className="px-2 py-1 text-xs rounded-lg" style={{ color: C.muted }}>
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <>
                                <button onClick={() => handleApprove(c.uuid)} disabled={actionUuid === c.uuid}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                  style={{ background: C.emerald }}>
                                  {actionUuid === c.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                  Approve
                                </button>
                                <button onClick={() => setRejectUuid(c.uuid)} disabled={actionUuid !== null}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                  style={{ background: C.danger }}>
                                  <XCircle className="w-3 h-3" /> Reject
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: C.muted }}>
                            {c.reviewedAt ? new Date(c.reviewedAt).toLocaleDateString() : ''}
                          </span>
                        )}
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
