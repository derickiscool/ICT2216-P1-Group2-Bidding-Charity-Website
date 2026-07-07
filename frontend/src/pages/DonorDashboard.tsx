import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Clock, CheckCircle, Plus, Loader2, AlertCircle,
  Truck, ExternalLink, RefreshCw, X, Pencil, ImageIcon,
  DollarSign, FileText, ListOrdered,
} from 'lucide-react'
import api from '../services/api'
import type { Listing, DonorStats, ApiError, DonorListingTrackingResponse } from '../types'

// Donor listing with backend-enriched payment/shipping fields
type DonorListing = Listing & {
  can_ship?: boolean
  payment_held?: boolean
  has_shipped?: boolean
  payment_released?: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const timeLeftStr = (endTime: string, nowMs: number): string => {
  const diff = new Date(endTime).getTime() - nowMs
  if (diff <= 0) return 'Ended'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'my-listings' | 'create-listing' | 'shipping' | 'donation-proceeds'

interface TabNavItem {
  id: Tab
  label: string
  icon: React.ReactNode
  badge?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusBadge = (status: string, label?: string) => {
  const colors = new Map<string, { bg: string; text: string }>([
    ['draft', { bg: '#F3F4F6', text: '#6B7280' }],
    ['pending', { bg: '#FEF3C7', text: '#92400E' }],
    ['active', { bg: '#ECFDF5', text: '#047857' }],
    ['sold', { bg: '#DBEAFE', text: '#1E40AF' }],
    ['expired', { bg: '#FEE2E2', text: '#991B1B' }],
    ['cancelled', { bg: '#FEE2E2', text: '#991B1B' }],
    ['rejected', { bg: '#FEE2E2', text: '#991B1B' }],
  ])
  const style = colors.get(status) ?? colors.get('draft')!
  return (
    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
      style={{ background: style.bg, color: style.text }}>
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
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
        <h2 className="font-black text-sm uppercase tracking-widest" style={{ color: C.slate }}>Donor Dashboard</h2>
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

export default function DonorDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('my-listings')

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [trackingDashboard, setTrackingDashboard] = useState<DonorListingTrackingResponse | null>(null)
  const [stats, setStats] = useState<DonorStats | null>(null)
  const [nowMs, setNowMs] = useState(0)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const PAGE_SIZE = 15

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter)
    setPage(0)
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  const sortArrow = (key: string) => {
    if (sortKey !== key) return <span className="ml-1 opacity-20">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // Shipping state
  const [shippingUuid, setShippingUuid] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [courier, setCourier] = useState('')
  const [shippingLoading, setShippingLoading] = useState<string | null>(null)

  // ─── Derived data ───────────────────────────────────────────────────────

  const trackingItems = useMemo(() => trackingDashboard?.listings ?? [], [trackingDashboard])
  const summary = useMemo(() => trackingDashboard?.summary, [trackingDashboard])

  const donorListings = listings as DonorListing[]

  const shipReadyListings = useMemo(() =>
    donorListings.filter(l => l.status === 'sold' && l.can_ship),
    [donorListings],
  )
  const unpaidListings = useMemo(() =>
    donorListings.filter(l => l.status === 'sold' && !l.payment_held && !l.has_shipped),
    [donorListings],
  )
  const shippedListings = useMemo(() =>
    donorListings.filter(l => l.status === 'sold' && l.has_shipped),
    [donorListings],
  )
  const soldListings = useMemo(() =>
    donorListings.filter(l => l.status === 'sold'),
    [donorListings],
  )

  const filterOptions = useMemo(() => [
    { value: 'all', label: 'All', count: summary?.total ?? 0 },
    { value: 'draft', label: 'Draft', count: summary?.draft ?? 0 },
    { value: 'pending', label: 'Pending', count: summary?.pending ?? 0 },
    { value: 'active', label: 'Active', count: summary?.active ?? 0 },
    { value: 'sold', label: 'Sold', count: summary?.sold ?? 0 },
    { value: 'expired', label: 'Expired', count: summary?.expired ?? 0 },
    { value: 'cancelled', label: 'Cancelled', count: summary?.cancelled ?? 0 },
  ], [summary])

  const filteredTrackingItems = useMemo(() => {
    const filtered = statusFilter === 'all' ? [...trackingItems] : trackingItems.filter(i => i.status === statusFilter)
    if (!sortKey) return filtered
    filtered.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'campaign':
          cmp = (a.charityName ?? '').localeCompare(b.charityName ?? '')
          break
        case 'bid':
          cmp = (a.status === 'active' || a.status === 'sold' ? a.current_bid : 0) -
                (b.status === 'active' || b.status === 'sold' ? b.current_bid : 0)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        default:
          return 0
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return filtered
  }, [trackingItems, statusFilter, sortKey, sortDir])

  const paginatedItems = useMemo(() => {
    const start = page * PAGE_SIZE
    return filteredTrackingItems.slice(start, start + PAGE_SIZE)
  }, [filteredTrackingItems, page])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredTrackingItems.length / PAGE_SIZE)), [filteredTrackingItems])

  // ─── API calls ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const [listingsRes, trackingRes] = await Promise.all([
        api.get<{ listings: Listing[]; stats: DonorStats }>('/listings/donor').catch(() => ({ data: { listings: [] as Listing[], stats: { total: 0, active: 0, sold: 0, pending: 0, draft: 0, totalRaised: 0 } } })),
        api.get<DonorListingTrackingResponse>('/listings/mine/tracking').catch(() => ({ data: { generatedAt: '', summary: { total: 0, draft: 0, pending: 0, active: 0, sold: 0, shipped: 0, delivered: 0, expired: 0, cancelled: 0, rejected: 0 }, listings: [] } })),
      ])
      setListings(listingsRes.data.listings)
      setStats(listingsRes.data.stats)
      setTrackingDashboard(trackingRes.data)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Tick every 60s for time-relative displays
  useEffect(() => {
    const id = window.setTimeout(() => setNowMs(Date.now()), 0)
    const iv = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => { window.clearTimeout(id); window.clearInterval(iv) }
  }, [])

  useEffect(() => { const id = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(id) }, [loadData])

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleShipping = async (uuid: string) => {
    if (!trackingNumber.trim() || !courier.trim()) return
    setShippingLoading(uuid)
    try {
      await api.post(`/listings/${uuid}/shipping`, { tracking_number: trackingNumber, courier })
      setShippingUuid(null)
      setTrackingNumber('')
      setCourier('')
      setMessage('Shipping details submitted successfully.')
      await loadData()
    } catch (err) {
      setError((err as ApiError).message || 'Failed to submit shipping details.')
    } finally {
      setShippingLoading(null)
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

  if (error && !message && listings.length === 0) {
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
    { id: 'my-listings', label: 'My Listings', icon: <ListOrdered className="w-4 h-4" />, badge: trackingItems.length },
    { id: 'create-listing', label: 'Create Listing', icon: <Plus className="w-4 h-4" /> },
    { id: 'shipping', label: 'Shipping', icon: <Truck className="w-4 h-4" />, badge: shipReadyListings.length },
    { id: 'donation-proceeds', label: 'Donation Proceeds', icon: <DollarSign className="w-4 h-4" /> },
  ]

  const mobileTabs = (
    <div className="flex md:hidden gap-1 p-1 rounded-xl mb-6 overflow-x-auto" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <button key={tab.id} onClick={() => onTabChangeMobile(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
            style={{
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? C.emerald : C.muted,
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: isActive ? C.emerald : C.linen, color: isActive ? '#fff' : C.slate }}>
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  // Separate handler for mobile tabs — navigate to create listing page
  const onTabChangeMobile = (tab: Tab) => {
    if (tab === 'create-listing') {
      window.location.href = '/listings/create'
      return
    }
    setActiveTab(tab)
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ background: C.linen }}>
      <div className="flex">
        {/* Desktop sidebar */}
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={(tab) => {
          if (tab === 'create-listing') {
            window.location.href = '/listings/create'
            return
          }
          setActiveTab(tab)
        }} />

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">

          {/* Mobile tab bar */}
          {mobileTabs}

          {/* Global messages */}
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

          {/* ───────────── MY LISTINGS ───────────── */}
          {activeTab === 'my-listings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>My Listings</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Manage your donated auction items</p>
                </div>
                <Link to="/listings/create"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: C.emerald }}>
                  <Plus className="w-4 h-4" /> Create New Listing
                </Link>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {filterOptions.map(opt => (
                  <button key={opt.value} onClick={() => handleFilterChange(opt.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                    style={{
                      background: statusFilter === opt.value ? C.emerald : C.linen,
                      color: statusFilter === opt.value ? '#fff' : C.muted,
                    }}>
                    {opt.label}
                    <span className="text-[10px] opacity-70">({opt.count})</span>
                  </button>
                ))}
              </div>

              {/* Table */}
              {paginatedItems.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No listings found</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>Create your first auction listing to start raising funds for charity.</p>
                  <Link to="/listings/create"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    <Plus className="w-4 h-4" /> Create Listing
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="w-12 px-2 py-3"></th>
                          <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-widest cursor-pointer select-none hover:opacity-70" style={{ color: C.muted }}
                            onClick={() => handleSort('title')}>
                            Title{sortArrow('title')}
                          </th>
                          <th className="text-left px-4 py-3 font-bold text-[10px] uppercase tracking-widest cursor-pointer select-none hover:opacity-70" style={{ color: C.muted }}
                            onClick={() => handleSort('campaign')}>
                            Campaign{sortArrow('campaign')}
                          </th>
                          <th className="text-right px-4 py-3 font-bold text-[10px] uppercase tracking-widest cursor-pointer select-none hover:opacity-70" style={{ color: C.muted }}
                            onClick={() => handleSort('bid')}>
                            Current Bid{sortArrow('bid')}
                          </th>
                          <th className="text-center px-4 py-3 font-bold text-[10px] uppercase tracking-widest cursor-pointer select-none hover:opacity-70" style={{ color: C.muted }}
                            onClick={() => handleSort('status')}>
                            Status{sortArrow('status')}
                          </th>
                          <th className="text-center px-4 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Time Left</th>
                          <th className="text-right px-4 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map(item => {
                          const image = item.images?.[0]
                          const isActive = item.status === 'active'
                          const isViewable = item.status === 'active'
                          const timeLeft = isActive && item.end_time ? timeLeftStr(item.end_time, nowMs) : '—'
                          return (
                            <tr key={item.uuid ?? item.id} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-2 py-4">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                                  style={{ background: C.linen }}>
                                  {image ? (
                                    <img src={image} alt={item.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5" style={{ color: C.beige }} />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <p className="font-medium" style={{ color: C.slate }}>{item.title}</p>
                              </td>
                              <td className="px-4 py-4 text-xs" style={{ color: C.muted }}>
                                {item.charityName || '—'}
                              </td>
                              <td className="px-4 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {isViewable ? money(item.current_bid) : '—'}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {statusBadge(item.status, item.statusLabel)}
                              </td>
                              <td className="px-4 py-4 text-center text-xs font-bold"
                                style={{ color: isActive ? C.slate : C.muted }}>
                                {timeLeft}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isViewable && item.uuid && (
                                    <Link to={`/auctions/${item.uuid}`}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                      style={{ color: C.muted }}
                                      title="View listing">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>
                                  )}
                                  {(item.canEdit || item.canDelete) && (
                                    <Link to="/listings/manage"
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                      style={{ color: C.muted }}
                                      title="Edit or manage listing">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: C.beige }}>
                    <div className="text-xs" style={{ color: C.muted }}>
                      <Link to="/listings/manage" className="font-bold underline underline-offset-2" style={{ color: C.emerald }}>
                        Go to full listing manager →
                      </Link>
                      &nbsp;for edit/delete actions
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-opacity"
                          style={{ border: `1px solid ${C.beige}`, color: page === 0 ? C.muted : C.slate }}>
                          Previous
                        </button>
                        <span className="text-xs font-medium" style={{ color: C.muted }}>
                          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTrackingItems.length)} of {filteredTrackingItems.length}
                        </span>
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-30 transition-opacity"
                          style={{ border: `1px solid ${C.beige}`, color: page >= totalPages - 1 ? C.muted : C.slate }}>
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────── CREATE LISTING ───────────── */}
          {activeTab === 'create-listing' && (
            <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
              <Plus className="w-16 h-16 mx-auto mb-4" style={{ color: C.emerald }} />
              <h2 className="text-2xl font-black mb-2" style={{ color: C.slate }}>Create a New Listing</h2>
              <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: C.muted }}>
                Donate an item or experience to a charitable auction campaign. Your listing will be reviewed by an admin before going live.
              </p>
              <Link to="/listings/create"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: C.emerald }}>
                <Plus className="w-4 h-4" /> Go to Create Listing
              </Link>
            </div>
          )}

          {/* ───────────── SHIPPING ───────────── */}
          {activeTab === 'shipping' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Shipping</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Track and manage items you need to ship to winners</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Ready to ship */}
              {shipReadyListings.length > 0 && (
                <div className="rounded-2xl bg-white overflow-hidden mb-6" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: C.beige }}>
                    <Truck className="w-4 h-4" style={{ color: C.emerald }} />
                    <h2 className="font-bold" style={{ color: C.slate }}>Ready to Ship ({shipReadyListings.length})</h2>
                  </div>
                  <div className="divide-y" style={{ borderColor: C.beige }}>
                    {shipReadyListings.map((listing) => (
                      <div key={listing.id} className="px-6 py-4">
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
                              style={{ border: `1px solid ${C.beige}` }}
                            />
                            <input type="text" value={courier} required
                              onChange={(e) => setCourier(e.target.value)}
                              placeholder="Courier (e.g. DHL, FedEx)"
                              className="flex-1 px-3 py-2 text-sm rounded-lg outline-none"
                              style={{ border: `1px solid ${C.beige}` }}
                            />
                            <button type="submit" disabled={shippingLoading === listing.uuid || !trackingNumber.trim() || !courier.trim()}
                              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-50"
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
                            className="px-4 py-2 text-sm font-bold text-white rounded-lg transition-opacity hover:opacity-90"
                            style={{ background: C.emerald }}>
                            Provide Tracking
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {shipReadyListings.length === 0 && unpaidListings.length === 0 && shippedListings.length === 0 && (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Truck className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No items to ship</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>When your items sell and payment is received, you can provide tracking here.</p>
                </div>
              )}

              {/* Awaiting buyer payment */}
              {unpaidListings.length > 0 && (
                <div className="rounded-2xl bg-white overflow-hidden mb-6" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: C.beige }}>
                    <Clock className="w-4 h-4" style={{ color: '#92400E' }} />
                    <h2 className="font-bold" style={{ color: C.slate }}>Awaiting Buyer Payment ({unpaidListings.length})</h2>
                  </div>
                  <div className="divide-y" style={{ borderColor: C.beige }}>
                    {unpaidListings.map((listing) => (
                      <div key={listing.id} className="px-6 py-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sold for {money(listing.current_bid)}</p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                          style={{ background: '#FEF3C7', color: '#92400E' }}>
                          Awaiting Payment
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shipped items */}
              {shippedListings.length > 0 && (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: C.beige }}>
                    <CheckCircle className="w-4 h-4" style={{ color: C.emerald }} />
                    <h2 className="font-bold" style={{ color: C.slate }}>Shipped ({shippedListings.length})</h2>
                  </div>
                  <div className="divide-y" style={{ borderColor: C.beige }}>
                    {shippedListings.map((listing) => (
                      <div key={listing.id} className="px-6 py-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sold for {money(listing.current_bid)}</p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                          style={{ background: C.emeraldLight, color: C.emerald }}>
                          Shipped
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────── DONATION PROCEEDS ───────────── */}
          {activeTab === 'donation-proceeds' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Donation Proceeds</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>
                    Total raised: <span className="font-bold font-mono" style={{ color: C.emerald }}>{money(stats?.totalRaised ?? 0)}</span>
                  </p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {soldListings.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <DollarSign className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No proceeds yet</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>When your items sell, the proceeds will appear here.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Final Price</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Charity</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Proceeds Status</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {soldListings.map((listing: DonorListing) => {
                          const isReleased = listing.payment_released === true
                          const isHeld = listing.payment_held === true
                          return (
                            <tr key={listing.id} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-6 py-4">
                                <p className="font-medium" style={{ color: C.slate }}>{listing.title}</p>
                              </td>
                              <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {money(listing.current_bid)}
                              </td>
                              <td className="px-6 py-4 text-sm" style={{ color: C.slate }}>
                                {listing.charityName || '—'}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {isReleased ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                    style={{ background: C.emeraldLight, color: C.emerald }}>
                                    <CheckCircle className="w-3 h-3" /> Released
                                  </span>
                                ) : isHeld ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                    style={{ background: '#FFF7ED', color: '#C2410C' }}>
                                    <Clock className="w-3 h-3" /> Holding
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                    style={{ background: '#F3F4F6', color: '#6B7280' }}>
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {isReleased ? (
                                  <span className="text-xs font-bold" style={{ color: C.emerald }}>
                                    <FileText className="w-3.5 h-3.5 inline mr-1" />
                                    Download
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: C.muted }}>—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
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
