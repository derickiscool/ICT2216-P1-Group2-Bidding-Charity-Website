// File: frontend/src/components/auctions/AuctionCard.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Flame, Clock } from 'lucide-react'

// Dummy type based on your App data
export interface AuctionDummy {
  id: number
  title: string
  charity: string
  bid: number
  endsIn: string
  urgent: boolean
  category: string
}

export default function AuctionCard({ auction }: { auction: AuctionDummy }) {
  const [saved, setSaved] = useState(false)

  // Using CSS Variables from theme.css where possible
  return (
    <div className="group relative rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
         style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      
      {/* Image area */}
      <div className="relative h-48 bg-slate-100 flex items-center justify-center overflow-hidden border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
        <span className="text-slate-400 text-sm font-medium">{auction.category} Image</span>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {auction.urgent && (
            <div className="flex items-center gap-1.5 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm" style={{ background: 'var(--bfg-danger)' }}>
              <Flame className="w-3 h-3" /> ENDING SOON
            </div>
          )}
        </div>

        {/* Watchlist Button */}
        <button
          onClick={(e) => { e.preventDefault(); setSaved(v => !v) }}
          className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          style={{ border: '1px solid var(--bfg-beige)' }}
        >
          <Heart className={`w-4 h-4 ${saved ? 'fill-current text-rose-500' : 'text-slate-400'}`} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mb-3"
              style={{ background: 'var(--bfg-mauve-light)', color: 'var(--bfg-mauve)' }}>
          {auction.charity}
        </span>
        
        <h3 className="text-base font-bold leading-snug mb-4 line-clamp-2" style={{ color: 'var(--bfg-slate)' }}>
          {auction.title}
        </h3>

        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--bfg-text-muted)' }}>Current Bid</p>
            <p className="text-xl font-black" style={{ color: 'var(--bfg-emerald)' }}>${auction.bid.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--bfg-text-muted)' }}>Ends In</p>
            <div className="flex items-center gap-1 font-mono text-sm font-bold" style={{ color: auction.urgent ? 'var(--bfg-danger)' : 'var(--bfg-slate)' }}>
              <Clock className="w-3.5 h-3.5" />
              {auction.endsIn}
            </div>
          </div>
        </div>

        <Link
          to={`/auctions/${auction.id}`}
          className="block w-full py-2.5 text-white text-sm font-semibold rounded-xl text-center transition-colors"
          style={{ background: 'var(--bfg-emerald)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}
        >
          Place Bid
        </Link>
      </div>
    </div>
  )
}