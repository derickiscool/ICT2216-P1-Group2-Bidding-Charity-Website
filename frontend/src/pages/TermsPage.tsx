import type { ReactNode } from 'react'

function LegalHero({ title, updated }: { title: string; updated: string }) {
  return (
    <section className="relative overflow-hidden py-20 px-6" style={{ background: 'linear-gradient(135deg, #1C2C2B 0%, #223433 46%, #142220 100%)' }}>
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute -top-32 -right-28 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(4,120,87,0.2)' }} />
      <div className="relative max-w-[1440px] mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(187,176,155,0.18)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bfg-emerald-light)' }} />
          <span className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--bfg-linen)' }}>BidForGood</span>
        </div>
        <h1 className="text-5xl font-bold text-white mb-4">{title}</h1>
        <p className="text-sm" style={{ color: 'var(--bfg-beige)' }}>Last updated: {updated}</p>
      </div>
    </section>
  )
}

function LegalSection({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-8 bg-white relative overflow-hidden" style={{ border: '1px solid var(--bfg-beige)' }}>
      <span className="absolute -top-3 -right-1 text-7xl font-black select-none leading-none opacity-[0.06]"
            style={{ color: 'var(--bfg-beige)' }}>{num}</span>
      <div className="flex items-start gap-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
             style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)', color: 'var(--bfg-slate)' }}>
          {num}
        </div>
        <div>
          <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>{title}</h2>
          <div className="text-sm leading-relaxed space-y-2" style={{ color: 'var(--bfg-text-muted)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    content: (
      <p>By accessing or using BidForGood, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use the platform. BidForGood is an educational project developed for ICT2216 at Singapore Institute of Technology and is not a commercial service.</p>
    ),
  },
  {
    title: 'User Accounts',
    content: (
      <>
        <p>You are responsible for maintaining the confidentiality of your login credentials. You must not share your password or permit others to access your account. You agree to provide accurate and current information when registering.</p>
        <p>We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or misuse the platform. Account lockout occurs automatically after repeated failed login attempts as a security measure.</p>
      </>
    ),
  },
  {
    title: 'Auction Listings',
    content: (
      <>
        <p>Auction listings must be linked to an active, approved charity campaign. All listing details (including starting price, auction start and end times, and campaign association) are locked once the auction becomes active and cannot be modified.</p>
        <p>Listings submitted by donors are reviewed before going live. The platform reserves the right to reject any listing that does not meet quality or policy standards.</p>
      </>
    ),
  },
  {
    title: 'Bidding and Payments',
    content: (
      <>
        <p>All bids placed are binding. The highest valid bid at auction close constitutes a commitment to purchase the item at that price. Shill bidding, bid manipulation, or any attempt to artificially inflate or depress auction prices is strictly prohibited.</p>
        <p>Payment terms are determined per auction. Winning bidders will receive a receipt confirming their contribution to the linked charity campaign.</p>
      </>
    ),
  },
  {
    title: 'Charity Campaigns',
    content: (
      <p>Charity organisations must submit documentation and obtain admin approval before creating campaigns or managing staff accounts. Only one active charity registration per organisation owner is permitted. BidForGood reserves the right to revoke approval if information is found to be inaccurate or if the organisation violates platform policies.</p>
    ),
  },
  {
    title: 'Prohibited Conduct',
    content: (
      <>
        <p>You must not: attempt to inject malicious scripts, SQL, or other payloads into any platform field; circumvent authentication or session security; scrape or automate requests in ways that harm platform performance; impersonate other users, charities, or staff; or use the platform for any purpose other than genuine charitable auction participation.</p>
        <p>Violations will result in immediate account suspension and may be reported to relevant authorities.</p>
      </>
    ),
  },
  {
    title: 'Platform Limitations',
    content: (
      <p>BidForGood is provided on an as-is basis for educational purposes. We make no warranties regarding uninterrupted availability, accuracy of listing information, or fitness for any particular purpose. The platform team is not liable for any loss or damage arising from use of the platform, including missed auction windows, payment disputes, or service interruptions.</p>
    ),
  },
  {
    title: 'Contact Us',
    content: (
      <p>BidForGood is an academic project developed for ICT2216 at Singapore Institute of Technology. For any questions or concerns about these terms, please contact the project team through your institution.</p>
    ),
  },
]

export default function TermsPage() {
  return (
    <div>
      <LegalHero title="Terms of Service" updated="July 2026" />

      <section className="py-16 px-6" style={{ background: 'var(--bfg-linen)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {SECTIONS.map((s, i) => (
              <LegalSection key={i} num={String(i + 1).padStart(2, '0')} title={s.title}>
                {s.content}
              </LegalSection>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
