import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { PlusCircle, LayoutDashboard } from 'lucide-react'

export default function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <div className="min-h-[calc(100vh-64px)] flex" style={{ background: '#F7F5F0' }}>
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col shadow-sm" style={{ borderColor: '#BBB09B' }}>
        <div className="p-6 border-b" style={{ borderColor: '#BBB09B' }}>
          <h2 className="text-lg font-bold" style={{ color: '#2D3A3A' }}>Donor Portal</h2>
          <p className="text-xs mt-1" style={{ color: '#5C6E6E' }}>Manage your auctions</p>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {/* Placeholder for Dashboard Home */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 cursor-not-allowed bg-gray-50">
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium text-sm">Overview (WIP)</span>
          </div>

          {/* Donor listing management shortcuts. */}
          {user?.roles?.includes('donor') && (
            <>
              <Link
                to="/listings/manage"
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all shadow-sm hover:-translate-y-0.5"
                style={{ color: '#2D3A3A', background: '#FFFFFF', border: '1px solid #BBB09B' }}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-sm">My Listings</span>
              </Link>

              <Link
                to="/listings/create"
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all shadow-sm hover:-translate-y-0.5"
                style={{ color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0' }}
              >
                <PlusCircle className="w-5 h-5" />
                <span className="text-sm">Create New Listing</span>
              </Link>
            </>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-10">
        <h1 className="text-3xl font-bold" style={{ color: '#2D3A3A' }}>Dashboard</h1>
        <p className="mt-2 text-lg" style={{ color: '#5C6E6E' }}>Welcome back, {user?.full_name}</p>
        
        <div className="mt-16 flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl" style={{ borderColor: '#BBB09B' }}>
          <p className="text-lg font-medium mb-2" style={{ color: '#2D3A3A' }}>Dashboard is empty</p>
          <p className="text-sm" style={{ color: '#5C6E6E' }}>Select "My Listings" to manage your auction items, or create a new charity auction listing.</p>
        </div>
      </main>
    </div>
  )
}
