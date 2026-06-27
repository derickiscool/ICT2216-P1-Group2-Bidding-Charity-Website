import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F7F5F0' }}>
      <Navbar />
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