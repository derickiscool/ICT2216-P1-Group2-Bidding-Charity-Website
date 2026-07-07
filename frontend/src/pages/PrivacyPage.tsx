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
    title: 'Information We Collect',
    content: (
      <>
        <p>When you register, we collect your full name, email address, and username. Charity organisations additionally provide supporting documentation for identity verification. We also collect activity data including bids placed, listings created, and login history for security and operational purposes.</p>
        <p>We do not collect payment card data directly. Payment processing is handled separately and is out of scope for this platform.</p>
      </>
    ),
  },
  {
    title: 'How We Use Your Information',
    content: (
      <p>Your information is used to operate BidForGood: to verify charity organisations, process auction activity, send OTP registration codes, and maintain a secure audit trail. We do not sell, rent, or share your personal data with third parties for marketing or advertising purposes.</p>
    ),
  },
  {
    title: 'Charity and Auction Data',
    content: (
      <p>Charity registration details and supporting documents submitted for approval are stored securely and used only for internal verification by platform administrators. Campaign names, descriptions, and auction listings are visible to all platform users as part of normal operation.</p>
    ),
  },
  {
    title: 'Cookies and Security',
    content: (
      <>
        <p>We use secure HTTP-only session cookies to keep you logged in. These are not accessible to JavaScript and are invalidated when you log out. We do not use third-party tracking or advertising cookies.</p>
        <p>Passwords are hashed using argon2id and never stored in plain text. IP addresses and user-agent strings in our audit logs are stored as one-way SHA-256 hashes. All data in transit is protected via HTTPS. Every state-changing request requires a CSRF token to prevent cross-site request forgery.</p>
      </>
    ),
  },
  {
    title: 'Data Retention',
    content: (
      <p>Account data is retained for as long as your account remains active. Audit log entries are retained permanently to preserve the integrity of the tamper-evident audit chain. Closed campaigns, completed auctions, and bid history are retained for historical record-keeping and receipt purposes.</p>
    ),
  },
  {
    title: 'Contact Us',
    content: (
      <p>BidForGood is an academic project developed for ICT2216 at Singapore Institute of Technology. For any questions about how your data is handled within this project, please contact the project team through your institution.</p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <div>
      <LegalHero title="Privacy Policy" updated="July 2026" />

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
