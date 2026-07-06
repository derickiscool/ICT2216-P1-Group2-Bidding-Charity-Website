import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Flame, Clock } from 'lucide-react'
import type { Listing } from '../../types'

export interface AuctionDummy {
  id: number
  title: string
  charity: string
  bid: number
  endsIn: string
  urgent: boolean
  category: string
}

type AuctionLike = Listing | AuctionDummy

const isListing = (auction: AuctionLike): auction is Listing => 'current_bid' in auction

const timeLeft = (endTime: string, now: number): string => {
  const diff = new Date(endTime).getTime() - now
  if (diff <= 0) return 'Ended'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function AuctionCard({ auction }: { auction: AuctionLike }) {
  const [saved, setSaved] = useState(false)
  const [now, setNow] = useState(0)
  const urgent = isListing(auction) ? now > 0 && new Date(auction.end_time).getTime() - now < 3 * 60 * 60 * 1000 : auction.urgent
  const currentBid = isListing(auction) ? auction.current_bid : auction.bid
  const endsLabel = isListing(auction) ? (now > 0 ? timeLeft(auction.end_time, now) : '--:--:--') : auction.endsIn
  const charityName = isListing(auction) ? (auction.campaign?.charity?.name ?? auction.charityName ?? 'Verified Charity') : auction.charity
  const routeId = isListing(auction) ? (auction.uuid ?? auction.id) : auction.id

  useEffect(() => {
    const updateNow = () => setNow(Date.now())
    updateNow()
    const interval = window.setInterval(updateNow, 1000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="group relative rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
         style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      <div className="relative h-48 bg-slate-100 flex items-center justify-center overflow-hidden border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
        {isListing(auction) && auction.images?.[0] ? (
          <img src={auction.images[0]} alt={auction.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-slate-400 text-sm font-medium">{auction.category} Image</span>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {urgent && (
            <div className="flex items-center gap-1.5 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm" style={{ background: 'var(--bfg-danger)' }}>
              <Flame className="w-3 h-3" /> ENDING SOON
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); setSaved(v => !v) }}
          className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          style={{ border: '1px solid var(--bfg-beige)' }}
        >
          <Heart className={`w-4 h-4 ${saved ? 'fill-current text-rose-500' : 'text-slate-400'}`} />
        </button>
      </div>

      <div className="p-5">
        <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mb-3"
              style={{ background: 'var(--bfg-mauve-light)', color: 'var(--bfg-mauve)' }}>
          {charityName}
        </span>
        <h3 className="text-base font-bold leading-snug mb-4 line-clamp-2" style={{ color: 'var(--bfg-slate)' }}>
          {auction.title}
        </h3>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--bfg-text-muted)' }}>Current Bid</p>
            <p className="text-xl font-black" style={{ color: 'var(--bfg-emerald)' }}>${currentBid.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--bfg-text-muted)' }}>Ends In</p>
            <div className="flex items-center gap-1 font-mono text-sm font-bold" style={{ color: urgent ? 'var(--bfg-danger)' : 'var(--bfg-slate)' }}>
              <Clock className="w-3.5 h-3.5" />
              {endsLabel}
            </div>
          </div>
        </div>
        <Link to={`/auctions/${routeId}`} className="block w-full py-2.5 text-white text-sm font-semibold rounded-xl text-center transition-colors" style={{ background: 'var(--bfg-emerald)' }}>
          Place Bid
        </Link>
      </div>
    </div>
  )
}