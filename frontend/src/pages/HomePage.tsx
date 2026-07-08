// File: frontend/src/pages/HomePage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ArrowRight, Shield, Zap, TrendingUp } from 'lucide-react'
import AuctionCard from '../components/auctions/AuctionCard'
import api from '../services/api'
import type { Listing } from '../types'

// ─── Mock Data ───────────────────────────────────────────────────────────────

// ─── Hero Section ─────────────────────────────────────────────────────────────

function Hero({ stats }: { stats: { activeAuctions: string, verifiedCharities: string, totalRaised: string, endingSoon: string } }) {
  return (
    <section className="relative overflow-hidden py-20 px-6" style={{ background: 'linear-gradient(135deg, #1C2C2B 0%, #223433 46%, #142220 100%)' }}>
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute -top-32 -right-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(4,120,87,0.25)' }} />
      <div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(187,176,155,0.12)' }} />

      <div className="relative max-w-[1440px] mx-auto flex items-center justify-center">
        <div className="text-center max-w-3xl mx-auto">
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

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auctions" className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-950/20"
                  style={{ background: 'var(--bfg-emerald)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
              Browse Auctions <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-10 border-t w-full max-w-4xl mx-auto lg:mx-0" style={{ borderColor: 'rgba(187,176,155,0.15)' }}>
            {[
              { label: 'Active Auctions', value: stats.activeAuctions, icon: Zap },
              { label: 'Verified Charities', value: stats.verifiedCharities, icon: Shield },
              { label: 'Total Raised', value: stats.totalRaised, icon: TrendingUp },
              { label: 'Ending Soon', value: stats.endingSoon, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center">
                <Icon className="w-5 h-5 mb-3" style={{ color: 'var(--bfg-emerald-light)' }} />
                <p className="text-2xl font-bold text-white mb-1">{value}</p>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--bfg-beige)' }}>{label}</p>
              </div>
            ))}
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
  const [stats, setStats] = useState({
    activeAuctions: '0',
    verifiedCharities: '0',
    totalRaised: '$0',
    endingSoon: '0'
  })

  useEffect(() => {
    Promise.all([
      api.get<{ data: Listing[] }>('/listings').catch(() => ({ data: { data: [] as Listing[] } })),
      api.get<{ totalRaised?: number }[]>('/charities/public').catch(() => ({ data: [] }))
    ]).then(([listingsRes, charitiesRes]) => {
      const allListings = listingsRes.data?.data || []
      const charities = charitiesRes.data || []
      
      const sorted = [...allListings].sort(
        (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime(),
      )
      setListings(sorted.slice(0, 3))
      
      const active = allListings.length
      const endingSoon = allListings.filter(
        l => new Date(l.end_time).getTime() - Date.now() < 24 * 60 * 60 * 1000
      ).length
      const raised = charities.reduce((sum, c: { totalRaised?: number }) => sum + (c.totalRaised || 0), 0)

      setStats({
        activeAuctions: active.toString(),
        verifiedCharities: charities.length.toString(),
        totalRaised: '$' + raised.toLocaleString(),
        endingSoon: endingSoon.toString(),
      })
    })
  }, [])

  return (
    <div className="bg-white">
      <Hero stats={stats} />
      <ActiveAuctions listings={listings} />
      <HowItWorks />
      <CTABanner />
    </div>
  )
}
