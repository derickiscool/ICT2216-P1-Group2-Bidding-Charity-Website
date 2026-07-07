import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, Heart, CheckCircle } from 'lucide-react'

const FEATURES = [
  {
    icon: Shield,
    title: 'Trusted Charity Campaigns',
    desc: 'Every charity on BidForGood goes through a verification process before creating campaigns. Bidders can give with confidence knowing their support reaches real, approved organisations.',
  },
  {
    icon: Zap,
    title: 'Real-Time Auctions',
    desc: 'Live countdown timers, instant bid updates via WebSocket, and outbid notifications keep every auction exciting. No refreshing needed; the platform updates in real time.',
  },
  {
    icon: Heart,
    title: 'Transparent Giving',
    desc: 'Every transaction is linked to a specific campaign and charity. Winning bidders receive a receipt confirming exactly which cause their payment supported.',
  },
]

const STEPS = [
  {
    title: 'Charities Create Campaigns',
    desc: 'Approved charity organisations set up fundraising campaigns that auction listings can be linked to. Each campaign has a clear goal and timeline.',
  },
  {
    title: 'Donors List Auction Items',
    desc: 'Generous donors contribute items, experiences, or services as auction listings tied to a campaign. Items are reviewed before going live.',
  },
  {
    title: 'Bidders Support Causes',
    desc: 'Bidders compete in real-time auctions on items they love. When they win, their payment goes directly to the charity behind that campaign.',
  },
]

export default function AboutPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-24 px-6" style={{ background: 'linear-gradient(135deg, #1C2C2B 0%, #223433 46%, #142220 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute -top-32 -right-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(4,120,87,0.25)' }} />
        <div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(187,176,155,0.12)' }} />

        <div className="relative max-w-[1440px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6"
               style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.18)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bfg-emerald-light)' }} />
            <span className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--bfg-linen)' }}>About BidForGood</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight tracking-tight mb-6">
            Connecting bidders with<br />
            <span style={{ color: 'var(--bfg-beige)' }}>causes that matter.</span>
          </h1>

          <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: '#AFC1BF' }}>
            BidForGood is a real-time charity auction platform that brings together generous bidders, verified charity organisations, and the items that make a difference.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auctions"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-colors shadow-lg"
              style={{ background: 'var(--bfg-emerald)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
              Browse Auctions <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/charities"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-medium rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.22)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
              View Charities
            </Link>
          </div>

        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="py-20 px-6" style={{ background: 'var(--bfg-linen)' }}>
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>Why BidForGood</h2>
            <p style={{ color: 'var(--bfg-text-muted)' }}>Built from the ground up to make charitable giving easy, transparent, and exciting</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl p-8 bg-white" style={{ border: '1px solid var(--bfg-beige)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 shadow-sm"
                     style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--bfg-emerald)' }} />
                </div>
                <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--bfg-text-muted)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6 border-t" style={{ background: '#FFFFFF', borderColor: 'var(--bfg-beige)' }}>
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>How It Works</h2>
            <p style={{ color: 'var(--bfg-text-muted)' }}>Three simple steps from campaign to winning bid</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={i} className="rounded-2xl p-8" style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--bfg-text-muted)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-24 px-6 overflow-hidden" style={{ background: 'var(--bfg-slate)' }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-8"
               style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(187,176,155,0.2)' }}>
            <CheckCircle className="w-4 h-4" style={{ color: 'var(--bfg-beige)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--bfg-beige)' }}>All charities are securely verified</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-6">Ready to support a cause?</h2>
          <p className="text-lg mb-10 leading-relaxed" style={{ color: '#9DB5B5' }}>
            Browse active auctions and place a bid on something you love. Every winning bid goes directly to a verified charity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auctions"
              className="px-8 py-3.5 text-white font-semibold rounded-xl transition-colors shadow-sm inline-flex items-center gap-2"
              style={{ background: 'var(--bfg-emerald)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-emerald-dark)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-emerald)'}>
              Browse Auctions <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/charities"
              className="px-8 py-3.5 font-medium rounded-xl transition-colors inline-flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.22)', color: 'white' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
              View Charities
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
