import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Layout
import Layout from './components/layout/Layout'
import { ProtectedRoute, RoleProtectedRoute } from './components/layout/ProtectedRoute'

// Pages
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import RegisterCharityPage from './pages/RegisterCharityPage'
import AuctionsPage from './pages/AuctionsPage'
import AuctionDetailPage from './pages/AuctionDetailPage'
import CharityStaffManagementPage from './pages/CharityStaffManagementPage'
import CampaignManagementPage from './pages/CampaignManagementPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import NotFoundPage from './pages/NotFoundPage'
import AdminCharitiesPage from './pages/AdminCharitiesPage'
import AdminListingsPage from './pages/AdminListingsPage'
import AdminAuditPage from './pages/AdminAuditPage'
import AdminUsersPage from './pages/AdminUsersPage'
import CharityListingReviewPage from './pages/CharityListingReviewPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ReceiptPage from './pages/ReceiptPage'
import ForceChangePasswordPage from './pages/ForceChangePasswordPage'
import AboutPage from './pages/AboutPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'

export default function App() {
  const { fetchMe } = useAuthStore()

  // On first load, try to rehydrate user from stored token
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public routes (wrapped in shared Layout) ── */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:id" element={<AuctionDetailPage />} />
          <Route path="/register/charity" element={<RegisterCharityPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* ── Auth required ── */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
          </Route>

          {/* ── Charity Org / Staff / Admin ── */}
          <Route element={<RoleProtectedRoute allowedRoles={['charity', 'admin']} />}>
            <Route path="/charity/staff" element={<CharityStaffManagementPage />} />
          </Route>

          <Route element={<RoleProtectedRoute allowedRoles={['charity', 'charity_staff', 'admin']} />}>
            <Route path="/charity/campaigns" element={<CampaignManagementPage />} />
          </Route>

          <Route element={<RoleProtectedRoute allowedRoles={['charity', 'charity_staff']} />}>
            <Route path="/charity/listing-reviews" element={<CharityListingReviewPage />} />
          </Route>

          {/* ── Bidder only ── */}
          <Route element={<RoleProtectedRoute allowedRoles={['bidder']} />}>
            <Route path="/payments" element={<DashboardPage />} />
          </Route>

          {/* ── Donor + admin: manage/track listings (embedded in dashboard sidebar) ── */}
          <Route element={<RoleProtectedRoute allowedRoles={['donor', 'admin']} />}>
            <Route path="/listings/create" element={<DashboardPage />} />
            <Route path="/listings/manage" element={<DashboardPage />} />
          </Route>

          {/* ── Admin only ── */}
          <Route element={<RoleProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/charities" element={<AdminCharitiesPage />} />
            <Route path="/admin/listings" element={<AdminListingsPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/admin/active-listings" element={<AdminPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>

          {/* ── Auth required (any role) ── */}
          <Route element={<ProtectedRoute />}>
            <Route path="/receipts/:uuid" element={<ReceiptPage />} />
          </Route>

          {/* ── 404 ── */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
