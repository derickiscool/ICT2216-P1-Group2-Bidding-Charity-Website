import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ScrollText, Loader2, AlertCircle } from 'lucide-react'
import api from '../services/api'
import type { AuditEvent, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2',
}

export default function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<AuditEvent[]>('/admin/audit-events')
        setEvents(res.data)
      } catch (err) {
        setError((err as ApiError).message || 'Failed to load audit log.')
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

  return (
    <div className="min-h-screen" style={{ background: C.linen }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-6" style={{ color: C.emerald }}>
          <ArrowLeft className="w-4 h-4" /> Back to Admin Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6" style={{ color: C.slate }}>Audit Log</h1>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {events.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: '1px solid', borderColor: C.beige }}>
            <ScrollText className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
            <p style={{ color: C.muted }}>No audit events recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Timestamp</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Action</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Resource</th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell" style={{ color: C.muted }}>Details</th>
                    <th className="text-left px-6 py-3 font-semibold hidden lg:table-cell" style={{ color: C.muted }}>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...events].reverse().map((e: AuditEvent) => (
                    <tr key={e.id} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4 whitespace-nowrap" style={{ color: C.muted }}>
                        <span className="text-xs">{new Date(e.timestamp).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: C.linen, color: C.slate }}>
                          {e.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell" style={{ color: C.muted }}>
                        <span className="text-xs">
                          {e.resourceType ? `${e.resourceType}${e.resourceId ? ` / ${e.resourceId.slice(0, 8)}` : ''}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell" style={{ color: C.muted }}>
                        <span className="text-xs truncate max-w-[200px] block">
                          {Object.keys(e.payload).length > 0 ? JSON.stringify(e.payload).slice(0, 80) : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell" style={{ color: C.muted }}>
                        <span className="text-xs">{e.actorUserId ? `#${e.actorUserId}` : '-'}</span>
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
