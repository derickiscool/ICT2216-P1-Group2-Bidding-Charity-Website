import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Gavel, DollarSign, Activity, ExternalLink, Loader2, AlertCircle,
  CheckCircle, FileText, Clock, CreditCard, PackageCheck,
  TimerReset, RefreshCw, X, Pencil, TrendingUp, CheckCircle2, AlertTriangle,
  ShoppingBag, History, ImageIcon,
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { AutoBid, Bid, BidderStats, ApiError, PaymentWithListing, Receipt } from '../types'

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

const maskUsername = (name: string): string => {
  if (name.length <= 3) return name[0] + '***'
  return name[0] + '***' + name.slice(-2)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Tab = 'active-bids' | 'won-auctions' | 'payment-history'

interface TabNavItem {
  id: Tab
  label: string
  icon: React.ReactNode
  badge?: number
}

interface ReceiptItem {
  uuid: string
  item_title: string
  amount: number
  charity_name: string
  generated_at: string
}

// ─── Receipt Modal ───────────────────────────────────────────────────────────

function ReceiptModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="rounded-2xl bg-white w-full max-w-md mx-4 overflow-hidden shadow-xl"
        style={{ border: `1px solid ${C.beige}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: C.emerald }} />
            <h2 className="font-black text-base" style={{ color: C.slate }}>Donation Receipt</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: C.muted }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl p-4 space-y-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
            <Row label="Item" value={receipt.item_title} />
            <Row label="Beneficiary" value={receipt.charity_name} />
            <Row label="Amount Paid" value={money(receipt.amount)} highlight />
            <Row label="Generated" value={new Date(receipt.generated_at).toLocaleString()} />
            <Row label="Receipt ID" value={receipt.uuid} mono />
          </div>
          <p className="text-xs text-center" style={{ color: C.muted }}>
            This receipt is immutable and cannot be modified after generation.
          </p>
        </div>
        <div className="px-6 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold"
            style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs font-bold shrink-0" style={{ color: C.muted }}>{label}</span>
      <span className={`text-xs text-right break-all ${mono ? 'font-mono' : 'font-semibold'}`}
        style={{ color: highlight ? C.emerald : C.slate }}>
        {value}
      </span>
    </div>
  )
}

// ─── Auto-Bid Modal ──────────────────────────────────────────────────────────

function AutoBidModal({
  listingTitle, currentMax, onSave, onClose,
}: {
  listingTitle: string
  currentMax: number
  onSave: (amount: number) => Promise<void>
  onClose: () => void
}) {
  const [amount, setAmount] = useState(currentMax.toString())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = async () => {
    const val = parseFloat(amount)
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount'); return }
    setSaving(true)
    setErr(null)
    try {
      await onSave(val)
      onClose()
    } catch (e) {
      setErr((e as ApiError).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="rounded-2xl bg-white w-full max-w-sm mx-4 overflow-hidden shadow-xl"
        style={{ border: `1px solid ${C.beige}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
          <h2 className="font-black text-base" style={{ color: C.slate }}>Auto-Bid Setting</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: C.muted }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm font-medium" style={{ color: C.slate }}>{listingTitle}</p>
          <div>
            <label className="text-xs font-bold" style={{ color: C.muted }}>Maximum Bid Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: C.muted }}>$</span>
              <input type="number" step="0.01" min="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-xl py-2.5 pl-8 pr-4 text-sm font-bold outline-none"
                style={{ border: `1px solid ${C.beige}`, background: C.linen, color: C.slate }} />
            </div>
          </div>
          {err && <p className="text-xs font-bold" style={{ color: C.danger }}>{err}</p>}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: C.emerald }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
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
        <h2 className="font-black text-sm uppercase tracking-widest" style={{ color: C.slate }}>Bidder Dashboard</h2>
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

export default function BidderDashboard() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('active-bids')

  // Data
  const [bids, setBids] = useState<Bid[]>([])
  const [autoBids, setAutoBids] = useState<AutoBid[]>([])
  const [payments, setPayments] = useState<PaymentWithListing[]>([])
  const [receipts, setReceipts] = useState<ReceiptItem[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [completingUuid, setCompletingUuid] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [autoBidModal, setAutoBidModal] = useState<{ listingId: number; listingTitle: string; currentMax: number } | null>(null)
  const [nowMs, setNowMs] = useState(0)

  // ─── Derived data ───────────────────────────────────────────────────────

  const activeBids = useMemo(() => {
    if (!user) return []
    const seen = new Set<number>()
    return bids.filter(b => {
      if (seen.has(b.listing_id)) return false
      seen.add(b.listing_id)
      return b.listingStatus === 'active' || (!b.listingStatus && new Date(b.endTime ?? 0) > new Date())
    })
  }, [bids, user])

  const winningCount = useMemo(() => {
    if (!user) return 0
    return activeBids.filter(b =>
      b.winnerId === user.id ||
      (b.winnerId == null && b.currentBid != null && b.amount >= b.currentBid)
    ).length
  }, [activeBids, user])

  const outbidCount = useMemo(() => activeBids.length - winningCount, [activeBids.length, winningCount])

  const wonCount = useMemo(() => payments.length, [payments])

  const totalDonated = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments])

  const activeAutoBids = useMemo(() => autoBids.filter(a => a.is_active), [autoBids])

  const getAutoBidForListing = (listingId: number): AutoBid | undefined =>
    activeAutoBids.find(a => a.listing_id === listingId)

  // ─── Payment deadline helpers ──────────────────────────────────────────

  const pendingPayments = useMemo(() =>
    payments.filter(p => p.status === 'pending' && (nowMs > 0 ? new Date(p.payment_deadline).getTime() > nowMs : true)),
    [payments, nowMs],
  )

  const deadlineText = (deadline: string) => {
    const diff = new Date(deadline).getTime() - nowMs
    if (nowMs <= 0) return 'Pending'
    if (diff <= 0) return 'Past due'
    const hours = Math.floor(diff / 3_600_000)
    const minutes = Math.floor((diff % 3_600_000) / 60_000)
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`
    if (hours > 0) return `${hours}h ${minutes}m left`
    return `${minutes}m left`
  }

  // ─── API calls ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const [bidRes, autoBidRes, paymentsRes, receiptsRes] = await Promise.all([
        api.get<{ bids: Bid[]; stats: BidderStats }>('/bids/bidder').catch(() => ({ data: { bids: [] as Bid[], stats: { total: 0, totalSpent: 0, uniqueListings: 0 } } })),
        api.get<AutoBid[]>('/bids/auto-bids').catch(() => ({ data: [] as AutoBid[] })),
        api.get<{ data: PaymentWithListing[]; total: number }>('/payments/mine').catch(() => ({ data: { data: [] as PaymentWithListing[], total: 0 } })),
        api.get<{ data: ReceiptItem[] }>('/receipts/mine').catch(() => ({ data: { data: [] as ReceiptItem[] } })),
      ])
      setBids(bidRes.data.bids)
      setAutoBids(autoBidRes.data)
      setPayments(paymentsRes.data.data ?? [])
      setReceipts(receiptsRes.data.data ?? [])
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  // Tick every 60s for time-relative displays
  useEffect(() => {
    const id = window.setTimeout(() => setNowMs(Date.now()), 0)
    const iv = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => { window.clearTimeout(id); window.clearInterval(iv) }
  }, [])

  // Load dashboard data
  useEffect(() => { const id = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(id) }, [])

  // ─── Actions ───────────────────────────────────────────────────────────

  const confirmDelivery = async (listingUuid: string) => {
    setConfirming(listingUuid)
    try {
      await api.post(`/listings/${listingUuid}/confirm-delivery`)
      setMessage('Delivery confirmed!')
      await loadData()
    } catch (err) {
      setError((err as ApiError).message || 'Failed to confirm delivery.')
    } finally {
      setConfirming(null)
    }
  }

  const completePayment = async (uuid: string) => {
    setCompletingUuid(uuid)
    try {
      await api.post(`/payments/${uuid}/complete`)
      setMessage('Payment completed successfully.')
      await loadData()
    } catch (err) {
      setError((err as ApiError).message || 'Payment could not be completed')
    } finally {
      setCompletingUuid(null)
    }
  }

  const viewReceipt = async (paymentUuid: string) => {
    setReceiptLoading(true)
    try {
      const res = await api.get<Receipt>(`/payments/${paymentUuid}/receipt`)
      setReceipt(res.data)
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const saveAutoBid = async (listingId: number, amount: number) => {
    await api.post('/bids/auto-bids', { listingId, maxAmount: amount })
    const res = await api.get<AutoBid[]>('/bids/auto-bids')
    setAutoBids(res.data)
  }

  // ─── Loading / Error ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error && !message && bids.length === 0 && payments.length === 0) {
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
    { id: 'active-bids', label: 'Active Bids', icon: <Activity className="w-4 h-4" />, badge: activeBids.length },
    { id: 'won-auctions', label: 'Won Auctions', icon: <ShoppingBag className="w-4 h-4" />, badge: wonCount },
    { id: 'payment-history', label: 'Payment History', icon: <History className="w-4 h-4" /> },
  ]

  const mobileTabs = (
    <div className="flex md:hidden gap-1 p-1 rounded-xl mb-6" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab
        return (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
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

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ background: C.linen }}>
      <div className="flex">
        {/* Desktop sidebar */}
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

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

          {/* ───────────── ACTIVE BIDS ───────────── */}
          {activeTab === 'active-bids' && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-black" style={{ color: C.slate }}>Active Bids</h1>
                <p className="text-sm mt-1" style={{ color: C.muted }}>
                  Welcome back, {user ? maskUsername(user.username) : '…'}
                </p>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                      <Gavel className="w-5 h-5" style={{ color: C.emerald }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{activeBids.length}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Active Bids</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    {winningCount} winning · {outbidCount} outbid
                  </p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EEF2FF' }}>
                      <TrendingUp className="w-5 h-5" style={{ color: '#4F46E5' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{wonCount}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Auctions Won</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>All time</p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                      <DollarSign className="w-5 h-5" style={{ color: '#C2410C' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(totalDonated)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Donated</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>Across {new Set(payments.map(p => p.charity_name)).size} charities</p>
                </div>
              </div>

              {/* Active Bids Table */}
              {activeBids.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Gavel className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No Active Bids</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>You haven't placed any bids on active auctions yet.</p>
                  <Link to="/auctions"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    Browse Auctions <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.beige }}>
                    <h2 className="font-bold" style={{ color: C.slate }}>Active Listings</h2>
                    <button onClick={loadData}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Your Bid</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Highest Bid</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Time Left</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Auto-Bid</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBids.map((bid) => {
                          const isWinning = user && (
                            bid.winnerId === user.id ||
                            (bid.winnerId == null && bid.currentBid != null && bid.amount >= bid.currentBid)
                          )
                          const autoBid = getAutoBidForListing(bid.listing_id)
                          return (
                            <tr key={bid.id} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium" style={{ color: C.slate }}>
                                    {bid.listingTitle || `Listing #${bid.listing_id}`}
                                  </p>
                                  {bid.listingUuid && (
                                    <Link to={`/auctions/${bid.listingUuid}`} className="flex-shrink-0">
                                      <ExternalLink className="w-3.5 h-3.5" style={{ color: C.emerald }} />
                                    </Link>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {money(bid.amount)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono" style={{ color: C.slate }}>
                                {money(bid.currentBid ?? bid.amount)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  style={{
                                    background: isWinning ? C.emeraldLight : C.dangerLight,
                                    color: isWinning ? C.emerald : C.danger,
                                  }}>
                                  {isWinning ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                  {isWinning ? 'Winning' : 'Outbid'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-bold"
                                style={{ color: bid.endTime ? (timeLeftStr(bid.endTime, nowMs) === 'Ended' ? C.danger : C.slate) : C.muted }}>
                                {bid.endTime ? timeLeftStr(bid.endTime, nowMs) : '—'}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-xs font-bold" style={{ color: autoBid ? C.emerald : C.muted }}>
                                  {autoBid ? `On (${money(autoBid.max_amount)})` : 'Off'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {bid.listingUuid && (
                                    <Link to={`/auctions/${bid.listingUuid}`}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                      style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
                                      View <ExternalLink className="w-3 h-3" />
                                    </Link>
                                  )}
                                  <button onClick={() => setAutoBidModal({
                                    listingId: bid.listing_id,
                                    listingTitle: bid.listingTitle || `Listing #${bid.listing_id}`,
                                    currentMax: autoBid?.max_amount ?? 0,
                                  })}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                    style={{ border: `1px solid ${C.beige}`, color: C.emerald }}>
                                    <Pencil className="w-3 h-3" /> Auto-bid
                                  </button>
                                </div>
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

          {/* ───────────── WON AUCTIONS ───────────── */}
          {activeTab === 'won-auctions' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Won Auctions</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>
                    Welcome back, {user ? maskUsername(user.username) : '…'}
                  </p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {payments.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No Won Auctions Yet</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>When you win an auction, it will appear here.</p>
                </div>
              ) : (
                <>
                  {/* Pending payment offers */}
                  {pendingPayments.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <TimerReset className="w-4 h-4" style={{ color: '#C2410C' }} />
                        <h2 className="font-bold text-sm" style={{ color: C.slate }}>Pending Payment ({pendingPayments.length})</h2>
                      </div>
                      <div className="space-y-3">
                        {pendingPayments.map(payment => (
                          <div key={payment.uuid} className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                            <div className="p-5 flex flex-col sm:flex-row gap-4">
                              <div className="w-full sm:w-28 h-28 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                                style={{ background: C.linen }}>
                                {payment.listing_image ? (
                                  <img src={payment.listing_image} alt={payment.listing_title} className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon className="w-8 h-8" style={{ color: C.beige }} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                    style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                                    {deadlineText(payment.payment_deadline)}
                                  </span>
                                  <span className="text-[10px] font-bold" style={{ color: C.muted }}>
                                    Ref: {payment.payment_ref}
                                  </span>
                                </div>
                                <h3 className="font-bold" style={{ color: C.slate }}>{payment.listing_title}</h3>
                                <p className="text-xs mt-0.5" style={{ color: C.muted }}>Beneficiary: {payment.charity_name}</p>
                                <div className="flex items-center gap-4 mt-3">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Winning Bid</p>
                                    <p className="text-lg font-black font-mono" style={{ color: C.emerald }}>{money(payment.amount)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Deadline</p>
                                    <p className="text-xs font-bold" style={{ color: C.slate }}>
                                      {new Date(payment.payment_deadline).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex sm:flex-col gap-2 sm:w-36">
                                <button type="button" disabled={completingUuid === payment.uuid}
                                  onClick={() => completePayment(payment.uuid)}
                                  className="flex-1 sm:flex-none py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                                  style={{ background: C.emerald }}>
                                  {completingUuid === payment.uuid ? 'Processing…' : 'Pay Now →'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Paid / delivered items */}
                  {payments.filter(p => p.status === 'successful').length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle className="w-4 h-4" style={{ color: C.emerald }} />
                        <h2 className="font-bold text-sm" style={{ color: C.slate }}>Paid Items</h2>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {payments.filter(p => p.status === 'successful').map(payment => (
                          <div key={payment.uuid} className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                            <div className="h-40 flex items-center justify-center overflow-hidden"
                              style={{ background: C.linen }}>
                              {payment.listing_image ? (
                                <img src={payment.listing_image} alt={payment.listing_title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-center">
                                  <ImageIcon className="w-10 h-10 mx-auto mb-1" style={{ color: C.beige }} />
                                  <span className="text-[10px] font-bold" style={{ color: C.beige }}>Item Image</span>
                                </div>
                              )}
                            </div>
                            <div className="p-4">
                              <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
                                style={{ background: C.emeraldLight, color: C.emerald }}>
                                {payment.charity_name}
                              </span>
                              <h3 className="font-bold text-sm leading-tight" style={{ color: C.slate }}>
                                {payment.listing_title}
                              </h3>
                              <div className="mt-3 flex items-end justify-between">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Winning Bid</p>
                                  <p className="text-lg font-black font-mono" style={{ color: C.emerald }}>{money(payment.amount)}</p>
                                </div>
                                {payment.listing_status === 'delivered' ? (
                                  <button type="button"
                                    onClick={() => viewReceipt(payment.uuid)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
                                    style={{ background: C.emeraldLight, color: C.emerald }}>
                                    <FileText className="w-3 h-3" /> Receipt
                                  </button>
                                ) : payment.listing_status === 'shipped' ? (
                                  <button type="button"
                                    onClick={() => confirmDelivery(payment.listing_uuid)}
                                    disabled={confirming === payment.listing_uuid}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                    style={{ background: '#5B21B6' }}>
                                    {confirming === payment.listing_uuid
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <PackageCheck className="w-3 h-3" />}
                                    {confirming === payment.listing_uuid ? '…' : 'Item Received'}
                                  </button>
                                ) : (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full"
                                    style={{ background: '#FEF3C7', color: '#92400E' }}>
                                    <Clock className="w-3 h-3" /> Awaiting Shipment
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ───────────── PAYMENT HISTORY ───────────── */}
          {activeTab === 'payment-history' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Payment History</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>
                    Welcome back, {user ? maskUsername(user.username) : '…'}
                  </p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {payments.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <CreditCard className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No Payment History</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>When you win and pay for an auction, it will appear here.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Date</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item Won</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Amount Paid</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Charity</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Receipt</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(payment => {
                          const isPaid = payment.status === 'successful'
                          return (
                            <tr key={payment.uuid} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-6 py-4 text-xs font-medium" style={{ color: C.slate }}>
                                {new Date(payment.offered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium" style={{ color: C.slate }}>{payment.listing_title}</p>
                                  <Link to={`/auctions/${payment.listing_uuid}`} className="flex-shrink-0">
                                    <ExternalLink className="w-3 h-3" style={{ color: C.emerald }} />
                                  </Link>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {money(payment.amount)}
                              </td>
                              <td className="px-6 py-4 text-sm" style={{ color: C.slate }}>{payment.charity_name}</td>
                              <td className="px-6 py-4 text-center">
                                {isPaid && payment.listing_status === 'delivered' ? (
                                  <button onClick={() => viewReceipt(payment.uuid)}
                                    className="text-xs font-bold underline underline-offset-2 transition-colors"
                                    style={{ color: C.emerald }}>
                                    View PDF
                                  </button>
                                ) : (
                                  <span className="text-xs" style={{ color: C.muted }}>—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  style={{
                                    background: isPaid ? C.emeraldLight : '#FFF7ED',
                                    color: isPaid ? C.emerald : '#C2410C',
                                  }}>
                                  {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {isPaid ? (
                                    payment.listing_status === 'delivered' ? 'Delivered' : 'Paid'
                                  ) : (
                                    'Pending'
                                  )}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Receipts section */}
              {receipts.length > 0 && (
                <div className="mt-6 rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
                    <h2 className="font-bold" style={{ color: C.slate }}>Donation Receipts</h2>
                  </div>
                  <div className="divide-y" style={{ borderColor: C.beige }}>
                    {receipts.map(r => (
                      <div key={r.uuid} className="px-6 py-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm" style={{ color: C.slate }}>{r.item_title}</p>
                          <p className="text-xs mt-0.5" style={{ color: C.muted }}>{r.charity_name} · {money(r.amount)}</p>
                        </div>
                        <Link to={`/receipts/${r.uuid}`}
                          className="flex items-center gap-1 px-4 py-2 text-xs font-bold rounded-lg text-white transition-opacity hover:opacity-90"
                          style={{ background: C.emerald }}>
                          <FileText className="w-3 h-3" /> View Receipt
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}

      {autoBidModal && (
        <AutoBidModal
          listingTitle={autoBidModal.listingTitle}
          currentMax={autoBidModal.currentMax}
          onSave={async (amount) => saveAutoBid(autoBidModal.listingId, amount)}
          onClose={() => setAutoBidModal(null)}
        />
      )}

      {receiptLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-2xl bg-white px-8 py-6 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.emerald }} />
            <span className="text-sm font-bold" style={{ color: C.slate }}>Loading receipt…</span>
          </div>
        </div>
      )}
    </div>
  )
}
