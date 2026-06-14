// File: frontend/src/pages/AuctionsPage.tsx
import { useState } from 'react'
import { Filter, Search, SlidersHorizontal } from 'lucide-react'
import AuctionCard, { AuctionDummy } from '../components/auctions/AuctionCard'

// Mock Data (Copied from your HomePage)
const MOCK_AUCTIONS: AuctionDummy[] = [
  { id: 1, title: 'Signed Premier League Jersey', charity: "Children's Hospital Trust", bid: 1250, endsIn: '00:42:17', urgent: true, category: 'Sports' },
  { id: 2, title: 'Private Dining Experience', charity: 'Food Bank Singapore', bid: 3800, endsIn: '01:05:33', urgent: true, category: 'Experiences' },
  { id: 3, title: 'Original Oil Painting', charity: 'Arts for Youth', bid: 720, endsIn: '02:14:09', urgent: false, category: 'Art' },
  { id: 4, title: 'Luxury Weekend Getaway', charity: 'Education Without Borders', bid: 5100, endsIn: '03:22:41', urgent: false, category: 'Travel' },
  { id: 5, title: 'Studio Recording Session', charity: 'Youth Music Trust', bid: 950, endsIn: '04:07:55', urgent: false, category: 'Experiences' },
  { id: 6, title: 'Corporate Box – Grand Prix', charity: "Children's Hospital Trust", bid: 4200, endsIn: '05:48:20', urgent: false, category: 'Sports' },
]

export default function AuctionsPage() {
  const [search, setSearch] = useState('')

  return (
    <div className="min-h-screen py-8 px-6" style={{ background: 'var(--bfg-linen)' }}>
      <div className="max-w-[1440px] mx-auto">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--bfg-slate)' }}>Browse Auctions</h1>
          <p style={{ color: 'var(--bfg-text-muted)' }}>Find unique items and experiences supporting verified charities.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="rounded-2xl p-6 sticky top-24" style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <Filter className="w-5 h-5" style={{ color: 'var(--bfg-slate)' }} />
                <h2 className="font-bold" style={{ color: 'var(--bfg-slate)' }}>Filters</h2>
              </div>

              {/* Filter: Category */}
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--bfg-text-muted)' }}>Category</h3>
                <div className="space-y-2.5">
                  {['All Items', 'Art & Collectibles', 'Experiences', 'Sports Memorabilia', 'Travel'].map(cat => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm font-medium" style={{ color: 'var(--bfg-slate)' }}>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter: Status */}
              <div className="mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--bfg-text-muted)' }}>Status</h3>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-sm font-medium" style={{ color: 'var(--bfg-slate)' }}>Live Now</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-sm font-medium" style={{ color: 'var(--bfg-slate)' }}>Ending Soon</span>
                  </label>
                </div>
              </div>

              <button className="w-full py-2 rounded-xl text-sm font-bold mt-4 transition-colors"
                      style={{ border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-linen)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Clear Filters
              </button>
            </div>
          </aside>

          {/* Main Grid Area */}
          <main className="flex-1">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              {/* Search */}
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--bfg-beige)' }} />
                <input type="text" placeholder="Search items or charities..." value={search} onChange={e => setSearch(e.target.value)}
                       className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
                       style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }}
                       onFocus={e => e.target.style.borderColor = 'var(--bfg-emerald)'}
                       onBlur={e => e.target.style.borderColor = 'var(--bfg-beige)'} />
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--bfg-text-muted)' }} />
                <select className="bg-transparent text-sm font-medium outline-none cursor-pointer" style={{ color: 'var(--bfg-slate)' }}>
                  <option>Ending Soonest</option>
                  <option>Newly Listed</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {MOCK_AUCTIONS.map(auction => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          </main>

        </div>
      </div>
    </div>
  )
}