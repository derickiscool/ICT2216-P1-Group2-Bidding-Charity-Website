import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Bell, Search, ChevronDown, LogOut, LayoutDashboard, Heart, HeartHandshake, Settings, ShieldCheck, Menu, X, Users, CreditCard } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

// ─── Avatar dropdown ─────────────────────────────────────────────────────────
function AvatarDropdown({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const handleLogout = async () => { onClose(); await logout(); navigate('/login') }

  const roleLabel = (r: string) => {
    switch (r) {
      case 'bidder': return 'Bidder'
      case 'donor': return 'Donor'
      case 'charity_staff': return 'Charity Staff'
      case 'charity': return 'Charity'
      case 'admin': return 'Admin'
      default: return r
    }
  }

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-xl z-50 overflow-hidden"
      style={{ background: '#fff', border: '1px solid #BBB09B' }}>
      {/* User info */}
      <div className="px-4 py-3.5 border-b" style={{ borderColor: '#BBB09B', background: '#F7F5F0' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
            style={{ background: '#047857' }}>
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#2D3A3A' }}>{user?.full_name || user?.username}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {user?.roles?.map(r => (
                <span key={r} className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: '#F5EFF5', color: '#A675A1' }}>{roleLabel(r)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-1.5">
        {[
          { icon: LayoutDashboard, label: 'My Dashboard', to: '/dashboard' },
          { icon: Heart, label: 'Watchlist', to: '/dashboard?tab=watchlist' },
          { icon: Settings, label: 'Settings', to: '/profile' },
        ].map(item => (
          <Link key={item.label} to={item.to} onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}>
            <item.icon className="w-4 h-4" style={{ color: '#5C6E6E' }} />
            {item.label}
          </Link>
        ))}
        {user?.roles?.includes('bidder') && (
          <Link
            to="/payments"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}
          >
            <CreditCard className="w-4 h-4" style={{ color: '#047857' }} />
            Payment Deadlines
          </Link>
        )}

        {(user?.roles?.includes('donor') || user?.roles?.includes('admin')) && (
          <Link
            to="/listings/manage"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}
          >
            <LayoutDashboard className="w-4 h-4" style={{ color: '#047857' }} />
            My Listings
          </Link>
        )}

        {(user?.roles?.includes('charity') || user?.roles?.includes('admin')) && (
          <Link
            to="/charity/staff"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}
          >
            <Users className="w-4 h-4" style={{ color: '#047857' }} />
            Staff Management
          </Link>
        )}
        {(user?.roles?.includes('charity') || user?.roles?.includes('charity_staff') || user?.roles?.includes('admin')) && (
          <Link
            to="/charity/campaigns"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}
          >
            <HeartHandshake className="w-4 h-4" style={{ color: '#047857' }} />
            Campaign Management
          </Link>
        )}
        {user?.roles?.includes('admin') && (
          <Link to="/admin" onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ color: '#2D3A3A' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: '#047857' }} />
            Admin Panel
          </Link>
        )}
      </div>

      <div className="border-t p-1.5" style={{ borderColor: '#BBB09B' }}>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors hover:bg-red-50"
          style={{ color: '#B91C1C' }}>
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </div>
  )
}

// ─── Navbar ──────────────────────────────────────────────────────────────────
export default function Navbar() {
  const { user, isAuthenticated } = useAuthStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const isHome = location.pathname === '/'

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value
    if (q.trim()) navigate(`/auctions?q=${encodeURIComponent(q)}`)
  }

  const navStyle = isHome
    ? { background: 'rgba(45,58,58,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }
    : { background: '#fff', borderBottom: '1px solid #BBB09B' }

  const logoColor = isHome ? '#fff' : '#2D3A3A'
  const linkColor = isHome ? 'rgba(255,255,255,0.7)' : '#5C6E6E'
  const linkHoverStyle = 'hover:opacity-100'

  return (
    <header className="sticky top-0 z-40 transition-all duration-200" style={navStyle}>
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center gap-4">

        {/* Logo */}
        <Link to="/" className="flex-shrink-0 text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
          style={{ color: logoColor }}>
          BidForGood
        </Link>

        {/* Search bar */}
        <div className="flex-1 max-w-sm mx-auto hidden md:block">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#BBB09B' }} />
              <input
                type="text" name="q"
                placeholder="Search auctions, charities..."
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: isHome ? 'rgba(255,255,255,0.1)' : '#F7F5F0',
                  border: `1px solid ${isHome ? 'rgba(255,255,255,0.15)' : '#BBB09B'}`,
                  color: isHome ? '#fff' : '#2D3A3A',
                }}
              />
            </div>
          </form>
        </div>

        {/* Right nav */}
        <nav className="flex items-center gap-1 ml-auto flex-shrink-0">
          {['Browse', 'Charities'].map((label) => (
            <Link key={label}
              to={label === 'Browse' ? '/auctions' : '/charities'}
              className={`hidden md:block px-3 py-1.5 text-sm font-medium rounded-lg transition-opacity ${linkHoverStyle}`}
              style={{ color: linkColor }}>
              {label}
            </Link>
          ))}

          {isAuthenticated && user ? (
            <>
              {/* Notification bell */}
              <Link to="/dashboard?tab=notifications"
                className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                style={{ color: linkColor }}>
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
                  style={{ background: '#047857', borderColor: isHome ? '#2D3A3A' : '#fff' }} />
              </Link>

              {/* Avatar */}
              <div className="relative ml-1">
                <button onClick={() => setDropdownOpen(v => !v)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-opacity hover:opacity-80">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: '#047857' }}>
                    {user.username?.charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5" style={{ color: linkColor }} />
                </button>
                {dropdownOpen && <AvatarDropdown onClose={() => setDropdownOpen(false)} />}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link to="/login"
                className="px-4 py-1.5 text-sm font-medium rounded-xl border transition-opacity hover:opacity-80"
                style={{ color: isHome ? '#fff' : '#2D3A3A', borderColor: isHome ? 'rgba(255,255,255,0.25)' : '#BBB09B' }}>
                Log In
              </Link>
              <Link to="/register"
                className="px-4 py-1.5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
                style={{ background: '#047857' }}>
                Register
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button className="md:hidden ml-2 w-9 h-9 flex items-center justify-center rounded-xl"
            onClick={() => setMobileOpen(v => !v)}
            style={{ color: linkColor }}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t px-6 py-4 space-y-2" style={{ background: isHome ? '#2D3A3A' : '#fff', borderColor: '#BBB09B' }}>
          <Link to="/auctions" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium" style={{ color: isHome ? '#fff' : '#2D3A3A' }}>Browse Auctions</Link>
          <Link to="/charities" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium" style={{ color: isHome ? '#fff' : '#2D3A3A' }}>Charities</Link>
          {isAuthenticated && user?.roles?.includes('bidder') && (
            <Link to="/payments" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-semibold" style={{ color: '#047857' }}>Payment Deadlines</Link>
          )}
          {isAuthenticated && (user?.roles?.includes('donor') || user?.roles?.includes('admin')) && (
            <Link to="/listings/manage" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-semibold" style={{ color: '#047857' }}>My Listings</Link>
          )}
          {!isAuthenticated && <>
            <Link to="/login" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium" style={{ color: isHome ? '#fff' : '#2D3A3A' }}>Log In</Link>
            <Link to="/register" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-semibold" style={{ color: '#047857' }}>Register</Link>
          </>}
        </div>
      )}
    </header>
  )
}