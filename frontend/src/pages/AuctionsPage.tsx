import { useEffect, useState } from 'react'
import { Filter, Search, SlidersHorizontal } from 'lucide-react'
import AuctionCard from '../components/auctions/AuctionCard'
import api from '../services/api'
import type { Listing } from '../types'

export default function AuctionsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<{ data: Listing[] }>('/listings', { params: { q: search || undefined, category: category || undefined } })
        setListings(res.data.data)
        setError(null)
      } catch (err) {
        setError((err as { message?: string }).message || 'Failed to load auctions')
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, category])

  return (
    <div className="min-h-screen py-8 px-6" style={{ background: 'var(--bfg-linen)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--bfg-slate)' }}>Browse Auctions</h1>
          <p style={{ color: 'var(--bfg-text-muted)' }}>Find unique items and experiences supporting verified charities.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="rounded-2xl p-6 sticky top-24" style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <Filter className="w-5 h-5" style={{ color: 'var(--bfg-slate)' }} />
                <h2 className="font-bold" style={{ color: 'var(--bfg-slate)' }}>Filters</h2>
              </div>
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--bfg-text-muted)' }}>Category</h3>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid var(--bfg-beige)' }}>
                  <option value="">All Items</option>
                  <option value="Sports">Sports</option>
                  <option value="Experiences">Experiences</option>
                  <option value="Art">Art</option>
                  <option value="Collectibles">Collectibles</option>
                </select>
              </div>
              <button onClick={() => { setCategory(''); setSearch('') }} className="w-full py-2 rounded-xl text-sm font-bold mt-4 transition-colors" style={{ border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }}>
                Clear Filters
              </button>
            </div>
          </aside>

          <main className="flex-1">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--bfg-beige)' }} />
                <input type="text" placeholder="Search active listings..." value={search} onChange={e => setSearch(e.target.value)}
                       className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                       style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }} />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--bfg-text-muted)' }} />
                <select className="bg-transparent text-sm font-medium outline-none cursor-pointer" style={{ color: 'var(--bfg-slate)' }}>
                  <option>Ending Soonest</option>
                  <option>Newly Listed</option>
                </select>
              </div>
            </div>
            {error && <div className="mb-4 rounded-xl p-3 text-sm" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {listings.map(auction => <AuctionCard key={auction.id} auction={auction} />)}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
