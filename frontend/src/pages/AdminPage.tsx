import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  Users, Package, Gavel, Building2, Clock, Loader2, AlertCircle,
  RefreshCw, ScrollText, ShieldCheck, Activity, TrendingUp,
} from 'lucide-react'
import api from '../services/api'
import type { AdminStats, ApiError, AuditEvent } from '../types'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, auditRes] = await Promise.all([
        api.get<AdminStats>('/admin/stats'),
        api.get<AuditEvent[]>('/admin/audit-events').catch(() => [] as AuditEvent[]),
      ])
      setStats(statsRes.data)
      setEvents(Array.isArray(auditRes) ? auditRes : auditRes.data ?? [])
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
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">

          {error && (
            <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
              {error}
              <button onClick={() => setError(null)} className="float-right"><X className="w-4 h-4" /></button>
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
                            {e.actorUserId ? `#${e.actorUserId}` : 'System'}
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
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                <Link to="/admin/users" className="font-bold underline underline-offset-2" style={{ color: C.emerald }}>
                  Go to full User Management →
                </Link>
              </p>
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
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                <Link to="/admin/charities" className="font-bold underline underline-offset-2" style={{ color: C.emerald }}>
                  Go to Charity Approvals →
                </Link>
              </p>
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
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                <Link to="/admin/listings" className="font-bold underline underline-offset-2" style={{ color: C.emerald }}>
                  Go to Listing Approvals →
                </Link>
              </p>
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
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                <Link to="/admin/audit" className="font-bold underline underline-offset-2" style={{ color: C.emerald }}>
                  Go to full Audit Log →
                </Link>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

