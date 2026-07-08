// File: frontend/src/pages/HomePage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ArrowRight, Shield, Zap, Users, TrendingUp } from 'lucide-react'
import AuctionCard from '../components/auctions/AuctionCard'
import api from '../services/api'
import type { Listing } from '../types'

// ─── Mock Data ───────────────────────────────────────────────────────────────
const LIVE_ACTIVITY = [
  { user: 'b***r42', action: 'bid $1,250 on Signed Jersey', time: '10s' },
  { user: 'm***e19', action: 'bid $3,800 on Dining Experience', time: '42s' },
  { user: 'j***n07', action: 'was outbid on Oil Painting', time: '1m' },
  { user: 's***h33', action: 'bid $5,100 on Weekend Getaway', time: '2m' },
  { user: 'a***s61', action: 'joined watchlist: Grand Prix Box', time: '3m' },
]

const STATS = [
  { label: 'Active Auctions', value: '124', icon: Zap },
  { label: 'Verified Charities', value: '43', icon: Shield },
  { label: 'Total Raised', value: '$2.4M', icon: TrendingUp },
  { label: 'Bidders Online', value: '892', icon: Users },
]

const FEATURED_COUNTDOWN = [
  { value: '00', label: 'DD' },
  { value: '42', label: 'HH' },
  { value: '17', label: 'MM' },
  { value: '08', label: 'SS' },
]

// ─── Leaderboard Strip ────────────────────────────────────────────────────────
function LeaderboardStrip({ listings }: { listings: Listing[] }) {
  return (
    <div className="border-b" style={{ background: '#1F2A2A', borderColor: 'rgba(187,176,155,0.1)' }}>
      <div className="max-w-[1440px] mx-auto px-6 py-2.5 flex items-center gap-4 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--bfg-danger)' }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--bfg-danger)' }}>Live</span>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
          {listings.map((l, i) => (
            <div key={l.uuid ?? l.id} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors cursor-pointer"
                 style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(187,176,155,0.2)' }}>
              <span className="text-[10px] font-mono" style={{ color: 'var(--bfg-beige)' }}>#{i + 1}</span>
              <span className="text-xs max-w-[120px] truncate" style={{ color: 'var(--bfg-linen)' }}>{l.title}</span>
              <span className="text-xs font-semibold text-white">${l.current_bid.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function countdownParts(endTime: string, now: number) {
  const diff = Math.max(0, new Date(endTime).getTime() - now)
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)
  return [
    { value: String(days).padStart(2, '0'), label: 'DD' },
    { value: String(hours).padStart(2, '0'), label: 'HH' },
    { value: String(minutes).padStart(2, '0'), label: 'MM' },
    { value: String(seconds).padStart(2, '0'), label: 'SS' },
  ]
}

function Hero({ featured }: { featured: Listing | undefined }) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])
  const countdown = featured && now > 0 ? countdownParts(featured.end_time, now) : FEATURED_COUNTDOWN

  return (
    <section className="relative overflow-hidden py-20 px-6" style={{ background: 'linear-gradient(135deg, #1C2C2B 0%, #223433 46%, #142220 100%)' }}>
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute -top-32 -right-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(4,120,87,0.25)' }} />
      <div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(187,176,155,0.12)' }} />

      <div className="relative max-w-[1440px] mx-auto grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_420px]">
        <div className="text-center lg:text-left max-w-3xl mx-auto lg:mx-0">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.18)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--bfg-emerald-light)' }} />
            <span className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--bfg-linen)' }}>New campaigns added today</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6 text-white">
            Bid on great items.<br />
            <span style={{ color: 'var(--bfg-beige)' }}>Support great causes.</span>
          </h1>

          <p className="text-lg leading-relaxed mb-10 max-w-2xl mx-auto lg:mx-0" style={{ color: '#AFC1BF' }}>
            Real-time charity auctions connecting generous bidders with verified organisations. Every bid makes a visible difference.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
            <Link to="/auctions" className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-950/20"
                  style={{ background: 'var(--bfg-emerald)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
              Browse Auctions <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/auctions" className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-medium rounded-xl transition-colors backdrop-blur-sm"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.22)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
              <Clock className="w-4 h-4" style={{ color: 'var(--bfg-beige)' }} /> View Ending Soon
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-10 border-t w-full max-w-4xl mx-auto lg:mx-0" style={{ borderColor: 'rgba(187,176,155,0.15)' }}>
            {STATS.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center lg:items-start">
                <Icon className="w-5 h-5 mb-3" style={{ color: 'var(--bfg-emerald-light)' }} />
                <p className="text-2xl font-bold text-white mb-1">{value}</p>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--bfg-beige)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Featured spotlight card */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[380px] rounded-[28px] p-5 shadow-2xl backdrop-blur-md" style={{ background: 'rgba(12, 23, 22, 0.62)', border: '1px solid rgba(187,176,155,0.16)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--bfg-beige)' }}>Ending Soonest</span>
              </div>
              <span className="text-[10px] text-slate-200 bg-white/10 border border-white/10 rounded px-1.5 py-0.5 font-mono">
                LIVE
              </span>
            </div>

            <div className="h-36 rounded-2xl flex flex-col items-center justify-center mb-4 border" style={{ background: 'linear-gradient(145deg, rgba(7, 37, 35, 0.95), rgba(31, 56, 54, 0.95))', borderColor: 'rgba(187,176,155,0.16)' }}>
              <svg className="w-8 h-8 mb-1.5" style={{ color: 'rgba(255,255,255,0.32)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Item image</span>
            </div>

            <h3 className="text-sm font-semibold text-white mb-0.5">{featured ? featured.title : 'Signed Premier League Jersey'}</h3>
            <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Benefits: {featured ? (featured.charityName ?? 'Verified Charity') : "Children's Hospital Trust"}
            </p>

            <div className="flex items-center gap-1.5 mb-4">
              {countdown.map(({ value, label }, i) => (
                <div key={i} className="flex items-center">
                  <div className="rounded-xl px-2.5 py-1.5 text-center min-w-[36px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(187,176,155,0.14)' }}>
                    <span className="text-base font-bold font-mono text-white block">{value}</span>
                    <span className="text-[8px] uppercase tracking-wider block mt-0.5" style={{ color: 'rgba(255,255,255,0.36)' }}>
                      {label}
                    </span>
                  </div>
                  {i < 3 && <span className="mx-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>:</span>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.42)' }}>Current Bid</p>
                <p className="text-xl font-bold text-white">${(featured ? featured.current_bid : 1250).toLocaleString()}</p>
              </div>
              <Link to={featured ? `/auctions/${featured.uuid}` : '/auctions'}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
                style={{ background: 'var(--bfg-emerald)', color: 'white' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
                Bid Now →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Active Auctions (With Sidebar) ───────────────────────────────────────────
function ActiveAuctions({ listings }: { listings: Listing[] }) {
  return (
    <section className="py-20 px-6" style={{ background: 'var(--bfg-linen)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--bfg-slate)' }}>Featured Auctions</h2>
            <p className="text-sm" style={{ color: 'var(--bfg-text-muted)' }}>Items ending soon across all charity campaigns</p>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Main Grid */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--bfg-text-muted)' }}>No active auctions right now.</p>
            )}
            {listings.map((auction) => (
              <AuctionCard key={auction.uuid ?? auction.id} auction={auction} />
            ))}
          </div>

          {/* Live Activity Sidebar */}
          <aside className="hidden xl:block w-72 flex-shrink-0">
            <div className="rounded-2xl p-5 sticky top-24 shadow-sm" style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center gap-2 mb-6 pb-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--bfg-emerald)' }} />
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--bfg-slate)' }}>Live Activity</h3>
              </div>
              
              <div className="space-y-5">
                {LIVE_ACTIVITY.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold mt-0.5"
                         style={{ background: 'var(--bfg-linen)', color: 'var(--bfg-slate)', border: '1px solid var(--bfg-beige)' }}>
                      {item.user.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs leading-snug" style={{ color: 'var(--bfg-slate)' }}>
                        <span className="font-mono font-bold">{item.user}</span>{' '}
                        <span style={{ color: 'var(--bfg-text-muted)' }}>{item.action}</span>
                      </p>
                      <p className="text-[10px] mt-1 font-medium uppercase tracking-wider" style={{ color: 'var(--bfg-beige)' }}>{item.time} ago</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/auctions" className="block mt-6 pt-4 border-t text-center text-xs font-bold transition-colors"
                    style={{ borderColor: 'var(--bfg-beige)', color: 'var(--bfg-emerald)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--bfg-emerald-dark)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--bfg-emerald)'}>
                View all activity →
              </Link>
            </div>
          </aside>
        </div>

        <div className="mt-12 flex justify-center xl:justify-start">
          <Link to="/auctions" className="inline-flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-colors shadow-sm"
                style={{ background: '#FFFFFF', border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-linen)'}
                onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}>
            View All Auctions <ArrowRight className="w-4 h-4" style={{ color: 'var(--bfg-text-muted)' }} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: '01', title: 'Browse Campaigns', desc: 'Explore items donated by individuals and businesses to support verified charities.' },
    { num: '02', title: 'Place Your Bid', desc: 'Bid on items you love in real time, or set an auto-bid limit and let us keep you ahead.' },
    { num: '03', title: 'Support a Cause', desc: 'When you win, your payment goes directly to the verified charity linked to that auction.' }
  ]

  return (
    <section className="py-20 px-6 border-t" style={{ background: '#FFFFFF', borderColor: 'var(--bfg-beige)' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>How it works</h2>
          <p style={{ color: 'var(--bfg-text-muted)' }}>Three simple steps to make a real difference</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
              <span className="absolute -top-4 -right-2 text-8xl font-black select-none leading-none opacity-10" style={{ color: 'var(--bfg-beige)' }}>{step.num}</span>
              <div className="w-12 h-12 rounded-xl text-white text-base font-bold flex items-center justify-center mb-6 shadow-sm" style={{ background: 'var(--bfg-emerald)' }}>
                {step.num}
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--bfg-text-muted)' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA Banner ───────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: 'var(--bfg-slate)' }}>
      <div className="relative max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-8" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(187,176,155,0.2)' }}>
          <Shield className="w-4 h-4" style={{ color: 'var(--bfg-beige)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--bfg-beige)' }}>All charities are securely verified</span>
        </div>
        <h2 className="text-4xl font-bold text-white mb-6 leading-tight">Ready to make your bid matter?</h2>
        <p className="text-lg mb-10 leading-relaxed" style={{ color: '#9DB5B5' }}>
          Join thousands of bidders supporting verified charities through transparent, real-time auctions. Your next bid could change someone's life.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/register" className="px-8 py-3.5 text-white font-semibold rounded-xl transition-colors shadow-sm"
                style={{ background: 'var(--bfg-emerald)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
            Create Free Account
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([])

  useEffect(() => {
    api.get<{ data: Listing[] }>('/listings')
      .then(res => {
        const sorted = [...res.data.data].sort(
          (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime(),
        )
        setListings(sorted.slice(0, 3))
      })
      .catch(() => setListings([]))
  }, [])

  return (
    <div className="bg-white">
      <LeaderboardStrip listings={listings} />
      <Hero featured={listings[0]} />
      <ActiveAuctions listings={listings} />
      <HowItWorks />
      <CTABanner />
    </div>
  )
}
