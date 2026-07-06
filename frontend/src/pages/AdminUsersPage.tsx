import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import api from '../services/api'
import type { User, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2',
}

const roleBadge = (role: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    admin: { bg: '#FEE2E2', text: '#991B1B' },
    donor: { bg: '#DBEAFE', text: '#1E40AF' },
    bidder: { bg: '#ECFDF5', text: '#047857' },
    charity: { bg: '#FEF3C7', text: '#92400E' },
    charity_staff: { bg: '#F3E8FF', text: '#6B21A8' },
  }
  const s = colors[role] || { bg: '#F3F4F6', text: '#6B7280' }
  return (
    <span key={role} className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>
      {role.replace('_', ' ')}
    </span>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<User[]>('/admin/users')
      setUsers(res.data)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => {}) }, [])

  const handleToggle = async (uuid: string, currentlyActive: boolean) => {
    setToggling(uuid)
    try {
      await api.patch(`/admin/users/${uuid}/status`, { is_active: !currentlyActive })
      setUsers(prev => prev.map(u => u.uuid === uuid ? { ...u, is_active: !currentlyActive } : u))
    } catch (err) {
      setError((err as ApiError).message || 'Failed to update user status.')
    } finally {
      setToggling(null)
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

        <h1 className="text-2xl font-bold mb-6" style={{ color: C.slate }}>User Management</h1>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl mb-6" style={{ background: C.dangerLight, color: C.danger }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {users.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: '1px solid', borderColor: C.beige }}>
            <Users className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
            <p style={{ color: C.muted }}>No users found.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: C.linen }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Name</th>
                    <th className="text-left px-6 py-3 font-semibold hidden md:table-cell" style={{ color: C.muted }}>Email</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Roles</th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: C.muted }}>Status</th>
                    <th className="text-right px-6 py-3 font-semibold" style={{ color: C.muted }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uuid} className="border-t" style={{ borderColor: C.beige }}>
                      <td className="px-6 py-4">
                        <p className="font-medium" style={{ color: C.slate }}>{u.full_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.muted }}>@{u.username}</p>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell" style={{ color: C.muted }}>{u.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">{u.roles.map(roleBadge)}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.is_active ? (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.emeraldLight, color: C.emerald }}>
                            Active
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.dangerLight, color: C.danger }}>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggle(u.uuid!, u.is_active)}
                          disabled={toggling === u.uuid}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50 ml-auto"
                          style={{ background: u.is_active ? C.danger : C.emerald }}
                        >
                          {toggling === u.uuid ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : u.is_active ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {toggling === u.uuid ? '...' : u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
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
