import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import Navbar from './Navbar'
import { useAuthStore } from '../../store/authStore'
import api from '../../services/api'

function CharityStatusBanner() {
  const { user, isAuthenticated } = useAuthStore()
  const [status, setStatus] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    if (isAuthenticated && user?.roles.includes('charity')) {
      api.get<{ charity: { status: string } | null }>('/charities/dashboard')
        .then(res => {
          if (res.data.charity) {
            setStatus(res.data.charity.status)
          } else {
             
            setStatus(null)
          }
        })
         
        .catch(() => setStatus(null))
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(null)
    }
  }, [isAuthenticated, user, location.pathname])

  if (status === 'pending') {
    return (
      <div className="px-6 py-3 flex items-center justify-center gap-3" style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A' }}>
        <AlertCircle className="w-5 h-5" style={{ color: '#D97706' }} />
        <p className="text-sm font-medium" style={{ color: '#92400E' }}>
          Your charity account is currently pending approval. Full features will be unlocked once approved.
        </p>
      </div>
    )
  }
  return null
}

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F7F5F0' }}>
      <Navbar />
      <CharityStatusBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer style={{ background: '#2D3A3A', color: '#BBB09B' }}>
        <div className="max-w-[1440px] mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-lg font-bold text-white">BidForGood</p>
              <p className="text-sm mt-1" style={{ color: '#BBB09B' }}>
                Connecting bidders with causes that matter.
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              {['About', 'Contact', 'Terms of Service', 'Privacy Policy'].map(label => (
                <a key={label} href="#"
                  className="transition-colors hover:text-white"
                  style={{ color: '#BBB09B' }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-xs text-center" style={{ borderColor: 'rgba(187,176,155,0.25)', color: '#5C6E6E' }}>
            © 2025 BidForGood. All rights reserved. For educational purposes — ICT2216.
          </div>
        </div>
      </footer>
    </div>
  )
}