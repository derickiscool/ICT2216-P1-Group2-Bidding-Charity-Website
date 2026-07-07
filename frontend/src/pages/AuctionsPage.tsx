import { useEffect, useState } from 'react'
import { Filter, Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import AuctionCard from '../components/auctions/AuctionCard'
import api from '../services/api'
import type { Listing } from '../types'

interface PublicCampaign {
  id: number
  name: string
}

const CATEGORIES = ['Sports', 'Experiences', 'Collectibles', 'Art', 'Electronics', 'Fashion']

const END_BEFORE_OPTIONS = [
  { label: 'Any time', value: '' },
  { label: 'Ending in 1 hour', value: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  { label: 'Ending in 24 hours', value: () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
  { label: 'Ending in 3 days', value: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
  { label: 'Ending this week', value: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
]

export default function AuctionsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [condition, setCondition] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [endBeforeKey, setEndBeforeKey] = useState('')
  const [sort, setSort] = useState('ending_soon')
  const [listings, setListings] = useState<Listing[]>([])
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<PublicCampaign[]>('/charities/campaigns/public')
      .then(res => setCampaigns(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const endOption = END_BEFORE_OPTIONS.find(o => o.label === endBeforeKey)
    const endBefore = endOption && typeof endOption.value === 'function' ? endOption.value() : undefined

    const params: Record<string, string> = { sort }
    if (search.trim()) params.q = search.trim()
    if (category) params.category = category
    if (condition) params.condition = condition
    if (priceMin !== '') params.price_min = priceMin
    if (priceMax !== '') params.price_max = priceMax
    if (campaignId) params.campaign_id = campaignId
    if (endBefore) params.end_before = endBefore

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get<{ data: Listing[] }>('/listings', { params })
        setListings(res.data.data)
        setError(null)
      } catch (err) {
        setError((err as { message?: string }).message || 'Failed to load auctions')
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, category, condition, priceMin, priceMax, campaignId, endBeforeKey, sort])

  const hasActiveFilters = category || condition || priceMin || priceMax || campaignId || endBeforeKey

  function clearAll() {
    setSearch('')
    setCategory('')
    setCondition('')
    setPriceMin('')
    setPriceMax('')
    setCampaignId('')
    setEndBeforeKey('')
    setSort('ending_soon')
  }

  return (
    <div className="min-h-screen py-8 px-6" style={{ background: 'var(--bfg-linen)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--bfg-slate)' }}>Browse Auctions</h1>
          <p style={{ color: 'var(--bfg-text-muted)' }}>Find unique items and experiences supporting verified charities.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* ── Sidebar filters ── */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="rounded-2xl p-6 sticky top-24" style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center justify-between mb-6 pb-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5" style={{ color: 'var(--bfg-slate)' }} />
                  <h2 className="font-bold" style={{ color: 'var(--bfg-slate)' }}>Filters</h2>
                </div>
                {hasActiveFilters && (
                  <button onClick={clearAll} className="text-xs font-semibold flex items-center gap-1" style={{ color: '#B91C1C' }}>
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>

              {/* Category */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--bfg-text-muted)' }}>Category</h3>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }}>
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Condition */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--bfg-text-muted)' }}>Item Condition</h3>
                <select value={condition} onChange={e => setCondition(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }}>
                  <option value="">All Conditions</option>
                  <option value="new">New</option>
                  <option value="like_new">Like New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                </select>
              </div>

              {/* Campaign */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--bfg-text-muted)' }}>Campaign</h3>
                <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }}>
                  <option value="">All Campaigns</option>
                  {campaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>

              {/* Price range */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--bfg-text-muted)' }}>Price Range (SGD)</h3>
                <div className="flex gap-2">
                  <input type="number" min="0" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }} />
                  <input type="number" min="0" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }} />
                </div>
              </div>

              {/* End time */}
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--bfg-text-muted)' }}>Auction End Time</h3>
                <select value={endBeforeKey} onChange={e => setEndBeforeKey(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }}>
                  {END_BEFORE_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--bfg-beige)' }} />
                <input type="text" placeholder="Search by name, description or charity..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }} />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--bfg-text-muted)' }} />
                <select value={sort} onChange={e => setSort(e.target.value)} className="bg-transparent text-sm font-medium outline-none cursor-pointer" style={{ color: 'var(--bfg-slate)' }}>
                  <option value="ending_soon">Ending Soonest</option>
                  <option value="newest">Newly Listed</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>
            </div>

            {error && <div className="mb-4 rounded-xl p-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}

            {loading ? (
              <div className="flex items-center justify-center py-20" style={{ color: 'var(--bfg-text-muted)' }}>
                <Loader2 className="w-6 h-6 animate-spin mr-3" />
                <span className="text-sm">Loading auctions...</span>
              </div>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: 'var(--bfg-text-muted)' }}>
                  {listings.length} {listings.length === 1 ? 'auction' : 'auctions'} found
                </p>
                {listings.length === 0 ? (
                  <div className="text-center py-20" style={{ color: 'var(--bfg-text-muted)' }}>
                    <p className="font-semibold mb-1" style={{ color: 'var(--bfg-slate)' }}>No auctions found</p>
                    <p className="text-sm">Try adjusting your search or filters.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {listings.map(auction => <AuctionCard key={auction.id} auction={auction} />)}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
