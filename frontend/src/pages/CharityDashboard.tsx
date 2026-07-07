import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Loader2, AlertCircle, Info,
  CheckCircle, Clock, Plus, ExternalLink, RefreshCw, X, Edit3, Upload,
  HeartHandshake, Users, DollarSign, ListOrdered,
  CalendarDays, Target, Eye, Flag, ImageIcon, ChevronLeft, ChevronRight,
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { Listing, CharityStats, ApiError, Campaign } from '../types'

// Listing enriched with payment flags from backend
interface SoldListingWithPayment extends Listing {
  payment_released?: boolean
  payment_held?: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  warning: '#92400E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

// Four cards keeps the dashboard tidy: two rows of two on wide screens,
// while still collapsing cleanly on tablet/mobile layouts.
const DASHBOARD_CAMPAIGNS_PER_PAGE = 4

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusPill = (status: string, label?: string) => {
  const colors = new Map<string, { bg: string; text: string }>([
    ['active', { bg: C.emeraldLight, text: C.emerald }],
    ['closed', { bg: '#F3F4F6', text: '#6B7280' }],
    ['pending', { bg: '#FEF3C7', text: '#92400E' }],
    ['draft', { bg: '#F3F4F6', text: '#6B7280' }],
    ['sold', { bg: '#DBEAFE', text: '#1E40AF' }],
    ['expired', { bg: '#FEE2E2', text: '#991B1B' }],
    ['cancelled', { bg: '#FEE2E2', text: '#991B1B' }],
    ['rejected', { bg: '#FEE2E2', text: '#991B1B' }],
  ])
  const s = colors.get(status) ?? { bg: '#F3F4F6', text: '#6B7280' }
  return (
    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.text }}>
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}


const formatDashboardEndDate = (value?: string) => {
  if (!value) return 'No end date'

  // Campaign end dates are date-only values. Displaying the business meaning
  // prevents users from guessing whether the campaign ends at midnight or at
  // the end of the selected day.
  const dateOnly = value.slice(0, 10)
  const [year, month, day] = dateOnly.split('-').map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  const formattedDate = parsedDate.toLocaleDateString('en-SG', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  return `${formattedDate}, 11:59 PM SGT`
}

const dashboardCampaignImageUrl = (campaign: Campaign) => (
  campaign.hasImage ? `/api/charities/campaigns/${campaign.uuid}/image` : undefined
)

function todayForInput() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function dashboardInputStyle(hasError: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '12px',
    border: `1px solid ${hasError ? C.danger : C.beige}`,
    background: '#fff',
    color: C.slate,
    fontSize: '14px',
    outline: 'none',
    ...extra,
  }
}

function normaliseCampaignText(value: string) {
  // Keep campaign content as plain text and collapse excessive spacing before it
  // is sent to the backend. The backend remains the source of truth for final validation.
  return value.trim().replace(/\s+/g, ' ')
}

function isPastDate(value: string) {
  if (!value) return false
  const selected = new Date(`${value}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return selected < today
}

function containsUnsafeMarkup(value: string) {
  // Fast frontend feedback for obvious script-like content. This does not replace
  // backend sanitisation; it simply avoids submitting clearly unsafe payloads.
  const unsafePatterns = [/<\s*script/i, /<\s*iframe/i, /<\s*object/i, /<\s*embed/i, /javascript\s*:/i, /data\s*:\s*text\/html/i, /on\w+\s*=/i]
  return unsafePatterns.some((pattern) => pattern.test(value))
}

function validateCampaignImage(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  const maxSizeInBytes = 2 * 1024 * 1024
  if (!allowedTypes.includes(file.type)) return 'Campaign image must be a JPG, PNG or WEBP file.'
  if (file.size > maxSizeInBytes) return 'Campaign image must be 2MB or smaller.'
  return ''
}

function readImageAsDataUrl(file: File, onReady: (value: string) => void) {
  const reader = new FileReader()
  reader.onload = () => onReady(String(reader.result ?? ''))
  reader.readAsDataURL(file)
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'campaigns' | 'staff' | 'proceeds' | 'listings'

interface TabNavItem {
  id: Tab
  label: string
  icon: React.ReactNode
  badge?: number
}

interface StaffAccount {
  uuid: string
  full_name: string
  email: string
  is_active: boolean
  created_at: string
  lastLoginAt?: string
  mustChangePassword?: boolean
}

interface CampaignListResponse {
  campaigns: Campaign[]
  canManageCampaigns?: boolean
}

interface CampaignForm {
  name: string
  description: string
  end_date: string
  image_file: File | null
  image_preview_url: string
}

type CampaignField = 'name' | 'description' | 'end_date'
type CampaignFormErrors = Partial<Record<CampaignField | 'image_file', string>>

const emptyCampaignForm: CampaignForm = {
  name: '',
  description: '',
  end_date: '',
  image_file: null,
  image_preview_url: '',
}

const END_DATE_HELP_TEXT =
  'Optional. If selected, the campaign stays active until 11:59 PM Singapore time on that date. Leave blank to keep it open until manually closed.'

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ tabs, activeTab, onTabChange }: {
  tabs: TabNavItem[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}) {
  return (
    <aside className="w-60 flex-shrink-0 hidden md:block self-start sticky top-16 h-[calc(100vh-64px)] overflow-y-auto"
      style={{ background: '#fff', borderRight: `1px solid ${C.beige}` }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: C.beige }}>
        <h2 className="font-black text-sm uppercase tracking-widest" style={{ color: C.slate }}>Charity Dashboard</h2>
      </div>
      <nav className="p-2 space-y-1">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab
          return (
            <button key={tab.id} onClick={() => onTabChange(tab.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: isActive ? C.emeraldLight : 'transparent',
                color: isActive ? C.emerald : C.muted,
              }}>
              <span className="w-5 h-5 flex items-center justify-center">{tab.icon}</span>
              <span className="flex-1 text-left">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: isActive ? C.emerald : C.linen, color: isActive ? '#fff' : C.slate }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}


function DashboardIconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: C.emeraldLight, color: C.emerald }}>
      {children}
    </div>
  )
}

function DashboardCampaignOverview({
  total,
  active,
  closed,
  linkedAuctions,
  raised,
}: {
  total: number
  active: number
  closed: number
  linkedAuctions: number
  raised: number
}) {
  return (
    <section className="mb-6 rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="px-6 py-5 border-b flex items-start gap-3" style={{ borderColor: C.beige }}>
        <DashboardIconBox>
          <HeartHandshake className="w-5 h-5" />
        </DashboardIconBox>
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.slate }}>Campaign overview</h2>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            Summary of campaigns created by your charity organisation.
          </p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <DashboardOverviewTile label="Total campaigns" value={String(total)} color={C.slate} />
        <DashboardOverviewTile label="Active campaigns" value={String(active)} color={C.emerald} />
        <DashboardOverviewTile label="Closed campaigns" value={String(closed)} color={C.danger} />
        <DashboardOverviewTile label="Linked active auctions" value={String(linkedAuctions)} color="#1D4ED8" />
        <DashboardOverviewTile label="Total raised" value={money(raised)} color={C.emerald} />
      </div>
    </section>
  )
}

function DashboardOverviewTile({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded-2xl p-4 min-h-[96px]" style={{ border: `1px solid ${C.beige}`, background: C.linen }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</p>
      <p className="text-xl font-black mt-2" style={{ color }}>{value}</p>
    </div>
  )
}

function DashboardCampaignImage({ src }: { src?: string }) {
  if (src) {
    return <img src={src} alt="Campaign preview" className="h-28 w-full rounded-2xl object-cover" />
  }

  return (
    <div className="h-28 rounded-2xl flex flex-col items-center justify-center" style={{ background: '#E5E7EB', color: '#8A97A8' }}>
      <ImageIcon className="w-7 h-7 mb-1.5" />
      <p className="text-xs">Campaign Image</p>
    </div>
  )
}

function DashboardMetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 flex-shrink-0" style={{ color: C.beige }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</p>
        <p className="text-sm font-semibold break-words" style={{ color: C.slate, overflowWrap: 'anywhere' }}>{value}</p>
      </div>
    </div>
  )
}

function DashboardCampaignCard({ campaign, canManageCampaigns, closing, onEditCampaign, onCloseCampaign }: {
  campaign: Campaign
  canManageCampaigns: boolean
  closing: boolean
  onEditCampaign: (campaign: Campaign) => void
  onCloseCampaign: (uuid: string) => Promise<void>
}) {
  const isClosed = campaign.status === 'closed'
  const actionsDisabled = !canManageCampaigns || isClosed || closing

  return (
    <article className="rounded-2xl p-4 shadow-sm flex flex-col" style={{ background: '#fff', border: `1px solid ${C.beige}` }}>
      <DashboardCampaignImage src={dashboardCampaignImageUrl(campaign)} />

      <div className="flex items-start justify-between gap-3 mt-3">
        <div className="min-w-0 flex-1">
          <h3
            className="font-bold text-sm leading-snug break-words"
            style={{
              color: C.slate,
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {campaign.name}
          </h3>
          <p
            className="text-xs leading-relaxed mt-2 break-words"
            style={{
              color: C.muted,
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {campaign.description}
          </p>
        </div>
        {statusPill(campaign.status)}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t" style={{ borderColor: C.linen }}>
        <DashboardMetaItem icon={<CalendarDays className="w-4 h-4" />} label="End date/time" value={formatDashboardEndDate(campaign.end_date)} />
        <DashboardMetaItem icon={<Target className="w-4 h-4" />} label="Raised" value={money(campaign.total_raised)} />
        <DashboardMetaItem icon={<Eye className="w-4 h-4" />} label="Linked auctions" value={isClosed ? 'Campaign closed' : String(campaign.active_auctions)} />
        <DashboardMetaItem icon={<Flag className="w-4 h-4" />} label="Status" value={isClosed ? 'Closed' : 'Active'} />
      </div>

      <div className="mt-auto pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onEditCampaign(campaign)}
          disabled={actionsDisabled}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-colors hover:opacity-80"
          style={{
            color: actionsDisabled ? C.muted : C.emerald,
            border: `1px solid ${C.beige}`,
            cursor: actionsDisabled ? 'not-allowed' : 'pointer',
            background: '#fff',
          }}
        >
          <Edit3 className="w-3.5 h-3.5" />
          Edit Campaign
        </button>
        <button
          type="button"
          onClick={() => { void onCloseCampaign(campaign.uuid) }}
          disabled={actionsDisabled}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-colors hover:opacity-80"
          style={{
            color: actionsDisabled ? C.muted : C.danger,
            border: `1px solid ${C.beige}`,
            cursor: actionsDisabled ? 'not-allowed' : 'pointer',
            background: '#fff',
          }}
        >
          {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
          {isClosed ? 'Closed' : closing ? 'Closing...' : 'Close Campaign'}
        </button>
      </div>
    </article>
  )
}

function DashboardCampaignPagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }: {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(totalItems, currentPage * pageSize)

  function goToPage(page: number) {
    // Clamp page numbers so pagination stays valid even after a campaign is closed
    // and the list is refreshed from the backend.
    onPageChange(Math.min(Math.max(page, 1), totalPages))
  }

  return (
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-t pt-5" style={{ borderColor: C.linen }}>
      <p className="text-sm" style={{ color: C.muted }}>
        Showing <span className="font-semibold" style={{ color: C.slate }}>{startItem}-{endItem}</span> of <span className="font-semibold" style={{ color: C.slate }}>{totalItems}</span> campaign records
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1" style={{ borderColor: C.beige, color: currentPage === 1 ? C.muted : C.slate, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', background: '#fff' }}>
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button key={page} type="button" onClick={() => goToPage(page)} className="w-8 h-8 rounded-lg text-xs font-bold border" style={{ borderColor: page === currentPage ? C.emerald : C.beige, background: page === currentPage ? C.emeraldLight : '#fff', color: page === currentPage ? C.emerald : C.slate }}>
            {page}
          </button>
        ))}
        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1" style={{ borderColor: C.beige, color: currentPage === totalPages ? C.muted : C.slate, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', background: '#fff' }}>
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function DashboardTextInput({ label, type = 'text', value, error, note, disabled, min, onChange }: {
  label: string
  type?: 'text' | 'date'
  value: string
  error?: string
  note?: string
  disabled?: boolean
  min?: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <input
        type={type}
        value={value}
        min={min}
        disabled={disabled}
        onChange={onChange}
        style={dashboardInputStyle(!!error, { background: disabled ? C.linen : '#fff', cursor: disabled ? 'not-allowed' : 'text' })}
      />
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function DashboardTextAreaInput({ label, value, error, note, disabled, onChange }: {
  label: string
  value: string
  error?: string
  note?: string
  disabled?: boolean
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <textarea
        value={value}
        disabled={disabled}
        onChange={onChange}
        rows={5}
        style={dashboardInputStyle(!!error, { resize: 'vertical', background: disabled ? C.linen : '#fff', cursor: disabled ? 'not-allowed' : 'text' })}
      />
      <div className="flex items-start justify-between gap-3 mt-1">
        <div>
          {note && <p className="text-xs" style={{ color: C.muted }}>{note}</p>}
          {error && <p className="text-xs" style={{ color: C.danger }}>{error}</p>}
        </div>
        <p className="text-xs flex-shrink-0" style={{ color: C.muted }}>{value.length}/600</p>
      </div>
    </div>
  )
}

function DashboardImageUploadInput({ previewUrl, error, disabled, onChange, onClear }: {
  previewUrl: string
  error?: string
  disabled?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Campaign image</label>
      <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: error ? C.danger : C.beige, background: disabled ? C.linen : '#fff' }}>
        {previewUrl ? (
          <img src={previewUrl} alt="Selected campaign preview" className="h-40 w-full rounded-xl object-cover mb-3" />
        ) : (
          <div className="h-40 rounded-xl flex flex-col items-center justify-center mb-3" style={{ background: C.linen, color: C.muted }}>
            <ImageIcon className="w-8 h-8 mb-2" />
            <p className="text-sm font-medium">No campaign image selected</p>
            <p className="text-xs mt-1">Upload an image to represent this campaign.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: disabled ? '#6ba88e' : C.emerald, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            <Upload className="w-4 h-4" />
            Choose image
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={onChange} className="hidden" />
          </label>
          {previewUrl && (
            <button type="button" onClick={onClear} disabled={disabled} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: C.beige, color: C.slate, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              Remove image
            </button>
          )}
        </div>
      </div>
      <p className="text-xs mt-1" style={{ color: C.muted }}>Optional. Accepted formats: JPG, PNG or WEBP, up to 2MB.</p>
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function DashboardEditCampaignModal({ campaign, form, errors, saving, onClose, onSave, onChange, onImageChange, onClearImage }: {
  campaign: Campaign
  form: CampaignForm
  errors: CampaignFormErrors
  saving: boolean
  onClose: () => void
  onSave: (e: FormEvent) => void
  onChange: (field: CampaignField, value: string) => void
  onImageChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClearImage: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-8" style={{ background: 'rgba(45, 58, 58, 0.45)' }}>
      <div className="min-h-full flex items-start justify-center">
        <section className="w-full max-w-2xl bg-white rounded-2xl shadow-xl" style={{ border: `1px solid ${C.beige}` }}>
          <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: C.beige }}>
            <div>
              <h2 className="text-lg font-bold" style={{ color: C.slate }}>Edit campaign</h2>
              <p className="text-sm mt-0.5 break-words" style={{ color: C.muted, overflowWrap: 'anywhere' }}>{campaign.name}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-[#F7F5F0]" aria-label="Close edit campaign modal">
              <X className="w-5 h-5" style={{ color: C.muted }} />
            </button>
          </div>

          <form onSubmit={onSave} noValidate className="px-6 py-6 space-y-5">
            <DashboardTextInput label="Campaign name" value={form.name} error={errors.name} disabled={saving} onChange={(e) => onChange('name', e.target.value)} />
            <DashboardTextAreaInput label="Campaign description" value={form.description} error={errors.description} disabled={saving} note="Plain text only. Do not paste HTML, JavaScript or tracking snippets here." onChange={(e) => onChange('description', e.target.value)} />
            <DashboardImageUploadInput previewUrl={form.image_preview_url} error={errors.image_file} disabled={saving} onChange={onImageChange} onClear={onClearImage} />
            <DashboardTextInput label="Optional end date" type="date" value={form.end_date} error={errors.end_date} note={END_DATE_HELP_TEXT} disabled={saving} min={todayForInput()} onChange={(e) => onChange('end_date', e.target.value)} />

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: saving ? '#6ba88e' : C.emerald, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CharityDashboard() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('campaigns')

  // Data
  const [listings, setListings] = useState<Listing[]>([])
  const [stats, setStats] = useState<CharityStats | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [canManageCampaigns, setCanManageCampaigns] = useState(false)
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [notRegistered, setNotRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listingsFilter, setListingsFilter] = useState<string>('all')
  const [campaignPage, setCampaignPage] = useState(1)
  const [closingCampaignId, setClosingCampaignId] = useState<string | null>(null)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [editCampaignForm, setEditCampaignForm] = useState<CampaignForm>(emptyCampaignForm)
  const [editCampaignErrors, setEditCampaignErrors] = useState<CampaignFormErrors>({})
  const [savingCampaignEdit, setSavingCampaignEdit] = useState(false)

  const isOwner = user?.roles?.includes('charity')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dashRes = api.get<{ charity: Record<string, unknown> | null; listings: Listing[]; stats: CharityStats }>('/charities/dashboard')
      const campRes = api.get<CampaignListResponse>('/charities/campaigns').catch(() => ({ data: { campaigns: [] as Campaign[], canManageCampaigns: false } }))
      const staffRes = isOwner
        ? api.get<{ staff: StaffAccount[] }>('/charities/staff').catch(() => ({ data: { staff: [] as StaffAccount[] } }))
        : Promise.resolve({ data: { staff: [] as StaffAccount[] } })

      const [dash, camps, staffData] = await Promise.all([dashRes, campRes, staffRes])

      if (!dash.data.charity) setNotRegistered(true)
      setListings(dash.data.listings)
      setStats(dash.data.stats)
      setCampaigns(camps.data.campaigns ?? [])
      // Backend returns canManageCampaigns=false if the charity account exists
      // but is not approved yet. Keep dashboard actions locked in that case.
      setCanManageCampaigns(Boolean(camps.data.canManageCampaigns))
      setStaff(staffData.data.staff ?? [])
    } catch (err) {
      setError((err as ApiError).message || 'Failed to load charity dashboard.')
    } finally {
      setLoading(false)
    }
  }, [isOwner])

  useEffect(() => { const id = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(id) }, [loadData])

  // ─── Derived data ───────────────────────────────────────────────────────

  const activeCampaigns = useMemo(() => campaigns.filter(c => c.status === 'active'), [campaigns])
  const campaignPageCount = Math.max(1, Math.ceil(campaigns.length / DASHBOARD_CAMPAIGNS_PER_PAGE))

  const campaignOverview = useMemo(() => {
    // Keep campaign summary numbers derived from the campaign list so the
    // dashboard overview always matches the records shown below it.
    const active = campaigns.filter((campaign) => campaign.status === 'active').length
    const closed = campaigns.length - active
    const linkedAuctions = campaigns.reduce((sum, campaign) => sum + campaign.active_auctions, 0)
    const raised = campaigns.reduce((sum, campaign) => sum + campaign.total_raised, 0)

    return {
      total: campaigns.length,
      active,
      closed,
      linkedAuctions,
      raised,
    }
  }, [campaigns])

  const safeCampaignPage = Math.min(campaignPage, campaignPageCount)
  const paginatedCampaigns = useMemo(() => {
    const start = (safeCampaignPage - 1) * DASHBOARD_CAMPAIGNS_PER_PAGE
    return campaigns.slice(start, start + DASHBOARD_CAMPAIGNS_PER_PAGE)
  }, [campaigns, safeCampaignPage])
  const activeStaff = useMemo(() => staff.filter(s => s.is_active), [staff])

  const pendingReviewCount = useMemo(() =>
    listings.filter(l => l.status === 'pending').length,
    [listings],
  )

  const filteredListings = useMemo(() => {
    if (listingsFilter === 'all') return listings
    return listings.filter(l => l.status === listingsFilter)
  }, [listings, listingsFilter])

  // Stats for proceeds
  const totalRaised = stats?.totalRaised ?? 0
  const releasedAmount = stats?.paymentsReceived ?? 0
  const heldAmount = stats?.paymentsPending ?? 0
  const releasedCount = stats?.paymentsReleasedCount ?? 0
  const heldCount = stats?.paymentsHeldCount ?? 0

  // Sold items with payment state from backend enrichment
  const soldItems = useMemo(() =>
    (listings as SoldListingWithPayment[])
      .filter(l => l.status === 'sold')
      .map(l => ({
        ...l,
        payment_released: l.payment_released === true,
        payment_held: l.payment_held === true,
      })),
    [listings],
  )

  function updateEditCampaignField(field: CampaignField, value: string) {
    setEditCampaignForm((prev) => ({ ...prev, [field]: value }))
    setEditCampaignErrors((prev) => ({ ...prev, [field]: '' }))
    setError(null)
  }

  function updateEditCampaignImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setError(null)

    if (!file) {
      setEditCampaignForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
      return
    }

    const imageError = validateCampaignImage(file)
    if (imageError) {
      setEditCampaignErrors((prev) => ({ ...prev, image_file: imageError }))
      e.target.value = ''
      return
    }

    readImageAsDataUrl(file, (url) => {
      setEditCampaignForm((prev) => ({ ...prev, image_file: file, image_preview_url: url }))
    })
    setEditCampaignErrors((prev) => ({ ...prev, image_file: '' }))
  }

  function clearEditCampaignImage() {
    // Empty preview URL means the user intentionally removed the current image.
    // saveDashboardCampaignEdit will send remove_image=true to the backend.
    setEditCampaignForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
  }

  function validateDashboardCampaignForm(form: CampaignForm, editingUuid: string) {
    const errors: CampaignFormErrors = {}
    const name = normaliseCampaignText(form.name)
    const description = normaliseCampaignText(form.description)

    if (!name) errors.name = 'Campaign name is required.'
    else if (name.length < 5) errors.name = 'Campaign name must be at least 5 characters.'
    else if (name.length > 90) errors.name = 'Campaign name must be 90 characters or less.'
    else if (containsUnsafeMarkup(name)) errors.name = 'Campaign name cannot contain script-like content.'
    else if (campaigns.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.uuid !== editingUuid)) errors.name = 'A campaign with this name already exists.'

    if (!description) errors.description = 'Campaign description is required.'
    else if (description.length < 20) errors.description = 'Description must be at least 20 characters.'
    else if (description.length > 600) errors.description = 'Description must be 600 characters or less.'
    else if (containsUnsafeMarkup(description)) errors.description = 'Description cannot contain script-like content.'

    if (form.end_date && isPastDate(form.end_date)) errors.end_date = 'End date cannot be in the past.'

    if (form.image_file) {
      const imageError = validateCampaignImage(form.image_file)
      if (imageError) errors.image_file = imageError
    }

    return errors
  }

  function startDashboardCampaignEdit(campaign: Campaign) {
    setEditingCampaign(campaign)
    setEditCampaignErrors({})
    setError(null)
    setEditCampaignForm({
      name: campaign.name,
      description: campaign.description,
      end_date: campaign.end_date ?? '',
      image_file: null,
      image_preview_url: campaign.hasImage ? `/api/charities/campaigns/${campaign.uuid}/image` : '',
    })
  }

  function closeDashboardCampaignEditModal() {
    setEditingCampaign(null)
    setEditCampaignForm(emptyCampaignForm)
    setEditCampaignErrors({})
  }

  async function saveDashboardCampaignEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingCampaign) return

    const errorMap = validateDashboardCampaignForm(editCampaignForm, editingCampaign.uuid)
    setEditCampaignErrors(errorMap)
    if (Object.keys(errorMap).length > 0) return

    const fd = new FormData()
    fd.append('name', normaliseCampaignText(editCampaignForm.name))
    fd.append('description', normaliseCampaignText(editCampaignForm.description))
    if (editCampaignForm.end_date) fd.append('end_date', editCampaignForm.end_date)
    if (editCampaignForm.image_file) {
      fd.append('image', editCampaignForm.image_file)
    } else if (!editCampaignForm.image_preview_url) {
      fd.append('remove_image', 'true')
    }

    setSavingCampaignEdit(true)
    setError(null)
    try {
      const res = await api.put<Campaign>(`/charities/campaigns/${editingCampaign.uuid}`, fd)
      setCampaigns((prev) => prev.map((campaign) => (campaign.uuid === editingCampaign.uuid ? res.data : campaign)))
      closeDashboardCampaignEditModal()
    } catch (e) {
      const apiError = e as ApiError
      if (apiError.errors) setEditCampaignErrors(apiError.errors as CampaignFormErrors)
      setError(apiError.message || 'Failed to update campaign.')
    } finally {
      setSavingCampaignEdit(false)
    }
  }

  async function closeDashboardCampaign(uuid: string) {
    setClosingCampaignId(uuid)
    setError(null)
    try {
      await api.patch(`/charities/campaigns/${uuid}/close`)
      await loadData()
    } catch (e) {
      setError((e as ApiError).message || 'Failed to close campaign.')
    } finally {
      setClosingCampaignId(null)
    }
  }

  // ─── Loading / Error / Not Registered ──────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.danger }} />
          <p style={{ color: C.danger }}>{error}</p>
        </div>
      </div>
    )
  }

  if (notRegistered) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center max-w-md mx-auto p-8">
          <Info className="w-12 h-12 mx-auto mb-4" style={{ color: '#92400E' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>No Charity Organisation Registered</h2>
          <p className="text-sm mb-6" style={{ color: C.muted }}>
            Your account hasn't been linked to a charity organisation yet.
            Register your charity first to start viewing donations and auction items.
          </p>
          <Link to="/register/charity"
            className="inline-block px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: C.emerald }}>
            Register Charity →
          </Link>
        </div>
      </div>
    )
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────

  const tabs: TabNavItem[] = [
    { id: 'campaigns', label: 'Campaigns', icon: <HeartHandshake className="w-4 h-4" />, badge: activeCampaigns.length },
    ...(isOwner ? [{ id: 'staff' as Tab, label: 'Staff Accounts', icon: <Users className="w-4 h-4" />, badge: activeStaff.length }] : []),
    { id: 'proceeds', label: 'Donation Proceeds', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'listings', label: 'Listings', icon: <ListOrdered className="w-4 h-4" />, badge: pendingReviewCount },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ background: C.linen }}>
      <div className="flex">
        <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8">

          {error && (
            <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
              {error}
              <button onClick={() => setError(null)} className="float-right"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* ───────────── CAMPAIGNS ───────────── */}
          {activeTab === 'campaigns' && (
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Campaigns</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Manage your fundraising campaigns and track progress</p>
                </div>
                <Link to="/charity/campaigns"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: C.emerald }}>
                  <Plus className="w-4 h-4" /> Create New Campaign
                </Link>
              </div>

              <DashboardCampaignOverview
                total={campaignOverview.total}
                active={campaignOverview.active}
                closed={campaignOverview.closed}
                linkedAuctions={campaignOverview.linkedAuctions}
                raised={campaignOverview.raised}
              />

              {campaigns.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <HeartHandshake className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No campaigns yet</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>Create your first fundraising campaign to start accepting auction donations.</p>
                  <Link to="/charity/campaigns"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    <Plus className="w-4 h-4" /> Create Campaign
                  </Link>
                </div>
              ) : (
                <section className="rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="px-6 py-5 border-b flex items-start gap-3" style={{ borderColor: C.beige }}>
                    <DashboardIconBox><HeartHandshake className="w-5 h-5" /></DashboardIconBox>
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: C.slate }}>Campaign records</h2>
                      <p className="text-sm mt-0.5" style={{ color: C.muted }}>Edit, close and track campaigns created by your charity organisation.</p>
                    </div>
                  </div>

                  <div className="px-6 py-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {paginatedCampaigns.map(campaign => (
                        <DashboardCampaignCard
                          key={campaign.uuid}
                          campaign={campaign}
                          canManageCampaigns={canManageCampaigns}
                          closing={closingCampaignId === campaign.uuid}
                          onEditCampaign={startDashboardCampaignEdit}
                          onCloseCampaign={closeDashboardCampaign}
                        />
                      ))}
                    </div>

                    {campaigns.length > DASHBOARD_CAMPAIGNS_PER_PAGE && (
                      <DashboardCampaignPagination
                        currentPage={safeCampaignPage}
                        totalPages={campaignPageCount}
                        totalItems={campaigns.length}
                        pageSize={DASHBOARD_CAMPAIGNS_PER_PAGE}
                        onPageChange={setCampaignPage}
                      />
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ───────────── STAFF ACCOUNTS ───────────── */}
          {activeTab === 'staff' && isOwner && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Staff Accounts</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Create, deactivate, and reactivate staff accounts for your organisation</p>
                </div>
                <Link to="/charity/staff"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: C.emerald }}>
                  <Plus className="w-4 h-4" /> Add Staff Account
                </Link>
              </div>

              {staff.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No staff accounts yet</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>Add staff members to help manage your campaigns and listings.</p>
                  <Link to="/charity/staff"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: C.emerald }}>
                    <Plus className="w-4 h-4" /> Add Staff
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Name</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Email</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staff.map(s => (
                          <tr key={s.uuid} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{s.full_name}</p>
                              {s.mustChangePassword && (
                                <p className="text-xs mt-0.5" style={{ color: C.warning }}>Temporary password pending reset</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>{s.email}</td>
                            <td className="px-6 py-4">
                              {s.is_active ? (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.emeraldLight, color: C.emerald }}>Active</span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.dangerLight, color: C.danger }}>Inactive</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {s.is_active ? (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.patch(`/charities/staff/${s.uuid}/deactivate`)
                                        await loadData()
                                      } catch (e) {
                                        setError((e as ApiError).message || 'Failed to deactivate staff.')
                                      }
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.danger }} title="Deactivate staff account">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.patch(`/charities/staff/${s.uuid}/reactivate`)
                                        await loadData()
                                      } catch (e) {
                                        setError((e as ApiError).message || 'Failed to reactivate staff.')
                                      }
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.emerald }} title="Reactivate staff account">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────── DONATION PROCEEDS ───────────── */}
          {activeTab === 'proceeds' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Donation Proceeds</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Track funds raised and payout status</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFF7ED' }}>
                      <DollarSign className="w-5 h-5" style={{ color: '#C2410C' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(totalRaised)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Total Raised</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    Across {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight }}>
                      <CheckCircle className="w-5 h-5" style={{ color: C.emerald }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(releasedAmount)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Funds Released</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    From {releasedCount} item{releasedCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FEF3C7' }}>
                      <Clock className="w-5 h-5" style={{ color: '#92400E' }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: C.slate }}>{money(heldAmount)}</p>
                  <p className="text-xs font-bold" style={{ color: C.muted }}>Funds Holding</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    From {heldCount} item{heldCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>



              {/* Per-item breakdown */}
              <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: C.beige }}>
                  <h2 className="font-bold text-sm" style={{ color: C.slate }}>Sold Items</h2>
                </div>
                {soldItems.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm" style={{ color: C.muted }}>
                    No items have been sold yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Campaign</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Winning Bid</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Payment Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {soldItems.map(l => {
                          let statusLabel: string
                          let statusStyle: { bg: string; text: string }
                          if (l.payment_released) {
                            statusLabel = 'Released'
                            statusStyle = { bg: C.emeraldLight, text: C.emerald }
                          } else if (l.payment_held) {
                            statusLabel = 'Holding'
                            statusStyle = { bg: '#FEF3C7', text: '#92400E' }
                          } else {
                            statusLabel = 'Pending'
                            statusStyle = { bg: '#F3F4F6', text: '#6B7280' }
                          }
                          return (
                            <tr key={l.uuid ?? l.id} className="border-t" style={{ borderColor: C.beige }}>
                              <td className="px-6 py-4">
                                <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                              </td>
                              <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                                {l.charityName || '—'}
                              </td>
                              <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                                {money(l.current_bid)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                                  style={{ background: statusStyle.bg, color: statusStyle.text }}>
                                  {statusLabel === 'Released' && '✅'}
                                  {statusLabel === 'Holding' && '⏳'}
                                  {statusLabel === 'Pending' && '⏸'}
                                  {' '}{statusLabel}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────── LISTINGS ───────────── */}
          {activeTab === 'listings' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-black" style={{ color: C.slate }}>Listings</h1>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>All auction items linked to your charity organisation</p>
                </div>
                <button onClick={loadData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                  style={{ border: `1px solid ${C.beige}`, color: C.muted }}>
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {[
                  { value: 'all', label: 'All', count: listings.length },
                  { value: 'pending', label: 'Pending', count: listings.filter(l => l.status === 'pending').length },
                  { value: 'active', label: 'Active', count: listings.filter(l => l.status === 'active').length },
                  { value: 'sold', label: 'Sold', count: listings.filter(l => l.status === 'sold').length },
                  { value: 'expired', label: 'Expired', count: listings.filter(l => l.status === 'expired').length },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setListingsFilter(opt.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                    style={{
                      background: listingsFilter === opt.value ? C.emerald : C.linen,
                      color: listingsFilter === opt.value ? '#fff' : C.muted,
                    }}>
                    {opt.label}
                    <span className="text-[10px] opacity-70">({opt.count})</span>
                  </button>
                ))}
              </div>

              {filteredListings.length === 0 ? (
                <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${C.beige}` }}>
                  <Package className="w-12 h-12 mx-auto mb-3" style={{ color: C.beige }} />
                  <p className="font-bold" style={{ color: C.slate }}>No listings found</p>
                  <p className="text-sm mt-1 mb-4" style={{ color: C.muted }}>
                    {listingsFilter === 'pending'
                      ? 'No pending listings to review.'
                      : 'All auction listings linked to this charity organisation appear here.'}
                  </p>
                  <Link to="/auctions"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
                    style={{ color: C.emerald, border: `1px solid ${C.beige}` }}>
                    Browse active listings <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.beige}` }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.linen }}>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Item Title</th>
                          <th className="text-left px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Donor</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Current Bid</th>
                          <th className="text-center px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Status</th>
                          <th className="text-right px-6 py-3 font-bold text-[10px] uppercase tracking-widest" style={{ color: C.muted }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map(l => (
                          <tr key={l.uuid ?? l.id} className="border-t" style={{ borderColor: C.beige }}>
                            <td className="px-6 py-4">
                              <p className="font-medium" style={{ color: C.slate }}>{l.title}</p>
                            </td>
                            <td className="px-6 py-4 text-xs" style={{ color: C.muted }}>
                              Donor #{l.donor_id}
                            </td>
                            <td className="px-6 py-4 text-right font-bold font-mono" style={{ color: C.emerald }}>
                              {money(l.current_bid)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {statusPill(l.status)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {l.status === 'pending' && (
                                  <Link to="/charity/listing-reviews"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-opacity hover:opacity-90"
                                    style={{ background: C.emerald }}>
                                    Review
                                  </Link>
                                )}
                                {l.uuid && l.status === 'active' && (
                                  <Link to={`/auctions/${l.uuid}`} target="_blank"
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                                    style={{ color: C.muted }} title="View listing">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {editingCampaign && (
        <DashboardEditCampaignModal
          campaign={editingCampaign}
          form={editCampaignForm}
          errors={editCampaignErrors}
          saving={savingCampaignEdit}
          onClose={closeDashboardCampaignEditModal}
          onSave={saveDashboardCampaignEdit}
          onChange={updateEditCampaignField}
          onImageChange={updateEditCampaignImage}
          onClearImage={clearEditCampaignImage}
        />
      )}
    </div>
  )
}