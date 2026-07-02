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
import { useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, Edit3, Eye, Flag, HeartHandshake, ImageIcon, Lock, Plus, Search, Target, Upload, X, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { Campaign } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#065F46', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E',
  blue: '#1D4ED8', warning: '#92400E', warningLight: '#FFFBEB',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type CampaignStatus = Campaign['status']
type AlertMsg = { type: 'success' | 'error'; text: string } | null

// Local extension because the current shared Campaign type does not yet include a campaign image field.
type CampaignWithImage = Campaign & { image_url?: string }

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

/*
  Mock campaigns are only here so the page can be developed and reviewed before backend integration.
  Field names follow the existing Campaign type in src/types/index.ts.
*/
const mockCampaigns: CampaignWithImage[] = [
  {
    id: 1, charity_id: 1, name: 'Build Schools in Rural Communities',
    description: 'Help us construct 10 new primary schools in underserved rural areas. Every auction item donated raises direct funds for construction and teacher training.',
    status: 'active', end_date: '2026-12-31', total_raised: 18250, active_auctions: 12, created_at: '2026-06-18T10:30:00.000Z',
  },
  {
    id: 2, charity_id: 1, name: "Girls' Education Initiative 2026",
    description: 'Supporting 500 young women through secondary school with scholarships, mentorship and safe learning environments in three countries.',
    status: 'active', end_date: '2026-10-15', total_raised: 9750, active_auctions: 7, created_at: '2026-06-20T14:10:00.000Z',
  },
  {
    id: 3, charity_id: 1, name: 'Emergency Relief — Flood Recovery',
    description: 'Emergency funding for school reconstruction after devastating flooding destroyed infrastructure across four districts.',
    status: 'closed', end_date: '2026-05-30', total_raised: 22100, active_auctions: 0, created_at: '2026-04-05T09:15:00.000Z',
  },
]

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

function formatDate(value?: string) {
  if (!value) return 'No end date'
  const parsedDate = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return parsedDate.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
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
  const [campaigns, setCampaigns] = useState<CampaignWithImage[]>(mockCampaigns)
  const [createForm, setCreateForm] = useState<CampaignForm>(emptyForm)
  const [editForm, setEditForm] = useState<CampaignForm>(emptyForm)
  const [createErrors, setCreateErrors] = useState<CampaignFormErrors>({})
  const [editErrors, setEditErrors] = useState<CampaignFormErrors>({})
  const [message, setMessage] = useState<AlertMsg>(null)
  const [editingCampaign, setEditingCampaign] = useState<CampaignWithImage | null>(null)
  const [confirmCloseId, setConfirmCloseId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all')
  const roles = user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isCharityOrg = roles.includes('charity')
  const isCharityStaff = roles.includes('charity_staff')

  /*
    Temporary approval check following the style used by Staff Management.
    In the final backend, user.is_verified should be replaced/combined with actual charity approval status.
  */
  const canManageCampaigns = isAdmin || ((isCharityOrg || isCharityStaff) && user?.is_verified === true)

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return campaigns.filter((campaign) => {
      const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter
      const matchesSearch = !q || campaign.name.toLowerCase().includes(q) || campaign.description.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [campaigns, search, statusFilter])

  const activeCount = useMemo(() => campaigns.filter((item) => item.status === 'active').length, [campaigns])
  const closedCount = campaigns.length - activeCount
  const totalRaised = useMemo(() => campaigns.reduce((sum, item) => sum + item.total_raised, 0), [campaigns])
  const linkedAuctionCount = useMemo(() => campaigns.reduce((sum, item) => sum + item.active_auctions, 0), [campaigns])

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

  function updateCreateImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setMessage(null)
    if (!file) {
      setCreateForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
      setCreateErrors((prev) => ({ ...prev, image_file: '' }))
      return
    }

    const imageError = validateCampaignImage(file)
    if (imageError) {
      setCreateErrors((prev) => ({ ...prev, image_file: imageError }))
      e.target.value = ''
      return
    }

    readImageAsDataUrl(file, (previewUrl) => {
      setCreateForm((prev) => ({ ...prev, image_file: file, image_preview_url: previewUrl }))
      setCreateErrors((prev) => ({ ...prev, image_file: '' }))
    })
  }

  function updateEditImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setMessage(null)
    if (!file) {
      setEditForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
      setEditErrors((prev) => ({ ...prev, image_file: '' }))
      return
    }

    const imageError = validateCampaignImage(file)
    if (imageError) {
      setEditErrors((prev) => ({ ...prev, image_file: imageError }))
      e.target.value = ''
      return
    }

    readImageAsDataUrl(file, (previewUrl) => {
      setEditForm((prev) => ({ ...prev, image_file: file, image_preview_url: previewUrl }))
      setEditErrors((prev) => ({ ...prev, image_file: '' }))
    })
  }

  function clearCreateImage() {
    setCreateForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
    setCreateErrors((prev) => ({ ...prev, image_file: '' }))
  }

  function clearEditImage() {
    setEditForm((prev) => ({ ...prev, image_file: null, image_preview_url: '' }))
    setEditErrors((prev) => ({ ...prev, image_file: '' }))
  }

  function validateCampaignForm(form: CampaignForm, editingId: number | null) {
    const errors: CampaignFormErrors = {}
    const name = normaliseText(form.name)
    const description = normaliseText(form.description)

    if (!name) errors.name = 'Campaign name is required.'
    else if (name.length < 5) errors.name = 'Campaign name must be at least 5 characters.'
    else if (name.length > 90) errors.name = 'Campaign name must be 90 characters or less.'
    else if (containsUnsafeMarkup(name)) errors.name = 'Campaign name cannot contain script-like content.'
    else if (campaigns.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== editingId)) errors.name = 'A campaign with this name already exists.'

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

  function saveCreateCampaign(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!canManageCampaigns) {
      setMessage({ type: 'error', text: 'Your account is not allowed to create campaigns for this organisation.' })
      return
    }

    const errorMap = validateCampaignForm(createForm, null)
    setCreateErrors(errorMap)
    if (Object.keys(errorMap).length > 0) return

    /*
      TODO: Replace this local insert with POST /api/charities/campaigns.
      Backend should attach the new campaign to the authenticated user's approved charity organisation.
    */
    const newCampaign: CampaignWithImage = {
      id: Date.now(), charity_id: 1, name: normaliseText(createForm.name), description: normaliseText(createForm.description),
      status: 'active', end_date: createForm.end_date || undefined, image_url: createForm.image_preview_url || undefined,
      total_raised: 0, active_auctions: 0, created_at: new Date().toISOString(),
    }

    setCampaigns((prev) => [newCampaign, ...prev])
    setCreateForm(emptyForm)
    setCreateErrors({})
    setStatusFilter('all')
    setMessage({ type: 'success', text: 'Campaign created successfully.' })
  }

  function startEdit(campaign: CampaignWithImage) {
    setEditingCampaign(campaign)
    setConfirmCloseId(null)
    setEditErrors({})
    setMessage(null)
    setEditForm({ name: campaign.name, description: campaign.description, end_date: campaign.end_date ?? '', image_file: null, image_preview_url: campaign.image_url ?? '' })
  }

  function closeEditModal() {
    setEditingCampaign(null)
    setEditForm(emptyForm)
    setEditErrors({})
  }

  function saveEditCampaign(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!editingCampaign) return

    if (!canManageCampaigns) {
      setMessage({ type: 'error', text: 'Your account is not allowed to edit campaigns for this organisation.' })
      return
    }

    const errorMap = validateCampaignForm(editForm, editingCampaign.id)
    setEditErrors(errorMap)
    if (Object.keys(errorMap).length > 0) return

    /*
      TODO: Replace local update with PUT /api/charities/campaigns/:id.
      Backend must verify the current user belongs to the campaign's charity organisation.
    */
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === editingCampaign.id
          ? { ...campaign, name: normaliseText(editForm.name), description: normaliseText(editForm.description), end_date: editForm.end_date || undefined, image_url: editForm.image_preview_url || undefined }
          : campaign,
      ),
    )

    closeEditModal()
    setMessage({ type: 'success', text: 'Campaign updated successfully.' })
  }

  function closeCampaign(id: number) {
    if (!canManageCampaigns) {
      setMessage({ type: 'error', text: 'Your account is not allowed to close campaigns for this organisation.' })
      return
    }

    /*
      TODO: Replace local status change with PATCH /api/charities/campaigns/:id/close.
      Closing is used instead of deleting so auction links, receipts and audit trails remain traceable.
    */
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === id
          ? { ...campaign, status: 'closed', end_date: campaign.end_date ?? todayForInput(), active_auctions: 0 }
          : campaign,
      ),
    )
    setConfirmCloseId(null)
    setMessage({ type: 'success', text: 'Campaign closed successfully. Existing records are kept for traceability.' })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <Header />
        {!canManageCampaigns && <Alert msg={{ type: 'error', text: 'Your charity account must be approved before you can manage campaigns.' }} />}
        {message && <Alert msg={message} />}

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 mt-6">
          <main className="space-y-6">
            <Card icon={<Plus className="w-5 h-5" />} title="Create campaign" desc="Set up a fundraising campaign that auction listings can support.">
              <form onSubmit={saveCreateCampaign} noValidate className="space-y-5">
                <TextInput label="Campaign name" value={createForm.name} error={createErrors.name} disabled={!canManageCampaigns} autoComplete="off" placeholder="e.g. Build Schools in Rural Communities" onChange={(e) => updateCreateField('name', e.target.value)} />
                <TextAreaInput label="Campaign description" value={createForm.description} error={createErrors.description} disabled={!canManageCampaigns} placeholder="Explain what this campaign is raising awareness and funds for." note="Plain text only. Script-like content will be rejected." onChange={(e) => updateCreateField('description', e.target.value)} />
                <ImageUploadInput label="Campaign image" previewUrl={createForm.image_preview_url} error={createErrors.image_file} disabled={!canManageCampaigns} note="Optional. Accepted formats: JPG, PNG or WEBP, up to 2MB." onChange={updateCreateImage} onClear={clearCreateImage} />

                <div className="grid md:grid-cols-2 gap-4 items-end">
                  <TextInput label="Optional end date" type="date" value={createForm.end_date} error={createErrors.end_date} disabled={!canManageCampaigns} min={todayForInput()} onChange={(e) => updateCreateField('end_date', e.target.value)} />
                  <div className="flex justify-end">
                    <PrimaryButton disabled={!canManageCampaigns} icon={<Plus className="w-4 h-4" />} label="Create campaign" />
                  </div>
                </div>
              </form>
            </Card>

            <Card icon={<HeartHandshake className="w-5 h-5" />} title="Campaign records" desc="Search, edit and close campaigns created by your charity organisation.">
              <div className="grid md:grid-cols-[1fr_180px] gap-3 mb-5">
                <SearchBox value={search} onChange={setSearch} />
                <StatusFilter value={statusFilter} onChange={setStatusFilter} />
              </div>
              <CampaignGrid campaigns={filteredCampaigns} canManageCampaigns={canManageCampaigns} confirmCloseId={confirmCloseId} onEdit={startEdit} onAskClose={setConfirmCloseId} onCancelClose={() => setConfirmCloseId(null)} onConfirmClose={closeCampaign} />
            </Card>
          </main>

          <aside className="space-y-6">
            <OverviewCard total={campaigns.length} active={activeCount} closed={closedCount} totalRaised={totalRaised} linkedAuctions={linkedAuctionCount} />
            <InfoCard title="Security reminder" tone="warning">
              Frontend checks are for usability. Backend still needs RBAC, ownership checks, sanitisation and audit logging.
            </InfoCard>
          </aside>
        </div>
      </div>

      {editingCampaign && <EditCampaignModal campaign={editingCampaign} form={editForm} errors={editErrors} onClose={closeEditModal} onSave={saveEditCampaign} onChange={updateEditField} onImageChange={updateEditImage} onClearImage={clearEditImage} />}
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
  confirmCloseId: number | null
  onEdit: (campaign: CampaignWithImage) => void
  onAskClose: (id: number) => void
  onCancelClose: () => void
  onConfirmClose: (id: number) => void
}

function CampaignGrid({ campaigns, canManageCampaigns, confirmCloseId, onEdit, onAskClose, onCancelClose, onConfirmClose }: CampaignGridProps) {
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
    <div className="grid xl:grid-cols-2 gap-4">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} canManageCampaigns={canManageCampaigns} isConfirmingClose={confirmCloseId === campaign.id} onEdit={onEdit} onAskClose={onAskClose} onCancelClose={onCancelClose} onConfirmClose={onConfirmClose} />
      ))}
    </div>
  )
}

type CampaignCardProps = {
  campaign: CampaignWithImage
  canManageCampaigns: boolean
  isConfirmingClose: boolean
  onEdit: (campaign: CampaignWithImage) => void
  onAskClose: (id: number) => void
  onCancelClose: () => void
  onConfirmClose: (id: number) => void
}

function CampaignCard({ campaign, canManageCampaigns, isConfirmingClose, onEdit, onAskClose, onCancelClose, onConfirmClose }: CampaignCardProps) {
  const isClosed = campaign.status === 'closed'
  const actionsDisabled = !canManageCampaigns || isClosed

  return (
    <article className="rounded-2xl p-5 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
      <CampaignImage src={campaign.image_url} />

      <div className="flex items-start justify-between gap-3 mt-4">
        <div className="min-w-0">
          <h3 className="font-bold text-base leading-snug" style={{ color: C.slate }}>{campaign.name}</h3>
          <p className="text-sm leading-relaxed mt-3" style={{ color: C.muted }}>{campaign.description}</p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t" style={{ borderColor: C.linen }}>
        <MetaItem icon={<CalendarDays className="w-4 h-4" />} label="End date" value={formatDate(campaign.end_date)} />
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
              <button type="button" onClick={() => onConfirmClose(campaign.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: C.danger }}>
                Confirm close
              </button>
              <button type="button" onClick={onCancelClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <CampaignActionButton label="Edit" icon={<Edit3 className="w-3.5 h-3.5" />} disabled={actionsDisabled} onClick={() => onEdit(campaign)} />
            <CampaignActionButton label="Close" icon={<Lock className="w-3.5 h-3.5" />} danger disabled={actionsDisabled} onClick={() => onAskClose(campaign.id)} />
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
  onClose: () => void
  onSave: (e: FormEvent) => void
  onChange: (field: CampaignField, value: string) => void
  onImageChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClearImage: () => void
}

function EditCampaignModal({
  campaign, form, errors, onClose, onSave, onChange, onImageChange, onClearImage,
}: EditCampaignModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-8" style={{ background: 'rgba(45, 58, 58, 0.45)' }}>
      {/* Overlay uses overflow-y-auto so the modal can scroll when the form is taller than the screen. */}
      <div className="min-h-full flex items-start justify-center">
        <section className="w-full max-w-2xl bg-white rounded-2xl shadow-xl" style={{ border: `1px solid ${C.beige}` }}>
          <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: C.beige }}>
            <div>
              <h2 className="text-lg font-bold" style={{ color: C.slate }}>Edit campaign</h2>
              <p className="text-sm mt-0.5" style={{ color: C.muted }}>{campaign.name}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-[#F7F5F0]" aria-label="Close edit campaign modal">
              <X className="w-5 h-5" style={{ color: C.muted }} />
            </button>
          </div>

          <form onSubmit={onSave} noValidate className="px-6 py-6 space-y-5">
            <TextInput label="Campaign name" value={form.name} error={errors.name} autoComplete="off" onChange={(e) => onChange('name', e.target.value)} />
            <TextAreaInput label="Campaign description" value={form.description} error={errors.description} note="Do not paste HTML, JavaScript or tracking snippets here." onChange={(e) => onChange('description', e.target.value)} />
            <ImageUploadInput label="Campaign image" previewUrl={form.image_preview_url} error={errors.image_file} note="Optional. Upload a new image to replace the current preview." onChange={onImageChange} onClear={onClearImage} />
            <TextInput label="Optional end date" type="date" value={form.end_date} error={errors.end_date} min={todayForInput()} onChange={(e) => onChange('end_date', e.target.value)} />

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>
                Cancel
              </button>
              <PrimaryButton icon={<Edit3 className="w-4 h-4" />} label="Save changes" />
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function OverviewCard({ total, active, closed, totalRaised, linkedAuctions }: { total: number; active: number; closed: number; totalRaised: number; linkedAuctions: number }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-6" style={{ border: `1px solid ${C.beige}` }}>
      <div className="flex items-center gap-3 mb-5">
        <IconBox><HeartHandshake className="w-5 h-5" /></IconBox>
        <div>
          <h2 className="text-base font-bold" style={{ color: C.slate }}>Campaign overview</h2>
          <p className="text-xs" style={{ color: C.muted }}>For your organisation</p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <StatusRow label="Total campaigns" value={String(total)} color={C.slate} />
        <StatusRow label="Active campaigns" value={String(active)} color={C.emerald} />
        <StatusRow label="Closed campaigns" value={String(closed)} color={C.danger} />
        <StatusRow label="Linked active auctions" value={String(linkedAuctions)} color={C.blue} />
        <StatusRow label="Total raised" value={formatMoney(totalRaised)} color={C.emeraldDark} />
      </div>
    </section>
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

function InfoCard({ title, tone, children }: { title: string; tone: 'warning' | 'success'; children: ReactNode }) {
  const isWarning = tone === 'warning'
  const color = isWarning ? C.warning : C.emerald
  return (
    <section className="rounded-2xl p-5" style={{ background: isWarning ? C.warningLight : C.emeraldLight, border: `1px solid ${isWarning ? '#FDE68A' : '#A7F3D0'}` }}>
      <h3 className="font-bold text-sm mb-2" style={{ color }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color }}>{children}</p>
    </section>
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

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: C.muted }}>{label}</span>
      <span className="font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}
