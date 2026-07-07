/*
  Campaign Management Page
  ---------------------------------------------------------------------------
  This page lets Charity Organisations / Charity Staff create, edit and close charity campaigns.

  Backend integration later:
  - GET    /api/charities/campaigns
  - POST   /api/charities/campaigns
  - PUT    /api/charities/campaigns/:id
  - PATCH  /api/charities/campaigns/:id/close

  Security note:
  Backend must still enforce RBAC, charity ownership, input validation, sanitisation and audit logging.
*/
import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Edit3, Eye, Flag, HeartHandshake, ImageIcon, Loader2, Lock, Plus, Search, Target, Upload, X, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import type { ApiError, Campaign } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#065F46', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E',
  blue: '#1D4ED8', warning: '#92400E', warningLight: '#FFFBEB',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type CampaignStatus = Campaign['status']
type AlertMsg = { type: 'success' | 'error'; text: string } | null

type CampaignWithImage = Campaign & { image_url?: string }

interface CampaignListResponse {
  campaigns: CampaignWithImage[]
  canManageCampaigns: boolean
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

const emptyForm: CampaignForm = { name: '', description: '', end_date: '', image_file: null, image_preview_url: '' }

const CAMPAIGNS_PER_PAGE = 4

const END_DATE_HELP_TEXT =
  'Optional. If selected, the campaign stays active until 11:59 PM Singapore time on that date. Leave blank to keep it open until manually closed.'

function apiErrMsg(err: unknown, fallback: string): string {
  return (err as ApiError)?.message || fallback
}

function todayForInput() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`, background: C.white,
    color: C.slate, fontSize: '14px', outline: 'none', ...extra,
  }
}

function formatEndDate(value?: string) {
  if (!value) return 'No end date'
  // Campaign end dates are stored as date-only values. The UI makes the
  // business meaning explicit so users know the selected date includes the
  // full day, rather than ending at the start of the date.
  const dateOnly = value.slice(0, 10)
  const [year, month, day] = dateOnly.split('-').map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  const formattedDate = parsedDate.toLocaleDateString('en-SG', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
  return `${formattedDate}, 11:59 PM SGT`
}

function formatMoney(value: number) {
  return `$${value.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function statusText(status: CampaignStatus) {
  return status === 'active' ? 'Active' : 'Closed'
}

function statusStyle(status: CampaignStatus): CSSProperties {
  return status === 'active' ? { background: C.emeraldLight, color: C.emerald } : { background: C.dangerLight, color: C.danger }
}

function normaliseText(value: string) {
  // Keeps user content as plain text while removing excessive internal spacing.
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
  /*
    Frontend early rejection for common script-like payloads.
    This does not replace server-side sanitisation; it only gives users fast feedback.
  */
  const unsafePatterns = [/<\s*script/i, /<\s*iframe/i, /<\s*object/i, /<\s*embed/i, /javascript\s*:/i, /data\s*:\s*text\/html/i, /on\w+\s*=/i]
  return unsafePatterns.some((pattern) => pattern.test(value))
}

function validateCampaignImage(file: File) {
  // Frontend file checks improve user feedback; backend must still verify MIME type, extension and file content.
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  const maxSizeInBytes = 2 * 1024 * 1024
  if (!allowedTypes.includes(file.type)) return 'Campaign image must be a JPG, PNG or WEBP file.'
  if (file.size > maxSizeInBytes) return 'Campaign image must be 2MB or smaller.'
  return ''
}

function readImageAsDataUrl(file: File, onReady: (value: string) => void) {
  // FileReader creates a temporary preview for frontend-only development before backend uploads are ready.
  const reader = new FileReader()
  reader.onload = () => onReady(String(reader.result ?? ''))
  reader.readAsDataURL(file)
}

function updateKnownField(form: CampaignForm, field: CampaignField, value: string): CampaignForm {
  return { ...form, [field]: value }
}

function clearKnownError(errors: CampaignFormErrors, field: CampaignField): CampaignFormErrors {
  return { ...errors, [field]: '' }
}

export default function CampaignManagementPage() {
  const { user } = useAuthStore()
  const [campaigns, setCampaigns] = useState<CampaignWithImage[]>([])
  const [loading, setLoading] = useState(false)
  const [canManageCampaigns, setCanManageCampaigns] = useState(false)
  const [createForm, setCreateForm] = useState<CampaignForm>(emptyForm)
  const [editForm, setEditForm] = useState<CampaignForm>(emptyForm)
  const [createErrors, setCreateErrors] = useState<CampaignFormErrors>({})
  const [editErrors, setEditErrors] = useState<CampaignFormErrors>({})
  const [message, setMessage] = useState<AlertMsg>(null)
  const [editingCampaign, setEditingCampaign] = useState<CampaignWithImage | null>(null)
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const roles = user?.roles ?? []
  const hasManageRole = roles.includes('admin') || roles.includes('charity') || roles.includes('charity_staff')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setCampaigns([])
      setCanManageCampaigns(false)
      setLoading(true)
      try {
        const res = await api.get<CampaignListResponse>('/charities/campaigns')
        if (cancelled) return
        setCampaigns(res.data.campaigns)
        setCanManageCampaigns(res.data.canManageCampaigns)
      } catch (err) {
        if (cancelled) return
        setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to load campaigns.') })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (hasManageRole) void load()
    return () => { cancelled = true }
  }, [user?.id, hasManageRole])

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return campaigns.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [campaigns, search, statusFilter])

  const totalCampaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / CAMPAIGNS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalCampaignPages)
  const paginatedCampaigns = useMemo(() => {
    const start = (safeCurrentPage - 1) * CAMPAIGNS_PER_PAGE
    return filteredCampaigns.slice(start, start + CAMPAIGNS_PER_PAGE)
  }, [filteredCampaigns, safeCurrentPage])

  function updateCreateField(field: CampaignField, value: string) {
    setCreateForm((prev) => updateKnownField(prev, field, value))
    setCreateErrors((prev) => clearKnownError(prev, field))
    setMessage(null)
  }

  function updateEditField(field: CampaignField, value: string) {
    setEditForm((prev) => updateKnownField(prev, field, value))
    setEditErrors((prev) => clearKnownError(prev, field))
    setMessage(null)
  }

  function updateSearch(value: string) {
    // Reset the records page when the search text changes so users do not land
    // on an empty later page after narrowing the campaign list.
    setSearch(value)
    setCurrentPage(1)
  }

  function updateStatusFilter(value: 'all' | CampaignStatus) {
    // Keep pagination predictable when switching between all/active/closed views.
    setStatusFilter(value)
    setCurrentPage(1)
  }

  function updateCreateImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setMessage(null)
    if (!file) { setCreateForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' })); return }
    const err = validateCampaignImage(file)
    if (err) { setCreateErrors((prev) => ({ ...prev, image_file: err })); e.target.value = ''; return }
    readImageAsDataUrl(file, (url) => setCreateForm((prev) => ({ ...prev, image_file: file, image_preview_url: url })))
    setCreateErrors((prev) => ({ ...prev, image_file: '' }))
  }

  function updateEditImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setMessage(null)
    if (!file) { setEditForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' })); return }
    const err = validateCampaignImage(file)
    if (err) { setEditErrors((prev) => ({ ...prev, image_file: err })); e.target.value = ''; return }
    readImageAsDataUrl(file, (url) => setEditForm((prev) => ({ ...prev, image_file: file, image_preview_url: url })))
    setEditErrors((prev) => ({ ...prev, image_file: '' }))
  }

  function clearCreateImage() { setCreateForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' })) }
  function clearEditImage() { setEditForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' })) }

  function validateCampaignForm(form: CampaignForm, editingUuid: string | null) {
    const errors: CampaignFormErrors = {}
    const name = normaliseText(form.name)
    const description = normaliseText(form.description)
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
    if (form.image_file) { const e = validateCampaignImage(form.image_file); if (e) errors.image_file = e }
    return errors
  }

  async function saveCreateCampaign(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const errorMap = validateCampaignForm(createForm, null)
    setCreateErrors(errorMap)
    if (Object.keys(errorMap).length > 0) return
    const fd = new FormData()
    fd.append('name', normaliseText(createForm.name))
    fd.append('description', normaliseText(createForm.description))
    if (createForm.end_date) fd.append('end_date', createForm.end_date)
    if (createForm.image_file) fd.append('image', createForm.image_file)
    setCreating(true)
    try {
      const res = await api.post<CampaignWithImage>('/charities/campaigns', fd)
      setCampaigns((prev) => [res.data, ...prev])
      setCreateForm(emptyForm)
      setCreateErrors({})
      setStatusFilter('all')
      setCurrentPage(1)
      setMessage({ type: 'success', text: 'Campaign created successfully.' })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.errors) setCreateErrors(apiErr.errors as CampaignFormErrors)
      setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to create campaign.') })
    } finally {
      setCreating(false)
    }
  }

  function startEdit(campaign: CampaignWithImage) {
    setEditingCampaign(campaign)
    setConfirmCloseId(null)
    setEditErrors({})
    setMessage(null)
    const existingImageUrl = campaign.hasImage ? `/api/charities/campaigns/${campaign.uuid}/image` : ''
    setEditForm({ name: campaign.name, description: campaign.description, end_date: campaign.end_date ?? '', image_file: null, image_preview_url: existingImageUrl })
  }

  function closeEditModal() { setEditingCampaign(null); setEditForm(emptyForm); setEditErrors({}) }

  async function saveEditCampaign(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!editingCampaign) return
    const errorMap = validateCampaignForm(editForm, editingCampaign.uuid)
    setEditErrors(errorMap)
    if (Object.keys(errorMap).length > 0) return
    const fd = new FormData()
    fd.append('name', normaliseText(editForm.name))
    fd.append('description', normaliseText(editForm.description))
    if (editForm.end_date) fd.append('end_date', editForm.end_date)
    if (editForm.image_file) {
      fd.append('image', editForm.image_file)
    } else if (!editForm.image_preview_url) {
      fd.append('remove_image', 'true')
    }
    setSaving(true)
    try {
      const res = await api.put<CampaignWithImage>(`/charities/campaigns/${editingCampaign.uuid}`, fd)
      setCampaigns((prev) => prev.map((c) => (c.uuid === editingCampaign.uuid ? res.data : c)))
      closeEditModal()
      setMessage({ type: 'success', text: 'Campaign updated successfully.' })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.errors) setEditErrors(apiErr.errors as CampaignFormErrors)
      setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to update campaign.') })
    } finally {
      setSaving(false)
    }
  }

  async function closeCampaign(uuid: string) {
    setClosingId(uuid)
    try {
      const res = await api.patch<CampaignWithImage>(`/charities/campaigns/${uuid}/close`)
      setCampaigns((prev) => prev.map((c) => (c.uuid === uuid ? res.data : c)))
      setConfirmCloseId(null)
      setMessage({ type: 'success', text: 'Campaign closed. Records kept for traceability.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to close campaign.') })
    } finally {
      setClosingId(null)
    }
  }

  const showApprovalAlert = !loading && hasManageRole && !canManageCampaigns

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <Header />
        {showApprovalAlert && <Alert msg={{ type: 'error', text: 'Your charity account must be approved before you can manage campaigns.' }} />}
        {message && <Alert msg={message} />}

        <div className="space-y-6 mt-6">
          <Card icon={<Plus className="w-5 h-5" />} title="Create campaign" desc="Set up a fundraising campaign that auction listings can support.">
            <form onSubmit={saveCreateCampaign} noValidate className="space-y-5">
              <TextInput label="Campaign name" value={createForm.name} error={createErrors.name} disabled={!canManageCampaigns || creating} autoComplete="off" placeholder="e.g. Build Schools in Rural Communities" onChange={(e) => updateCreateField('name', e.target.value)} />
              <TextAreaInput label="Campaign description" value={createForm.description} error={createErrors.description} disabled={!canManageCampaigns || creating} placeholder="Explain what this campaign is raising awareness and funds for." note="Plain text only. Script-like content will be rejected." onChange={(e) => updateCreateField('description', e.target.value)} />
              <ImageUploadInput label="Campaign image" previewUrl={createForm.image_preview_url} error={createErrors.image_file} disabled={!canManageCampaigns || creating} note="Optional. Accepted formats: JPG, PNG or WEBP, up to 2MB." onChange={updateCreateImage} onClear={clearCreateImage} />
              <div className="grid md:grid-cols-[minmax(0,1fr)_220px] gap-4 items-end">
                <TextInput label="Optional end date" type="date" value={createForm.end_date} error={createErrors.end_date} note={END_DATE_HELP_TEXT} disabled={!canManageCampaigns || creating} min={todayForInput()} onChange={(e) => updateCreateField('end_date', e.target.value)} />
                <div className="flex justify-end">
                  <PrimaryButton disabled={!canManageCampaigns || creating} icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} label={creating ? 'Creating...' : 'Create campaign'} />
                </div>
              </div>
            </form>
          </Card>

          <Card icon={<HeartHandshake className="w-5 h-5" />} title="Campaign records" desc="Search, edit and close campaigns created by your charity organisation.">
            <div className="grid md:grid-cols-[1fr_180px] gap-3 mb-5">
              <SearchBox value={search} onChange={updateSearch} />
              <StatusFilter value={statusFilter} onChange={updateStatusFilter} />
            </div>
            {loading ? (
              <div className="text-center py-12" style={{ color: C.muted }}>
                <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />
                <p className="text-sm">Loading campaigns...</p>
              </div>
            ) : (
              <>
                <CampaignGrid campaigns={paginatedCampaigns} canManageCampaigns={canManageCampaigns} confirmCloseId={confirmCloseId} closingId={closingId} onEdit={startEdit} onAskClose={setConfirmCloseId} onCancelClose={() => setConfirmCloseId(null)} onConfirmClose={closeCampaign} />
                {filteredCampaigns.length > 0 && (
                  <PaginationControls currentPage={safeCurrentPage} totalPages={totalCampaignPages} totalItems={filteredCampaigns.length} pageSize={CAMPAIGNS_PER_PAGE} onPageChange={setCurrentPage} />
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {editingCampaign && <EditCampaignModal campaign={editingCampaign} form={editForm} errors={editErrors} saving={saving} onClose={closeEditModal} onSave={saveEditCampaign} onChange={updateEditField} onImageChange={updateEditImage} onClearImage={clearEditImage} />}
    </div>
  )
}

function Header() {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold" style={{ color: C.slate }}>Campaign Management</h1>
      <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>
        Create, edit and close charity campaigns that auction listings can support.
      </p>
    </div>
  )
}

type CampaignGridProps = {
  campaigns: CampaignWithImage[]
  canManageCampaigns: boolean
  confirmCloseId: string | null
  closingId: string | null
  onEdit: (campaign: CampaignWithImage) => void
  onAskClose: (uuid: string) => void
  onCancelClose: () => void
  onConfirmClose: (uuid: string) => void
}

function CampaignGrid({ campaigns, canManageCampaigns, confirmCloseId, closingId, onEdit, onAskClose, onCancelClose, onConfirmClose }: CampaignGridProps) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl" style={{ background: C.linen }}>
        <XCircle className="w-9 h-9 mx-auto mb-3" style={{ color: C.beige }} />
        <p className="font-medium" style={{ color: C.slate }}>No campaigns found</p>
        <p className="text-sm mt-1" style={{ color: C.muted }}>Try changing your search keyword or status filter.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.uuid} campaign={campaign} canManageCampaigns={canManageCampaigns} isConfirmingClose={confirmCloseId === campaign.uuid} isClosing={closingId === campaign.uuid} onEdit={onEdit} onAskClose={onAskClose} onCancelClose={onCancelClose} onConfirmClose={onConfirmClose} />
      ))}
    </div>
  )
}

type CampaignCardProps = {
  campaign: CampaignWithImage
  canManageCampaigns: boolean
  isConfirmingClose: boolean
  isClosing: boolean
  onEdit: (campaign: CampaignWithImage) => void
  onAskClose: (uuid: string) => void
  onCancelClose: () => void
  onConfirmClose: (uuid: string) => void
}

function CampaignCard({ campaign, canManageCampaigns, isConfirmingClose, isClosing, onEdit, onAskClose, onCancelClose, onConfirmClose }: CampaignCardProps) {
  const isClosed = campaign.status === 'closed'
  const actionsDisabled = !canManageCampaigns || isClosed
  const imageUrl = campaign.hasImage ? `/api/charities/campaigns/${campaign.uuid}/image` : undefined

  return (
    <article className="rounded-2xl p-5 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
      <CampaignImage src={imageUrl} />

      <div className="flex items-start justify-between gap-3 mt-4">
        <div className="min-w-0 flex-1">
          <h3
            className="font-bold text-base leading-snug break-words"
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
            className="text-sm leading-relaxed mt-3 break-words"
            style={{
              color: C.muted,
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {campaign.description}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t" style={{ borderColor: C.linen }}>
        <MetaItem icon={<CalendarDays className="w-4 h-4" />} label="End date/time" value={formatEndDate(campaign.end_date)} />
        <MetaItem icon={<Target className="w-4 h-4" />} label="Raised" value={formatMoney(campaign.total_raised)} />
        <MetaItem icon={<Eye className="w-4 h-4" />} label="Linked auctions" value={isClosed ? 'Campaign closed' : String(campaign.active_auctions)} />
        <MetaItem icon={<Flag className="w-4 h-4" />} label="Status" value={statusText(campaign.status)} />
      </div>

      <div className="mt-5 pt-5 border-t" style={{ borderColor: C.linen }}>
        {isConfirmingClose ? (
          <div className="rounded-xl p-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
            <p className="text-sm font-medium mb-3" style={{ color: C.danger }}>
              Close this campaign? This keeps the record but prevents further campaign activity.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => onConfirmClose(campaign.uuid)} disabled={isClosing} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: C.danger, cursor: isClosing ? 'not-allowed' : 'pointer' }}>
                {isClosing ? 'Closing...' : 'Confirm close'}
              </button>
              <button type="button" onClick={onCancelClose} disabled={isClosing} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <CampaignActionButton label="Edit" icon={<Edit3 className="w-3.5 h-3.5" />} disabled={actionsDisabled} onClick={() => onEdit(campaign)} />
            <CampaignActionButton label="Close" icon={<Lock className="w-3.5 h-3.5" />} danger disabled={actionsDisabled} onClick={() => onAskClose(campaign.uuid)} />
          </div>
        )}
      </div>
    </article>
  )
}

type EditCampaignModalProps = {
  campaign: CampaignWithImage
  form: CampaignForm
  errors: CampaignFormErrors
  saving: boolean
  onClose: () => void
  onSave: (e: FormEvent) => void
  onChange: (field: CampaignField, value: string) => void
  onImageChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClearImage: () => void
}

function EditCampaignModal({ campaign, form, errors, saving, onClose, onSave, onChange, onImageChange, onClearImage }: EditCampaignModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-8" style={{ background: 'rgba(45, 58, 58, 0.45)' }}>
      <div className="min-h-full flex items-start justify-center">
        <section className="w-full max-w-2xl bg-white rounded-2xl shadow-xl" style={{ border: `1px solid ${C.beige}` }}>
          <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: C.beige }}>
            <div>
              <h2 className="text-lg font-bold" style={{ color: C.slate }}>Edit campaign</h2>
              <p className="text-sm mt-0.5" style={{ color: C.muted }}>{campaign.name}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-[#F7F5F0]" aria-label="Close edit campaign modal">
              <X className="w-5 h-5" style={{ color: C.muted }} />
            </button>
          </div>

          <form onSubmit={onSave} noValidate className="px-6 py-6 space-y-5">
            <TextInput label="Campaign name" value={form.name} error={errors.name} disabled={saving} autoComplete="off" onChange={(e) => onChange('name', e.target.value)} />
            <TextAreaInput label="Campaign description" value={form.description} error={errors.description} disabled={saving} note="Do not paste HTML, JavaScript or tracking snippets here." onChange={(e) => onChange('description', e.target.value)} />
            <ImageUploadInput label="Campaign image" previewUrl={form.image_preview_url} error={errors.image_file} disabled={saving} note="Optional. Upload a new image to replace the current preview." onChange={onImageChange} onClear={onClearImage} />
            <TextInput label="Optional end date" type="date" value={form.end_date} error={errors.end_date} note={END_DATE_HELP_TEXT} disabled={saving} min={todayForInput()} onChange={(e) => onChange('end_date', e.target.value)} />

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>
                Cancel
              </button>
              <PrimaryButton disabled={saving} icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />} label={saving ? 'Saving...' : 'Save changes'} />
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function PaginationControls({ currentPage, totalPages, totalItems, pageSize, onPageChange }: { currentPage: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void }) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(totalItems, currentPage * pageSize)

  function goToPage(page: number) {
    // Clamp page numbers so button mashing cannot push the UI outside the
    // available page range. Tiny guardrail, big peace of mind.
    onPageChange(Math.min(Math.max(page, 1), totalPages))
  }

  return (
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-t pt-5" style={{ borderColor: C.linen }}>
      <p className="text-sm" style={{ color: C.muted }}>
        Showing <span className="font-semibold" style={{ color: C.slate }}>{startItem}-{endItem}</span> of <span className="font-semibold" style={{ color: C.slate }}>{totalItems}</span> campaign records
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-2 rounded-xl text-sm font-semibold border inline-flex items-center gap-1.5" style={{ borderColor: C.beige, color: currentPage === 1 ? C.muted : C.slate, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', background: C.white }}>
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => {
          const isActive = page === currentPage
          return (
            <button key={page} type="button" onClick={() => goToPage(page)} className="w-10 h-10 rounded-xl text-sm font-bold border" style={{ borderColor: isActive ? C.emerald : C.beige, color: isActive ? C.white : C.slate, background: isActive ? C.emerald : C.white }} aria-current={isActive ? 'page' : undefined}>
              {page}
            </button>
          )
        })}
        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-2 rounded-xl text-sm font-semibold border inline-flex items-center gap-1.5" style={{ borderColor: C.beige, color: currentPage === totalPages ? C.muted : C.slate, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', background: C.white }}>
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function CampaignImage({ src }: { src?: string }) {
  if (src) {
    return <img src={src} alt="Campaign preview" className="h-36 w-full rounded-2xl object-cover" />
  }
  return (
    <div className="h-36 rounded-2xl flex flex-col items-center justify-center" style={{ background: '#E5E7EB', color: '#8A97A8' }}>
      <ImageIcon className="w-8 h-8 mb-2" />
      <p className="text-sm">Campaign Image</p>
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.beige }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search campaign name or description" style={inputSt(false, { paddingLeft: '40px' })} />
    </div>
  )
}

function StatusFilter({ value, onChange }: { value: 'all' | CampaignStatus; onChange: (value: 'all' | CampaignStatus) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as 'all' | CampaignStatus)} style={inputSt(false)} aria-label="Filter campaigns by status">
      <option value="all">All statuses</option>
      <option value="active">Active only</option>
      <option value="closed">Closed only</option>
    </select>
  )
}

type ImageUploadInputProps = {
  label: string
  previewUrl: string
  error?: string
  note?: string
  disabled?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
}

function ImageUploadInput({ label, previewUrl, error, note, disabled, onChange, onClear }: ImageUploadInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: error ? C.danger : C.beige, background: disabled ? C.linen : C.white }}>
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
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

type TextInputProps = {
  label: string
  type?: 'text' | 'date'
  value: string
  error?: string
  note?: string
  disabled?: boolean
  placeholder?: string
  min?: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  autoComplete?: string
}

function TextInput({ label, type = 'text', value, error, note, disabled, placeholder, min, onChange, autoComplete }: TextInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        autoComplete={autoComplete}
        style={inputSt(!!error, { background: disabled ? C.linen : C.white, color: disabled ? C.muted : C.slate, cursor: disabled ? 'not-allowed' : 'text' })}
        onFocus={(e) => { e.target.style.borderColor = C.emerald }}
        onBlur={(e) => { e.target.style.borderColor = error ? C.danger : C.beige }}
      />
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

type TextAreaInputProps = {
  label: string
  value: string
  error?: string
  note?: string
  disabled?: boolean
  placeholder?: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}

function TextAreaInput({ label, value, error, note, disabled, placeholder, onChange }: TextAreaInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <textarea
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        rows={5}
        style={inputSt(!!error, { resize: 'vertical', background: disabled ? C.linen : C.white, color: disabled ? C.muted : C.slate, cursor: disabled ? 'not-allowed' : 'text' })}
        onFocus={(e) => { e.target.style.borderColor = C.emerald }}
        onBlur={(e) => { e.target.style.borderColor = error ? C.danger : C.beige }}
      />
      <div className="flex items-start justify-between gap-3 mt-1">
        <div>
          {note && <p className="text-xs" style={{ color: C.muted }}>{note}</p>}
          {error && <p className="text-xs" style={{ color: C.danger }}>{error}</p>}
        </div>
        <p className="text-xs flex-shrink-0" style={{ color: C.muted }}>{value.trim().length}/600</p>
      </div>
    </div>
  )
}

function Card({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="px-6 py-5 border-b flex items-start gap-3" style={{ borderColor: C.beige }}>
        <IconBox>{icon}</IconBox>
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.slate }}>{title}</h2>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>{desc}</p>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function Alert({ msg }: { msg: AlertMsg }) {
  if (!msg) return null
  const isErr = msg.type === 'error'
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: isErr ? C.dangerLight : C.emeraldLight, border: `1px solid ${isErr ? C.dangerBorder : '#A7F3D0'}` }}>
      {isErr ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />}
      <p className="text-sm font-medium" style={{ color: isErr ? C.danger : C.emerald }}>{msg.text}</p>
    </div>
  )
}

function PrimaryButton({ icon, label, disabled }: { icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ background: disabled ? '#6ba88e' : C.emerald, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {icon}
      {label}
    </button>
  )
}

function CampaignActionButton({ label, icon, disabled, danger, onClick }: { label: string; icon: ReactNode; disabled: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5"
      style={{ borderColor: danger ? C.dangerBorder : C.beige, color: disabled ? C.muted : danger ? C.danger : C.slate, cursor: disabled ? 'not-allowed' : 'pointer', background: C.white }}
    >
      {icon}
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0" style={statusStyle(status)}>{statusText(status)}</span>
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5" style={{ color: C.beige }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>{label}</p>
        <p className="text-sm font-semibold truncate" style={{ color: C.slate }}>{value}</p>
      </div>
    </div>
  )
}

function IconBox({ children }: { children: ReactNode }) {
  return <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight, color: C.emerald }}>{children}</div>
}
