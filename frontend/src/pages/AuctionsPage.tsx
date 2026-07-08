import { useEffect, useRef, useState } from 'react'
import { Filter, Loader2, Search, SlidersHorizontal, X, Check } from 'lucide-react'
import AuctionCard from '../components/auctions/AuctionCard'
import api from '../services/api'
import type { Listing } from '../types'

interface PublicCharity {
  id: number
  name: string
  description: string
}

const CATEGORIES = ['Sports', 'Experiences', 'Collectibles', 'Art', 'Electronics', 'Fashion']

export default function AuctionsPage() {
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [charityFilter, setCharityFilter] = useState<string[]>([])
  const [charitySearch, setCharitySearch] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [auctionStatus, setAuctionStatus] = useState<'all' | 'active' | 'ending_soon'>('active')
  const [sort, setSort] = useState('ending_soon')
  const [listings, setListings] = useState<Listing[]>([])
  const [charities, setCharities] = useState<PublicCharity[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nowRef = useRef(0)

  useEffect(() => {
    api.get<PublicCharity[]>('/charities/public')
      .then(res => setCharities(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    nowRef.current = Date.now()
    const params: Record<string, string> = { sort }
    if (search.trim()) params.q = search.trim()
    if (categories.length === 1) params.category = categories[0]
    if (priceMin !== '') params.price_min = priceMin
    if (priceMax !== '') params.price_max = priceMax

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get<{ data: Listing[] }>('/listings', { params })
        let data = res.data.data

        // Filter by category (client-side: match category against selected categories)
        if (categories.length > 0) {
          data = data.filter(l => categories.map(c => c.toLowerCase()).includes(l.category.toLowerCase()))
        }

        // Filter by charity (client-side: match charityName against selected organisations)
        if (charityFilter.length > 0) {
          data = data.filter(l => charityFilter.includes(l.charityName ?? ''))
        }

        // Filter by auction status
        if (auctionStatus === 'ending_soon') {
          data = data.filter(l => new Date(l.end_time).getTime() - nowRef.current < 3 * 60 * 60 * 1000)
        }
        // 'active' is already the default from backend; 'all' shows everything

        setListings(data)
        setError(null)
      } catch (err) {
        setError((err as { message?: string }).message || 'Failed to load auctions')
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, categories, charityFilter, priceMin, priceMax, auctionStatus, sort])

  const toggleCategory = (c: string) =>
    setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const toggleCharity = (name: string) =>
    setCharityFilter(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])

  const hasActiveFilters = categories.length > 0 || charityFilter.length > 0 || priceMin || priceMax || auctionStatus !== 'active'

  function clearAll() {
    setSearch('')
    setCategories([])
    setCharityFilter([])
    setCharitySearch('')
    setPriceMin('')
    setPriceMax('')
    setAuctionStatus('active')
    setSort('ending_soon')
  }

  // Derive unique charity names from public charities for the sidebar
  const sidebarCharities = charities
    .map(c => c.name)
    .filter(name => name.toLowerCase().includes(charitySearch.toLowerCase()))
    .sort()

  const sectionHead = 'text-xs font-black uppercase tracking-wider mb-3'
  const sectionStyle = { color: 'var(--bfg-text-muted)' }

  return (
    <div className="min-h-screen py-8 px-6" style={{ background: 'var(--bfg-linen)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--bfg-slate)' }}>Browse Auctions</h1>
          <p style={{ color: 'var(--bfg-text-muted)' }}>Find unique items and experiences supporting verified charities.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* ── Sidebar ── */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="rounded-2xl p-6 sticky top-24" style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center justify-between mb-6 pb-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5" style={{ color: 'var(--bfg-slate)' }} />
                  <h2 className="font-bold" style={{ color: 'var(--bfg-slate)' }}>Filters</h2>
                </div>
                {hasActiveFilters && (
                  <button onClick={clearAll} className="text-xs font-semibold flex items-center gap-1" style={{ color: '#B91C1C' }}>
                    <X className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {/* CATEGORY */}
              <div className="mb-6">
                <h3 className={sectionHead} style={sectionStyle}>Category</h3>
                <div className="space-y-2">
                  {CATEGORIES.map(c => (
                    <label key={c} className="flex items-center gap-2.5 cursor-pointer group">
                      <span
                        onClick={() => toggleCategory(c)}
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: categories.includes(c) ? 'var(--bfg-emerald)' : 'transparent', border: `1.5px solid ${categories.includes(c) ? 'var(--bfg-emerald)' : 'var(--bfg-beige)'}` }}
                      >
                        {categories.includes(c) && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--bfg-slate)' }}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* CHARITY */}
              <div className="mb-6">
                <h3 className={sectionHead} style={sectionStyle}>Charity</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--bfg-beige)' }} />
                  <input
                    type="text"
                    placeholder="Search charities..."
                    value={charitySearch}
                    onChange={e => setCharitySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none"
                    style={{ border: '1px solid var(--bfg-beige)', background: 'var(--bfg-linen)', color: 'var(--bfg-slate)' }}
                  />
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {sidebarCharities.length === 0 && (
                    <p className="text-xs" style={{ color: 'var(--bfg-text-muted)' }}>No charities found</p>
                  )}
                  {sidebarCharities.map(name => (
                    <label key={name} className="flex items-center gap-2.5 cursor-pointer">
                      <span
                        onClick={() => toggleCharity(name)}
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: charityFilter.includes(name) ? 'var(--bfg-emerald)' : 'transparent', border: `1.5px solid ${charityFilter.includes(name) ? 'var(--bfg-emerald)' : 'var(--bfg-beige)'}` }}
                      >
                        {charityFilter.includes(name) && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className="text-sm leading-tight" style={{ color: 'var(--bfg-slate)' }}>{name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* AUCTION STATUS */}
              <div className="mb-6">
                <h3 className={sectionHead} style={sectionStyle}>Auction Status</h3>
                <div className="space-y-2">
                  {(['active', 'ending_soon', 'all'] as const).map(s => (
                    <label key={s} className="flex items-center gap-2.5 cursor-pointer">
                      <span
                        onClick={() => setAuctionStatus(s)}
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ border: `1.5px solid ${auctionStatus === s ? 'var(--bfg-emerald)' : 'var(--bfg-beige)'}`, background: auctionStatus === s ? 'var(--bfg-emerald)' : 'transparent' }}
                      >
                        {auctionStatus === s && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm capitalize" style={{ color: 'var(--bfg-slate)' }}>
                        {s === 'ending_soon' ? 'Ending Soon' : s === 'all' ? 'All' : 'Active'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* PRICE RANGE */}
              <div className="mb-6">
                <h3 className={sectionHead} style={sectionStyle}>Price Range (SGD)</h3>
                <div className="flex gap-2">
                  <input type="number" min="0" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }} />
                  <input type="number" min="0" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)', background: '#FFFFFF', color: 'var(--bfg-slate)' }} />
                </div>
              </div>

              {hasActiveFilters && (
                <button onClick={clearAll}
                  className="w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--bfg-emerald)' }}>
                  Reset Filters
                </button>
              )}
            </div>
          </aside>

          {/* ── Main ── */}
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
                  Showing {listings.length} {listings.length === 1 ? 'auction' : 'auctions'}
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
