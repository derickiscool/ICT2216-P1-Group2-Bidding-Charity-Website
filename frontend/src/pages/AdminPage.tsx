import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  Users, Package, Gavel, Building2, Clock, Loader2, AlertCircle,
  RefreshCw, ScrollText, ShieldCheck, Activity, TrendingUp, ExternalLink,
} from 'lucide-react'
import api from '../services/api'
import type { AdminStats, ApiError, AuditEvent, User, UserRole, CharityOrganisation, Listing } from '../types'

const hasUserFacingUsername = (user: User): boolean => user.roles.some(role => role === 'bidder' || role === 'donor')

const roleBadge = (role: string) => {
  const colors = new Map<string, { bg: string; text: string }>([
    ['admin', { bg: '#FEE2E2', text: '#991B1B' }],
    ['donor', { bg: '#DBEAFE', text: '#1E40AF' }],
    ['bidder', { bg: '#ECFDF5', text: '#047857' }],
    ['charity', { bg: '#FEF3C7', text: '#92400E' }],
    ['charity_staff', { bg: '#F3E8FF', text: '#6B21A8' }],
  ])
  const s = colors.get(role) ?? { bg: '#F3F4F6', text: '#6B7280' }
  return (
    <span key={role} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>
      {role.replace('_', ' ')}
    </span>
  )
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type Tab = 'overview' | 'users' | 'charities' | 'listings' | 'audit'

interface TabNavItem {
  id: Tab
  label: string
  icon: React.ReactNode
  badge?: number
}

const PAGE_SIZE = 15

const adminListingStatusLabel = (status: Listing['status']) => {
  const labels: Partial<Record<Listing['status'], string>> = {
    charity_review: 'Charity Review',
    changes_requested: 'Changes Requested',
  }
  return labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
}

// ─── Pagination bar ──────────────────────────────────────────────────────────

function PaginationBar({ page, totalPages, totalItems, onPageChange }: {
  page: number; totalPages: number; totalItems: number; onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: C.beige }}>
      <span className="text-xs" style={{ color: C.muted }}>
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalItems)} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-opacity"
          style={{ border: `1px solid ${C.beige}`, color: page === 0 ? C.muted : C.slate }}>
          Previous
        </button>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-opacity"
          style={{ border: `1px solid ${C.beige}`, color: page >= totalPages - 1 ? C.muted : C.slate }}>
          Next
        </button>
      </div>
    </div>
  )
}

// ─── Rejection modal ──────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onClose, label }: {
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
  label?: string
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="rounded-2xl bg-white w-full max-w-md mx-4 overflow-hidden shadow-xl"
        style={{ border: `1px solid ${C.beige}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
          <h2 className="font-black text-base" style={{ color: C.slate }}>Rejection Reason</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: C.muted }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm" style={{ color: C.muted }}>
            Please provide a reason for rejecting this {label || 'item'}. This will be visible to the submitter.
          </p>
          <textarea value={reason} autoFocus rows={4}
            onChange={e => setReason(e.target.value)}
            placeholder="Enter rejection reason..."
            className="w-full px-3 py-2 text-sm rounded-xl outline-none resize-none"
            style={{ border: `1px solid ${C.beige}`, background: C.linen, color: C.slate }} />
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
            Cancel
          </button>
          <button onClick={async () => { setLoading(true); try { await onConfirm(reason) } finally { setLoading(false) } }}
            disabled={!reason.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: C.danger }}>
            {loading ? 'Rejecting…' : 'Confirm Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

const relativeTime = (timestamp: string): string => {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ tabs, activeTab, onTabChange }: {
  tabs: TabNavItem[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}) {
  return (
    <aside className="w-60 flex-shrink-0 hidden md:block self-start sticky top-16 h-[calc(100vh-64px)] overflow-y-auto"
      style={{ background: '#fff', borderRight: `1px solid ${C.beige}` }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: C.beige }}>
        <h2 className="font-black text-sm uppercase tracking-widest" style={{ color: C.slate }}>Admin Dashboard</h2>
      </div>
      <nav className="p-2 space-y-1">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab
          return (
            <button key={tab.id} onClick={() => onTabChange(tab.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: isActive ? C.emeraldLight : 'transparent',
                color: isActive ? C.emerald : C.muted,
              }}>
              <span className="w-5 h-5 flex items-center justify-center">{tab.icon}</span>
              <span className="flex-1 text-left">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: isActive ? C.emerald : C.linen, color: isActive ? '#fff' : C.slate }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Data
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [charities, setCharities] = useState<CharityOrganisation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [charityFilter, setCharityFilter] = useState<string>('all')
  const [listingsData, setListingsData] = useState<Listing[]>([])
  const [listingsFilter, setListingsFilter] = useState<string>('pending')
  const handleListingsFilter = (f: string) => { setListingsFilter(f); setListingsPage(0) }
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Pagination
  const [usersPage, setUsersPage] = useState(0)
  const [charitiesPage, setCharitiesPage] = useState(0)
  const [listingsPage, setListingsPage] = useState(0)
  const [auditPage, setAuditPage] = useState(0)

  // Rejection modal
  const [rejectModal, setRejectModal] = useState<{ type: 'listing' | 'charity'; uuid: string } | null>(null)
  const [confirmForceClose, setConfirmForceClose] = useState<{ uuid: string; title: string } | null>(null)

  // Audit search
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('all')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const [statsRes, auditRes, usersRes, charitiesRes, listingsRes] = await Promise.all([
        api.get<AdminStats>('/admin/stats'),
        api.get<AuditEvent[]>('/admin/audit-events').catch(() => [] as AuditEvent[]),
        api.get<User[]>('/admin/users').catch(() => [] as User[]),
        api.get<CharityOrganisation[]>('/charities').catch(() => [] as CharityOrganisation[]),
        api.get<Listing[]>('/listings/admin/all').catch(() => [] as Listing[]),
      ])
      setStats(statsRes.data)
      setEvents(Array.isArray(auditRes) ? auditRes : auditRes.data ?? [])
      setUsers(Array.isArray(usersRes) ? usersRes : usersRes.data ?? [])
      setCharities(Array.isArray(charitiesRes) ? charitiesRes : charitiesRes.data ?? [])
      setListingsData(Array.isArray(listingsRes) ? listingsRes : listingsRes.data ?? [])
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load admin data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { const id = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(id) }, [])

  const pendingApprovals = useMemo(() =>
    (stats?.pendingCharities ?? 0) + (stats?.pendingListings ?? 0),
    [stats],
  )

  const recentEvents = useMemo(() =>
    [...events].reverse().slice(0, 10),
    [events],
  )

  const filteredUsers = useMemo(() => {
    let result = users
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(u =>
        u.full_name.toLowerCase().includes(q) ||
        (hasUserFacingUsername(u) && u.username.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q),
      )
    }
    if (roleFilter !== 'all') result = result.filter(u => u.roles.includes(roleFilter as UserRole))
    if (statusFilter === 'active') result = result.filter(u => u.is_active)
    else if (statusFilter === 'inactive') result = result.filter(u => !u.is_active)
    return result
  }, [users, searchQuery, roleFilter, statusFilter])

  const filteredCharities = useMemo(() => {
    if (charityFilter === 'all') return charities
    return charities.filter(c => c.status === charityFilter)
  }, [charities, charityFilter])

  const filteredListings = useMemo(() => {
    if (!listingsFilter || listingsFilter === 'all') return listingsData
    return listingsData.filter(l => l.status === listingsFilter)
  }, [listingsData, listingsFilter])

  const handleApproveListing = async (uuid: string) => {
    setActionLoading(uuid)
    try {
      // FR09 stage 1: admin approval must not publish the auction.
      // The backend forwards the listing to the charity review queue by
      // returning status='charity_review'. Using the returned listing here
      // prevents the admin UI from falsely showing it as Active.
      const res = await api.post<Listing>(`/listings/${uuid}/approve`)
      setMessage('Listing forwarded to the assigned charity for review.')
      setListingsData(prev => prev.map(l => l.uuid === uuid ? res.data : l))
    } catch (err) {
      setError((err as ApiError).message || 'Failed to forward listing to charity review.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectListing = async (reason: string) => {
    if (!rejectModal || rejectModal.type !== 'listing') return
    setActionLoading(rejectModal.uuid)
    try {
      await api.post(`/listings/${rejectModal.uuid}/reject`, { reason })
      setListingsData(prev => prev.filter(l => l.uuid !== rejectModal.uuid))
      setRejectModal(null)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to reject listing.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleForceClose = async (uuid: string) => {
    setActionLoading(uuid)
    try {
      await api.post(`/listings/${uuid}/force-close`)
      setMessage('Auction forcefully closed.')
      setListingsData(prev => prev.map(l => l.uuid === uuid ? { ...l, status: 'sold' as const } : l))
      setConfirmForceClose(null)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to force close listing.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectCharity = async (reason: string) => {
    if (!rejectModal || rejectModal.type !== 'charity') return
    setActionLoading(rejectModal.uuid)
    try {
      await api.post(`/charities/${rejectModal.uuid}/review`, { decision: 'rejected', reason })
      setCharities(prev => prev.map(c => c.uuid === rejectModal.uuid ? { ...c, status: 'rejected' as const } : c))
      setRejectModal(null)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to reject charity.')
    } finally {
      setActionLoading(null)
    }
  }

  // Paginated slices
  const paginatedUsers = useMemo(() => {
    const start = usersPage * PAGE_SIZE
    return filteredUsers.slice(start, start + PAGE_SIZE)
  }, [filteredUsers, usersPage])

  const paginatedCharities = useMemo(() => {
    const start = charitiesPage * PAGE_SIZE
    return filteredCharities.slice(start, start + PAGE_SIZE)
  }, [filteredCharities, charitiesPage])

  const paginatedListings = useMemo(() => {
    const start = listingsPage * PAGE_SIZE
    return filteredListings.slice(start, start + PAGE_SIZE)
  }, [filteredListings, listingsPage])

  // User lookup for audit log
  const userLookup = useMemo(() => {
    const map = new Map<number, { name: string; username?: string }>()
    users.forEach(u => { if (u.id) map.set(u.id, { name: u.full_name, username: hasUserFacingUsername(u) ? u.username : undefined }) })
    return map
  }, [users])

  const actorName = (userId?: number): string => {
    if (!userId) return 'System'
    const u = userLookup.get(userId)
    return u ? `${u.name}${u.username ? ` (@${u.username})` : ''} #${userId}` : `#${userId}`
  }

  // Audits
  const auditActions = useMemo(() => {
    const set = new Set(events.map(e => e.action))
    return ['all', ...Array.from(set).sort()]
  }, [events])

  const filteredAuditEvents = useMemo(() => {
    let result = [...events].reverse()
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase()
      result = result.filter(e => {
        const u = e.actorUserId ? userLookup.get(e.actorUserId) : null
        const userStr = u ? `${u.name}${u.username ? ` (@${u.username})` : ''} #${e.actorUserId}` : `#${e.actorUserId ?? ''}`
        return e.action.toLowerCase().includes(q) ||
          userStr.toLowerCase().includes(q) ||
          (e.resourceType ?? '').toLowerCase().includes(q) ||
          (e.resourceId ?? '').toLowerCase().includes(q)
      })
    }
    if (auditActionFilter !== 'all') {
      result = result.filter(e => e.action === auditActionFilter)
    }
    return result
  }, [events, auditSearch, auditActionFilter, userLookup])

  const paginatedAuditEvents = useMemo(() => {
    const start = auditPage * PAGE_SIZE
    return filteredAuditEvents.slice(start, start + PAGE_SIZE)
  }, [filteredAuditEvents, auditPage])

  // Reset page when filters change
  useEffect(() => { const id = window.setTimeout(() => setUsersPage(0), 0); return () => window.clearTimeout(id) }, [searchQuery, roleFilter, statusFilter])
  useEffect(() => { const id = window.setTimeout(() => setCharitiesPage(0), 0); return () => window.clearTimeout(id) }, [charityFilter])
  useEffect(() => { const id = window.setTimeout(() => setListingsPage(0), 0); return () => window.clearTimeout(id) }, [listingsFilter])
  useEffect(() => { const id = window.setTimeout(() => setAuditPage(0), 0); return () => window.clearTimeout(id) }, [auditSearch, auditActionFilter])

  const handleToggleUser = async (uuid: string, currentlyActive: boolean) => {
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

  // ─── Loading / Error ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.danger }} />
          <p style={{ color: C.danger }}>{error}</p>
          <button onClick={loadData}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: C.emerald }}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────

  const tabs: TabNavItem[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'charities', label: 'Charity Orgs', icon: <Building2 className="w-4 h-4" />, badge: stats?.pendingCharities },
    { id: 'listings', label: 'Listings', icon: <Package className="w-4 h-4" />, badge: stats?.pendingListings },
    { id: 'audit', label: 'Audit Logs', icon: <ScrollText className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ background: C.linen }}>
      <div className="flex">
        {/* Desktop sidebar */}
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={(tab) => { setMessage(null); setActiveTab(tab) }} />

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">

           {error && (
            <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
              {error}
              <button onClick={() => setError(null)} className="float-right"><X className="w-4 h-4" /></button>
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.emeraldLight, color: C.emerald, border: `1px solid rgba(4,120,87,0.20)` }}>
              {message}
              <button onClick={() => setMessage(null)} className="float-right"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ───────────── OVERVIEW ───────────── */}
          {activeTab === 'overview' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Overview</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>BidForGood Platform Administration</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: '#F3E8FF', color: '#6B21A8' }}>
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                      <Users className="w-5 h-5" style={{ color: '#4F46E5' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalUsers?.toLocaleString() ?? 0}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Users</p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                      <TrendingUp className="w-5 h-5" style={{ color: C.emerald }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalListings ?? 0}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Listings</p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                      <Gavel className="w-5 h-5" style={{ color: '#92400E' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{stats?.totalBids?.toLocaleString() ?? 0}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Bids</p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                      <Clock className="w-5 h-5" style={{ color: '#C2410C' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{pendingApprovals}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Pending Approvals</p>
                </div>
              </div>


              {/* Recent Activity */}
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
                  <h2 className="font-bold text-sm" style={{ color: C.slate }}>Recent Activity</h2>
                </div>
                {recentEvents.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm" style={{ color: C.muted }}>
                    No recent activity recorded.
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: C.beige }}>
                    {recentEvents.map((e, i) => (
                      <div key={e.id} className="px-6 py-3 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: i === 0 ? C.emerald : C.beige }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: C.slate }}>
                            <span className="font-medium">{e.action}</span>
                            {e.resourceType && (
                              <span className="text-xs" style={{ color: C.muted }}>
                                {' '}on {e.resourceType}{e.resourceId ? ` / ${e.resourceId.slice(0, 8)}` : ''}
                              </span>
                            )}
                          </p>
                          <p className="text-xs" style={{ color: C.muted }}>
                            {actorName(e.actorUserId)}
                          </p>
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>
                          {relativeTime(e.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────── USERS ───────────── */}
          {activeTab === 'users' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Users</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>BidForGood Platform Administration</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-6">
                <input type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${C.beige}`, background: '#fff', color: C.slate }}
                />
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${C.beige}`, background: '#fff', color: C.slate }}>
                  <option value="all">All Roles</option>
                  <option value="bidder">Bidder</option>
                  <option value="donor">Donor</option>
                  <option value="charity">Charity</option>
                  <option value="charity_staff">Charity Staff</option>
                  <option value="admin">Admin</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${C.beige}`, background: '#fff', color: C.slate }}>
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No users found</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Try adjusting your search or filters.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>User</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell" style={{ color: C.muted }}>Email</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Roles</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell" style={{ color: C.muted }}>Registered</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map(u => (
                          <tr key={u.uuid} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{u.full_name}</p>
                              {hasUserFacingUsername(u) && (
                                <p className="text-xs mt-0.5" style={{ color: C.muted }}>@{u.username}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell text-xs" style={{ color: C.muted }}>{u.email}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">{u.roles.map(roleBadge)}</div>
                            </td>
                            <td className="px-6 py-4">
                              {u.is_active ? (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.emeraldLight, color: C.emerald }}>Active</span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.dangerLight, color: C.danger }}>Inactive</span>
                              )}
                            </td>
                            <td className="px-6 py-4 hidden lg:table-cell text-xs" style={{ color: C.muted }}>
                              {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleToggleUser(u.uuid!, u.is_active)}
                                disabled={toggling === u.uuid}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                style={{ background: u.is_active ? C.danger : C.emerald }}
                              >
                                {toggling === u.uuid ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : u.is_active ? (
                                  'Deactivate'
                                ) : (
                                  'Activate'
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar page={usersPage} totalPages={Math.ceil(filteredUsers.length / PAGE_SIZE)} totalItems={filteredUsers.length} onPageChange={setUsersPage} />
                </div>
              )}
            </div>
          )}

          {/* ───────────── CHARITY ORGS ───────────── */}
          {activeTab === 'charities' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Charity Orgs</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>BidForGood Platform Administration</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {[
                  { value: 'all', label: 'All', count: charities.length },
                  { value: 'pending', label: 'Pending', count: charities.filter(c => c.status === 'pending').length },
                  { value: 'approved', label: 'Approved', count: charities.filter(c => c.status === 'approved').length },
                  { value: 'rejected', label: 'Rejected', count: charities.filter(c => c.status === 'rejected').length },
                ].map(opt => (
                  <button key={opt.value} onClick={() => { setCharityFilter(opt.value); setRejectModal(null) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                    style={{
                      background: charityFilter === opt.value ? C.emerald : C.linen,
                      color: charityFilter === opt.value ? '#fff' : C.muted,
                    }}>
                    {opt.label}
                    <span className="text-[10px] opacity-70">({opt.count})</span>
                  </button>
                ))}
              </div>

              {filteredCharities.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Building2 className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No charity registrations found</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Organisation</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Email</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell" style={{ color: C.muted }}>Submitted</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCharities.map(c => (
                          <tr key={c.uuid} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{c.organisationName}</p>
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                              {c.ownerEmail || '—'}
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell text-xs" style={{ color: C.muted }}>
                              {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {c.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={async () => {
                                    setActionLoading(c.uuid)
                                    try {
                                      await api.post(`/charities/${c.uuid}/review`, { decision: 'approved' })
                                      setCharities(prev => prev.map(x => x.uuid === c.uuid ? { ...x, status: 'approved' as const } : x))
                                    } catch (err) {
                                      setError((err as ApiError).message || 'Failed to approve charity.')
                                    } finally {
                                      setActionLoading(null)
                                    }
                                  }}
                                    disabled={actionLoading === c.uuid}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                    style={{ background: C.emerald }}>
                                    {actionLoading === c.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                    Approve
                                  </button>
                                  <button onClick={() => setRejectModal({ type: 'charity', uuid: c.uuid })}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-opacity hover:opacity-90"
                                    style={{ color: C.danger, border: `1px solid ${C.dangerBorder}`, background: C.dangerLight }}>
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  style={{
                                    background: c.status === 'approved' ? C.emeraldLight : C.dangerLight,
                                    color: c.status === 'approved' ? C.emerald : C.danger,
                                  }}>
                                  {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar page={charitiesPage} totalPages={Math.ceil(filteredCharities.length / PAGE_SIZE)} totalItems={filteredCharities.length} onPageChange={setCharitiesPage} />
                </div>
              )}
            </div>
          )}
          {/* ───────────── LISTINGS ───────────── */}
          {activeTab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Listings</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>BidForGood Platform Administration</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {['pending', 'charity_review', 'active', 'sold', 'expired', 'cancelled'].map(status => {
                  const listingStatus = status as Listing['status']
                  const count = listingsData.filter(l => l.status === listingStatus).length
                  return (
                    <button key={status} onClick={() => handleListingsFilter(status)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                      style={{
                        background: listingsFilter === status ? C.emerald : C.linen,
                        color: listingsFilter === status ? '#fff' : C.muted,
                      }}>
                      {adminListingStatusLabel(listingStatus)}
                      <span className="text-[10px] opacity-70">({count})</span>
                    </button>
                  )
                })}
              </div>

              {filteredListings.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No {listingsFilter} listings found</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item Title</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Donor</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell" style={{ color: C.muted }}>Charity</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell" style={{ color: C.muted }}>Start / End</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedListings.map(l => (
                          <tr key={l.uuid ?? l.id} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                              Donor #{l.donor_id}
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell text-xs" style={{ color: C.muted }}>
                              {l.charityName || '—'}
                            </td>
                            <td className="px-6 py-4 hidden lg:table-cell text-xs" style={{ color: C.muted }}>
                              {new Date(l.start_time).toLocaleDateString()} → {new Date(l.end_time).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {l.uuid && (
                                  <Link to={`/auctions/${l.uuid}`} target="_blank"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.muted }} title="View listing">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Link>
                                )}
                                {l.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleApproveListing(l.uuid!)}
                                      disabled={actionLoading === l.uuid}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-50"
                                      style={{ background: C.emerald }}>
                                      {actionLoading === l.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                      Approve
                                    </button>
                                    <button onClick={() => setRejectModal({ type: 'listing', uuid: l.uuid! })}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold"
                                      style={{ color: C.danger, border: `1px solid ${C.dangerBorder}`, background: C.dangerLight }}>
                                      Reject
                                    </button>
                                  </>
                                )}
                                {l.status === 'active' && (
                                  <button onClick={() => setConfirmForceClose({ uuid: l.uuid!, title: l.title })}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-opacity hover:opacity-90"
                                    style={{ background: C.danger }}>
                                    Force Close
                                  </button>
                                )}
                                {l.status !== 'pending' && l.status !== 'active' && (
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                                    style={{ background: C.linen, color: C.muted }}>
                                    {adminListingStatusLabel(l.status)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar page={listingsPage} totalPages={Math.ceil(filteredListings.length / PAGE_SIZE)} totalItems={filteredListings.length} onPageChange={setListingsPage} />
                </div>
              )}
            </div>
          )}

          {/* ───────────── AUDIT LOGS ───────────── */}
          {activeTab === 'audit' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Audit Logs</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>BidForGood Platform Administration</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Audit search/filter */}
              <div className="flex flex-wrap gap-3 mb-6">
                <input type="text" value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                  placeholder="Search by action, user, resource..."
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${C.beige}`, background: '#fff', color: C.slate }}
                />
                <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ border: `1px solid ${C.beige}`, background: '#fff', color: C.slate }}>
                  {auditActions.map(action => (
                    <option key={action} value={action}>
                      {action === 'all' ? 'All Action Types' : action}
                    </option>
                  ))}
                </select>
              </div>

              {filteredAuditEvents.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <ScrollText className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No audit events found</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Try adjusting your search or filters.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Timestamp</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>User</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Action Type</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell" style={{ color: C.muted }}>Target</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell" style={{ color: C.muted }}>IP Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAuditEvents.map(e => (
                          <tr key={e.id} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4 whitespace-nowrap text-xs" style={{ color: C.muted }}>
                              {new Date(e.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold" style={{ color: C.slate }}>
                              {actorName(e.actorUserId)}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.linen, color: C.slate }}>
                                {e.action}
                              </span>
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell text-xs" style={{ color: C.muted }}>
                              {e.resourceType ? `${e.resourceType}${e.resourceId ? ` / ${e.resourceId.slice(0, 8)}` : ''}` : '-'}
                            </td>
                            <td className="px-6 py-4 hidden lg:table-cell text-xs font-mono" style={{ color: C.muted }}>
                              {e.ipHash ? e.ipHash.slice(0, 16) + '…' : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar page={auditPage} totalPages={Math.ceil(filteredAuditEvents.length / PAGE_SIZE)} totalItems={filteredAuditEvents.length} onPageChange={setAuditPage} />
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Rejection modal */}
      {rejectModal && (
        <RejectModal
          label={rejectModal.type === 'listing' ? 'listing' : 'charity registration'}
          onConfirm={async (reason) => {
            if (rejectModal.type === 'listing') await handleRejectListing(reason)
            else await handleRejectCharity(reason)
          }}
          onClose={() => setRejectModal(null)}
        />
      )}

      {/* Force close confirmation */}
      {confirmForceClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setConfirmForceClose(null)}>
          <div className="rounded-2xl bg-white w-full max-w-sm mx-4 overflow-hidden shadow-xl"
            style={{ border: `1px solid ${C.beige}` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
              <h2 className="font-black text-base" style={{ color: C.slate }}>Force Close Auction</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm" style={{ color: C.slate }}>
                Are you sure you want to force close <strong>{confirmForceClose.title}</strong>?
              </p>
              <p className="text-xs" style={{ color: C.muted }}>
                This will end the auction immediately and mark it as sold. This action cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setConfirmForceClose(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
                Cancel
              </button>
              <button onClick={() => handleForceClose(confirmForceClose.uuid)}
                disabled={actionLoading === confirmForceClose.uuid}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: C.danger }}>
                {actionLoading === confirmForceClose.uuid ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
