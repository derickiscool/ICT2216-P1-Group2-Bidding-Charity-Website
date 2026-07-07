import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Loader2, AlertCircle, Info,
  CheckCircle, Clock, Plus, ExternalLink, RefreshCw, X,
  HeartHandshake, Users, DollarSign, ListOrdered,
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { Listing, CharityStats, ApiError, Campaign } from '../types'

// Listing enriched with payment flags from backend
interface SoldListingWithPayment extends Listing {
  payment_released?: boolean
  payment_held?: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  warning: '#92400E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusPill = (status: string, label?: string) => {
  const colors = new Map<string, { bg: string; text: string }>([
    ['active', { bg: C.emeraldLight, text: C.emerald }],
    ['closed', { bg: '#F3F4F6', text: '#6B7280' }],
    ['pending', { bg: '#FEF3C7', text: '#92400E' }],
    ['draft', { bg: '#F3F4F6', text: '#6B7280' }],
    ['sold', { bg: '#DBEAFE', text: '#1E40AF' }],
    ['expired', { bg: '#FEE2E2', text: '#991B1B' }],
    ['cancelled', { bg: '#FEE2E2', text: '#991B1B' }],
    ['rejected', { bg: '#FEE2E2', text: '#991B1B' }],
  ])
  const s = colors.get(status) ?? { bg: '#F3F4F6', text: '#6B7280' }
  return (
    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.text }}>
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'campaigns' | 'staff' | 'proceeds' | 'listings'

interface TabNavItem {
  id: Tab
  label: string
  icon: React.ReactNode
  badge?: number
}

interface StaffAccount {
  uuid: string
  full_name: string
  email: string
  is_active: boolean
  created_at: string
  lastLoginAt?: string
  mustChangePassword?: boolean
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
        <h2 className="font-black text-sm uppercase tracking-widest" style={{ color: C.slate }}>Charity Dashboard</h2>
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

export default function CharityDashboard() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('campaigns')

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<CharityStats | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [notRegistered, setNotRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listingsFilter, setListingsFilter] = useState<string>('all')

  const isOwner = user?.roles?.includes('charity')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dashRes = api.get<{ charity: Record<string, unknown> | null; listings: Listing[]; stats: CharityStats }>('/charities/dashboard')
      const campRes = api.get<{ campaigns: Campaign[] }>('/charities/campaigns').catch(() => ({ data: { campaigns: [] as Campaign[] } }))
      const staffRes = isOwner
        ? api.get<{ staff: StaffAccount[] }>('/charities/staff').catch(() => ({ data: { staff: [] as StaffAccount[] } }))
        : Promise.resolve({ data: { staff: [] as StaffAccount[] } })

      const [dash, camps, staffData] = await Promise.all([dashRes, campRes, staffRes])

      if (!dash.data.charity) setNotRegistered(true)
      setListings(dash.data.listings)
      setStats(dash.data.stats)
      setCampaigns(camps.data.campaigns ?? [])
      setStaff(staffData.data.staff ?? [])
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load charity dashboard.')
    } finally {
      setLoading(false)
    }
  }, [isOwner])

  useEffect(() => { const id = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(id) }, [loadData])

  // ─── Derived data ───────────────────────────────────────────────────────

  const activeCampaigns = useMemo(() => campaigns.filter(c => c.status === 'active'), [campaigns])
  const activeStaff = useMemo(() => staff.filter(s => s.is_active), [staff])

  const pendingReviewCount = useMemo(() =>
    listings.filter(l => l.status === 'pending').length,
    [listings],
  )

  const filteredListings = useMemo(() => {
    if (listingsFilter === 'all') return listings
    return listings.filter(l => l.status === listingsFilter)
  }, [listings, listingsFilter])

  // Stats for proceeds
  const totalRaised = stats?.totalRaised ?? 0
  const releasedAmount = stats?.paymentsReceived ?? 0
  const heldAmount = stats?.paymentsPending ?? 0
  const releasedCount = stats?.paymentsReleasedCount ?? 0
  const heldCount = stats?.paymentsHeldCount ?? 0

  // Sold items with payment state from backend enrichment
  const soldItems = useMemo(() =>
    (listings as SoldListingWithPayment[])
      .filter(l => l.status === 'sold')
      .map(l => ({
        ...l,
        payment_released: l.payment_released === true,
        payment_held: l.payment_held === true,
      })),
    [listings],
  )

  // ─── Loading / Error / Not Registered ──────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.danger }} />
          <p style={{ color: C.danger }}>{error}</p>
        </div>
      </div>
    )
  }

  if (notRegistered) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
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

  // ─── Tabs ──────────────────────────────────────────────────────────────

  const tabs: TabNavItem[] = [
    { id: 'campaigns', label: 'Campaigns', icon: <HeartHandshake className="w-4 h-4" />, badge: activeCampaigns.length },
    ...(isOwner ? [{ id: 'staff' as Tab, label: 'Staff Accounts', icon: <Users className="w-4 h-4" />, badge: activeStaff.length }] : []),
    { id: 'proceeds', label: 'Donation Proceeds', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'listings', label: 'Listings', icon: <ListOrdered className="w-4 h-4" />, badge: pendingReviewCount },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ background: C.linen }}>
      <div className="flex">
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">

          {error && (
            <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
              {error}
              <button onClick={() => setError(null)} className="float-right"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ───────────── CAMPAIGNS ───────────── */}
          {activeTab === 'campaigns' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Campaigns</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Manage your fundraising campaigns and track progress</p>
                </div>
                <Link to="/charity/campaigns"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: C.emerald }}>
                  <Plus className="w-4 h-4" /> Create New Campaign
                </Link>
              </div>

              {campaigns.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <HeartHandshake className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No campaigns yet</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>Create your first fundraising campaign to start accepting auction donations.</p>
                  <Link to="/charity/campaigns"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    <Plus className="w-4 h-4" /> Create Campaign
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {campaigns.map(c => (
                    <div key={c.uuid} className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold" style={{ color: C.slate }}>{c.name}</h3>
                          {statusPill(c.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Total Raised</p>
                            <p className="text-xl font-black font-mono mt-1" style={{ color: C.emerald }}>{money(c.total_raised)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Active Auctions</p>
                            <p className="text-xl font-black mt-1" style={{ color: C.slate }}>{c.active_auctions}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t flex" style={{ borderColor: C.beige }}>
                        <Link to="/charity/campaigns"
                          className="flex-1 text-center py-3 text-xs font-bold transition-colors hover:opacity-80"
                          style={{ color: C.emerald, borderRight: `1px solid ${C.beige}` }}>
                          View
                        </Link>
                        {c.status === 'active' && (
                          <button
                            onClick={async () => {
                              try {
                                await api.patch(`/charities/campaigns/${c.uuid}/close`)
                                await loadData()
                              } catch (e) {
                                setError((e as ApiError).message || 'Failed to close campaign.')
                              }
                            }}
                            className="flex-1 text-center py-3 text-xs font-bold transition-colors hover:opacity-80"
                            style={{ color: C.danger }}>
                            Close Campaign
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ───────────── STAFF ACCOUNTS ───────────── */}
          {activeTab === 'staff' && isOwner && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Staff Accounts</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Create, deactivate, and reactivate staff accounts for your organisation</p>
                </div>
                <Link to="/charity/staff"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: C.emerald }}>
                  <Plus className="w-4 h-4" /> Add Staff Account
                </Link>
              </div>

              {staff.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No staff accounts yet</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>Add staff members to help manage your campaigns and listings.</p>
                  <Link to="/charity/staff"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    <Plus className="w-4 h-4" /> Add Staff
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Name</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Email</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staff.map(s => (
                          <tr key={s.uuid} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{s.full_name}</p>
                              {s.mustChangePassword && (
                                <p className="text-xs mt-0.5" style={{ color: C.warning }}>Temporary password pending reset</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>{s.email}</td>
                            <td className="px-6 py-4">
                              {s.is_active ? (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.emeraldLight, color: C.emerald }}>Active</span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.dangerLight, color: C.danger }}>Inactive</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {s.is_active ? (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.patch(`/charities/staff/${s.uuid}/deactivate`)
                                        await loadData()
                                      } catch (e) {
                                        setError((e as ApiError).message || 'Failed to deactivate staff.')
                                      }
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.danger }} title="Deactivate staff account">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.patch(`/charities/staff/${s.uuid}/reactivate`)
                                        await loadData()
                                      } catch (e) {
                                        setError((e as ApiError).message || 'Failed to reactivate staff.')
                                      }
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.emerald }} title="Reactivate staff account">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
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
          )}

          {/* ───────────── DONATION PROCEEDS ───────────── */}
          {activeTab === 'proceeds' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Donation Proceeds</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Track funds raised and payout status</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                      <DollarSign className="w-5 h-5" style={{ color: '#C2410C' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(totalRaised)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Raised</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    Across {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                      <CheckCircle className="w-5 h-5" style={{ color: C.emerald }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(releasedAmount)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Funds Released</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    From {releasedCount} item{releasedCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                      <Clock className="w-5 h-5" style={{ color: '#92400E' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(heldAmount)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Funds Holding</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    From {heldCount} item{heldCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>



              {/* Per-item breakdown */}
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
                  <h2 className="font-bold text-sm" style={{ color: C.slate }}>Sold Items</h2>
                </div>
                {soldItems.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm" style={{ color: C.muted }}>
                    No items have been sold yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Campaign</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Winning Bid</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Payment Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {soldItems.map(l => {
                          let statusLabel: string
                          let statusStyle: { bg: string; text: string }
                          if (l.payment_released) {
                            statusLabel = 'Released'
                            statusStyle = { bg: C.emeraldLight, text: C.emerald }
                          } else if (l.payment_held) {
                            statusLabel = 'Holding'
                            statusStyle = { bg: '#FEF3C7', text: '#92400E' }
                          } else {
                            statusLabel = 'Pending'
                            statusStyle = { bg: '#F3F4F6', text: '#6B7280' }
                          }
                          return (
                            <tr key={l.uuid ?? l.id} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-6 py-4">
                                <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                              </td>
                              <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                                {l.charityName || '—'}
                              </td>
                              <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {money(l.current_bid)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  style={{ background: statusStyle.bg, color: statusStyle.text }}>
                                  {statusLabel === 'Released' && '✅'}
                                  {statusLabel === 'Holding' && '⏳'}
                                  {statusLabel === 'Pending' && '⏸'}
                                  {' '}{statusLabel}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────── LISTINGS ───────────── */}
          {activeTab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Listings</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>All auction items linked to your charity organisation</p>
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
                  { value: 'all', label: 'All', count: listings.length },
                  { value: 'pending', label: 'Pending', count: listings.filter(l => l.status === 'pending').length },
                  { value: 'active', label: 'Active', count: listings.filter(l => l.status === 'active').length },
                  { value: 'sold', label: 'Sold', count: listings.filter(l => l.status === 'sold').length },
                  { value: 'expired', label: 'Expired', count: listings.filter(l => l.status === 'expired').length },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setListingsFilter(opt.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                    style={{
                      background: listingsFilter === opt.value ? C.emerald : C.linen,
                      color: listingsFilter === opt.value ? '#fff' : C.muted,
                    }}>
                    {opt.label}
                    <span className="text-[10px] opacity-70">({opt.count})</span>
                  </button>
                ))}
              </div>

              {filteredListings.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No listings found</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>
                    {listingsFilter === 'pending'
                      ? 'No pending listings to review.'
                      : 'All auction listings linked to this charity organisation appear here.'}
                  </p>
                  <Link to="/auctions"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
                    style={{ color: C.emerald, border: `1px solid ${C.beige}` }}>
                    Browse active listings <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item Title</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Donor</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Current Bid</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map(l => (
                          <tr key={l.uuid ?? l.id} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                              Donor #{l.donor_id}
                            </td>
                            <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                              {money(l.current_bid)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {statusPill(l.status)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {l.status === 'pending' && (
                                  <Link to="/charity/listing-reviews"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-opacity hover:opacity-90"
                                    style={{ background: C.emerald }}>
                                    Review
                                  </Link>
                                )}
                                {l.uuid && l.status === 'active' && (
                                  <Link to={`/auctions/${l.uuid}`} target="_blank"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.muted }} title="View listing">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Link>
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
          )}

        </div>
      </div>
    </div>
  )
}
