import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ExternalLink, Gavel, Image as ImageIcon, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react'
import api from '../services/api'
import type { ApiError, DonorListingTrackingItem, DonorListingTrackingResponse, ItemCondition } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#035c43',
  emeraldLight: '#ECFDF5', beige: '#BBB09B', linen: '#F7F5F0',
  white: '#FFFFFF', muted: '#5C6E6E', mauve: '#A675A1', mauveLight: '#F5EFF5',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA', amber: '#D97706', amberLight: '#FFFBEB',
}

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const SAFE_IMAGE_SRC = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|\/api\/[^\s<>"']+|https?:\/\/[^\s<>"']+)$/i
const isSafeImageSrc = (value: string): boolean => SAFE_IMAGE_SRC.test(value)

const toSafePreviewUrl = (file: File): string => URL.createObjectURL(file).replace(/[<>"'&]/g, '')

const DATE_FORMATTER = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' })

interface EditForm {
  title: string
  description: string
  category: string
  condition: ItemCondition
  existingImages: string[]
  newImages: File[]
}

type TrackingFilterStatus = 'all' | DonorListingTrackingItem['trackingFilterStatus']

function money(value: unknown): string {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

function formatDateTime(value?: string): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : DATE_FORMATTER.format(date)
}

function statusStyle(listing: DonorListingTrackingItem) {
  if (listing.trackingFilterStatus === 'upcoming') return { bg: C.amberLight, fg: C.amber, label: 'Upcoming' }

  switch (listing.status) {
    case 'active': return { bg: C.emeraldLight, fg: C.emeraldDark, label: 'Active' }
    case 'pending':
    case 'changes_requested':
    case 'charity_review':
      return { bg: C.amberLight, fg: C.amber, label: 'Pending Review' }
    case 'sold':
    case 'shipped':
    case 'delivered':
      return { bg: C.mauveLight, fg: C.mauve, label: 'Sold' }
    case 'expired': return { bg: '#F3F4F6', fg: '#4B5563', label: 'Expired' }
    case 'cancelled': return { bg: C.dangerLight, fg: C.danger, label: 'Cancelled' }
    case 'rejected': return { bg: C.dangerLight, fg: C.danger, label: 'Rejected' }
    default: return { bg: '#F3F4F6', fg: '#4B5563', label: 'Other' }
  }
}

function editActionLabel(listing: DonorListingTrackingItem): string {
  if (listing.status === 'rejected') return 'Resubmit'
  if (listing.status === 'changes_requested') return 'Edit & Resubmit'
  return 'Edit'
}

function editActionTitle(listing: DonorListingTrackingItem): string {
  if (listing.status === 'rejected') return 'Update this rejected listing and resubmit it for review'
  if (listing.status === 'changes_requested') return 'Update the requested changes and resubmit for review'
  return listing.canEdit ? 'Edit listing' : 'Only pending, changes-requested, or rejected listings can be edited'
}

function isResubmissionStatus(status?: DonorListingTrackingItem['status']): boolean {
  return status === 'rejected' || status === 'changes_requested'
}

function inputSt(hasErr: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`,
    background: C.white, color: C.slate, fontSize: '14px', outline: 'none',
    ...extra,
  }
}

export default function DonorManageListingsTab() {
  const [dashboard, setDashboard] = useState<DonorListingTrackingResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [globalErr, setGlobalErr] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrackingFilterStatus>('all')
  const [editing, setEditing] = useState<DonorListingTrackingItem | null>(null)
  const [deleting, setDeleting] = useState<DonorListingTrackingItem | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [editForm, setEditForm] = useState<EditForm>({
    title: '', description: '', category: '', condition: 'like_new', existingImages: [], newImages: [],
  })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [imageErr, setImageErr] = useState('')

  const newImagePreviews = useMemo(
    () => editForm.newImages.map(file => ({ file, url: toSafePreviewUrl(file) })),
    [editForm.newImages]
  )
  useEffect(() => () => newImagePreviews.forEach(preview => URL.revokeObjectURL(preview.url)), [newImagePreviews])

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true)
    setGlobalErr('')
    try {
      const res = await api.get<DonorListingTrackingResponse>('/listings/mine/tracking')
      setDashboard(res.data)
    } catch (err) {
      setGlobalErr((err as ApiError).message || 'Unable to load your listing dashboard.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { const id = window.setTimeout(() => { void fetchDashboard() }, 0); return () => window.clearTimeout(id) }, [fetchDashboard])

  const listings = useMemo(
    () => (dashboard?.listings ?? []).filter(listing => listing.status !== 'draft'),
    [dashboard?.listings],
  )

  const filterCounts = useMemo(() => ({
    all: listings.length,
    pending: listings.filter(listing => listing.trackingFilterStatus === 'pending').length,
    upcoming: listings.filter(listing => listing.trackingFilterStatus === 'upcoming').length,
    active: listings.filter(listing => listing.trackingFilterStatus === 'active').length,
    sold: listings.filter(listing => listing.trackingFilterStatus === 'sold').length,
    expired: listings.filter(listing => listing.trackingFilterStatus === 'expired').length,
    rejected: listings.filter(listing => listing.trackingFilterStatus === 'rejected').length,
    cancelled: listings.filter(listing => listing.trackingFilterStatus === 'cancelled').length,
  }), [listings])

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listings.filter(listing => {
      const searchable = `${listing.title} ${listing.description} ${listing.category} ${listing.charityName ?? ''} ${listing.statusLabel}`.toLowerCase()
      const matchesSearch = !q || searchable.includes(q)
      const matchesStatus = statusFilter === 'all' || listing.trackingFilterStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [listings, query, statusFilter])

  const statusOptions = useMemo(() => ([
    { value: 'all' as const, label: 'All', count: filterCounts.all },
    { value: 'pending' as const, label: 'Pending', count: filterCounts.pending },
    { value: 'upcoming' as const, label: 'Upcoming', count: filterCounts.upcoming },
    { value: 'active' as const, label: 'Active', count: filterCounts.active },
    { value: 'sold' as const, label: 'Sold', count: filterCounts.sold },
    { value: 'expired' as const, label: 'Expired', count: filterCounts.expired },
    { value: 'rejected' as const, label: 'Rejected', count: filterCounts.rejected },
    { value: 'cancelled' as const, label: 'Cancelled', count: filterCounts.cancelled },
  ]), [filterCounts])

  const summaryCards = useMemo(() => ([
    { label: 'Total', value: filterCounts.all, filter: 'all' as const },
    { label: 'Pending', value: filterCounts.pending, filter: 'pending' as const },
    { label: 'Upcoming', value: filterCounts.upcoming, filter: 'upcoming' as const },
    { label: 'Active', value: filterCounts.active, filter: 'active' as const },
    { label: 'Sold', value: filterCounts.sold, filter: 'sold' as const },
    { label: 'Expired', value: filterCounts.expired, filter: 'expired' as const },
    { label: 'Rejected', value: filterCounts.rejected, filter: 'rejected' as const },
    { label: 'Cancelled', value: filterCounts.cancelled, filter: 'cancelled' as const },
  ]), [filterCounts])

  const openEdit = (listing: DonorListingTrackingItem) => {
    setEditing(listing)
    setEditErrors({})
    setImageErr('')
    setEditForm({
      title: listing.title, description: listing.description, category: listing.category,
      condition: listing.condition, existingImages: listing.images ?? [], newImages: [],
    })
  }

  const setField = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setEditForm(prev => ({ ...prev, [field]: e.target.value }))
    setEditErrors(prev => ({ ...prev, [field]: '' }))
  }

  const addNewImages = (files: File[]) => {
    setImageErr('')
    const currentCount = editForm.existingImages.length + editForm.newImages.length
    const accepted = files.filter(file => ALLOWED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES)
    if (accepted.length !== files.length) setImageErr('Some files were rejected. Only JPG, PNG, or WebP images up to 2MB each are allowed.')
    if (currentCount + accepted.length > MAX_IMAGES) setImageErr(`A listing can only have up to ${MAX_IMAGES} images.`)
    const slotsLeft = Math.max(0, MAX_IMAGES - currentCount)
    setEditForm(prev => ({ ...prev, newImages: [...prev.newImages, ...accepted.slice(0, slotsLeft)] }))
  }

  const removeExistingImage = (image: string) => setEditForm(prev => ({ ...prev, existingImages: prev.existingImages.filter(item => item !== image) }))
  const removeNewImage = (index: number) => setEditForm(prev => ({ ...prev, newImages: prev.newImages.filter((_, i) => i !== index) }))

  const containsScriptLikeInput = (value: string) => /<\s*script|javascript:|[\s"'<]on\w+\s*=|<\s*iframe/i.test(value)

  const validateEdit = () => {
    const e: Record<string, string> = {}
    if (editForm.title.trim().length < 3) e.title = 'Title must be at least 3 characters.'
    if (editForm.description.trim().length < 10) e.description = 'Description must be at least 10 characters.'
    if (containsScriptLikeInput(editForm.title) || containsScriptLikeInput(editForm.description)) e.description = 'Please remove script-like content from the listing text.'
    if (!editForm.category) e.category = 'Category is required.'
    setEditErrors(e)
    return Object.keys(e).length === 0
  }

  const saveEdit = async () => {
    if (!editing || !validateEdit()) return
    const payload = new FormData()
    payload.append('title', editForm.title.trim())
    payload.append('description', editForm.description.trim())
    payload.append('category', editForm.category)
    payload.append('condition', editForm.condition)
    payload.append('existing_images', JSON.stringify(editForm.existingImages))
    editForm.newImages.forEach(file => payload.append('images', file))
    setSubmitting(true)
    setGlobalErr('')
    setSuccessMsg('')
    try {
      await api.patch(`/listings/${editing.uuid}`, payload)
      setSuccessMsg(isResubmissionStatus(editing.status)
        ? 'Listing resubmitted for administrator review.'
        : 'Listing updated successfully.')
      setEditing(null)
      await fetchDashboard()
    } catch (err) {
      setGlobalErr((err as ApiError).message || 'Unable to update listing.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setSubmitting(true)
    setGlobalErr('')
    setSuccessMsg('')
    try {
      await api.delete(`/listings/${deleting.uuid}`)
      setSuccessMsg('Listing deleted successfully. It is kept as cancelled for audit traceability.')
      setDeleting(null)
      await fetchDashboard()
    } catch (err) {
      setGlobalErr((err as ApiError).message || 'Unable to delete listing.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {summaryCards.map(card => (
          <button key={card.label} type="button" onClick={() => setStatusFilter(card.filter)}
            className="text-left rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 transition-transform"
            style={{ background: C.white, border: `1px solid ${C.beige}` }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{card.label}</p>
            <p className="text-3xl font-black mt-2" style={{ color: C.slate }}>{card.value}</p>
          </button>
        ))}
      </div>

      {(globalErr || successMsg) && (
        <div className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: globalErr ? C.dangerLight : C.emeraldLight, border: `1px solid ${globalErr ? C.dangerBorder : '#A7F3D0'}` }}>
          {globalErr ? <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: C.danger }} /> : <CheckCircle2 className="w-5 h-5 mt-0.5" style={{ color: C.emerald }} />}
          <p className="text-sm font-medium" style={{ color: globalErr ? C.danger : C.emeraldDark }}>{globalErr || successMsg}</p>
        </div>
      )}

      <div className="rounded-2xl p-4 mb-6 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by title, category, charity, or status..."
            style={inputSt(false)} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TrackingFilterStatus)} style={inputSt(false)}>
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3" style={{ color: C.muted }}>
          <Loader2 className="w-5 h-5 animate-spin" /> Loading your listing statuses…
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="rounded-2xl py-20 text-center shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
          <ImageIcon className="w-10 h-10 mx-auto mb-3" style={{ color: C.beige }} />
          <p className="font-bold" style={{ color: C.slate }}>No listings found</p>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Try another filter, or create your first auction listing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredListings.map(listing => {
            const status = statusStyle(listing)
            const image = listing.images?.[0]
            const safeImage = image && isSafeImageSrc(image) ? image : undefined
            return (
              <article key={listing.uuid ?? listing.id} className="rounded-2xl overflow-hidden shadow-sm flex flex-col" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
                <div className="h-44 bg-slate-100 relative flex items-center justify-center overflow-hidden">
                  {safeImage ? (
                    <img src={safeImage} alt={listing.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2" style={{ color: C.muted }}>
                      <ImageIcon className="w-8 h-8" /><span className="text-xs">No image</span>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm" style={{ background: status.bg, color: status.fg }}>
                    {listing.statusLabel || status.label}
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-lg font-bold leading-tight line-clamp-2" style={{ color: C.slate }}>{listing.title}</h2>
                    <span className="text-[11px] px-2 py-1 rounded-full whitespace-nowrap" style={{ background: C.mauveLight, color: C.mauve }}>{listing.category}</span>
                  </div>
                  <p className="text-sm line-clamp-3 mb-4" style={{ color: C.muted }}>{listing.description}</p>
                  <div className="rounded-xl p-3 mb-4" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                    <div className="flex items-start gap-2">
                      <Gavel className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />
                      <div>
                        <p className="text-sm font-bold" style={{ color: C.slate }}>{listing.timelineLabel}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: C.muted }}>{listing.statusMessage}</p>
                      </div>
                    </div>
                  </div>
                  {isResubmissionStatus(listing.status) && listing.review_note && (
                    <div className="rounded-xl p-3 mb-4" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                      <p className="text-xs uppercase font-semibold" style={{ color: C.danger }}>
                        {listing.status === 'rejected' ? 'Rejection Reason' : 'Requested Changes'}
                      </p>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: C.slate }}>{listing.review_note}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm mb-4 mt-auto">
                    <div><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Starting Price</p><p className="font-black" style={{ color: C.emerald }}>${money(listing.starting_price)}</p></div>
                    <div><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>{listing.status === 'sold' ? 'Final Bid' : 'Current Bid'}</p><p className="font-black" style={{ color: C.slate }}>${money(listing.finalBidAmount ?? listing.current_bid)}</p></div>
                    <div><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Bids</p><p className="font-semibold" style={{ color: C.slate }}>{listing.bid_count}</p></div>
                    <div><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Starts</p><p className="font-semibold truncate" style={{ color: C.slate }}>{formatDateTime(listing.start_time)}</p></div>
                    <div><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Ends</p><p className="font-semibold truncate" style={{ color: C.slate }}>{formatDateTime(listing.end_time)}</p></div>
                    <div className="col-span-2"><p className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Charity Campaign</p><p className="font-semibold truncate" style={{ color: C.slate }}>{listing.charityName || 'Verified Charity'}</p></div>
                  </div>
                  <div className="flex gap-2 pt-4 border-t" style={{ borderColor: C.beige }}>
                    <Link to={`/auctions/${listing.uuid}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-80"
                      style={{ borderColor: C.emerald, color: C.emerald, background: C.emeraldLight }}>
                      <ExternalLink className="w-4 h-4" /> View
                    </Link>
                    <button type="button" disabled={!listing.canEdit} onClick={() => openEdit(listing)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: C.beige, color: C.slate, background: C.white }}
                      title={editActionTitle(listing)}>
                      <Pencil className="w-4 h-4" /> {editActionLabel(listing)}
                    </button>
                    <button type="button" disabled={!listing.canDelete} onClick={() => setDeleting(listing)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ color: C.danger, background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}
                      title={listing.canDelete ? 'Delete listing' : 'Active and sold listings cannot be deleted'}>
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 px-4 py-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto rounded-2xl shadow-xl" style={{ background: C.white }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: C.beige }}>
              <div>
                <h2 className="text-xl font-bold" style={{ color: C.slate }}>{isResubmissionStatus(editing.status) ? 'Resubmit Listing' : 'Edit Listing'}</h2>
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  {isResubmissionStatus(editing.status)
                    ? 'Update the listing details below. Submitting will send it back to admin review.'
                    : 'Only pending listings can be edited before review continues.'}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {isResubmissionStatus(editing.status) && editing.review_note && (
                <div className="rounded-xl px-4 py-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                  <p className="text-xs uppercase font-bold" style={{ color: C.danger }}>
                    {editing.status === 'rejected' ? 'Rejection Reason' : 'Requested Changes'}
                  </p>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: C.slate }}>{editing.review_note}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: C.slate }}>Title</label>
                <input value={editForm.title} onChange={setField('title')} style={inputSt(!!editErrors.title)} />
                {editErrors.title && <p className="text-xs mt-1" style={{ color: C.danger }}>{editErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: C.slate }}>Description</label>
                <textarea rows={5} value={editForm.description} onChange={setField('description')} style={inputSt(!!editErrors.description, { resize: 'none' })} />
                {editErrors.description && <p className="text-xs mt-1" style={{ color: C.danger }}>{editErrors.description}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: C.slate }}>Category</label>
                  <select value={editForm.category} onChange={setField('category')} style={inputSt(!!editErrors.category)}>
                    <option value="Sports">Sports</option><option value="Experiences">Experiences</option>
                    <option value="Collectibles">Collectibles</option><option value="Art">Art</option>
                    <option value="Electronics">Electronics</option><option value="Fashion">Fashion</option>
                  </select>
                  {editErrors.category && <p className="text-xs mt-1" style={{ color: C.danger }}>{editErrors.category}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: C.slate }}>Condition</label>
                  <select value={editForm.condition} onChange={setField('condition')} style={inputSt(false)}>
                    <option value="new">New</option><option value="like_new">Like New</option>
                    <option value="good">Good</option><option value="fair">Fair</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold" style={{ color: C.slate }}>Images</label>
                  <span className="text-xs" style={{ color: C.muted }}>{editForm.existingImages.length + editForm.newImages.length}/{MAX_IMAGES}</span>
                </div>
                <label className="border-2 border-dashed rounded-xl p-5 flex flex-col items-center text-center cursor-pointer" style={{ borderColor: C.beige, background: '#FAFAFA' }}>
                  <Upload className="w-6 h-6 mb-2" style={{ color: C.emerald }} />
                  <span className="text-sm font-medium" style={{ color: C.slate }}>Upload more images</span>
                  <span className="text-xs" style={{ color: C.muted }}>JPG, PNG, or WebP. Max 2MB each.</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={e => addNewImages(Array.from(e.target.files ?? []))} />
                </label>
                {imageErr && <p className="text-xs mt-1" style={{ color: C.danger }}>{imageErr}</p>}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                  {editForm.existingImages.map((image, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden border group bg-gray-100 flex items-center justify-center" style={{ borderColor: C.beige }}>
                      {isSafeImageSrc(image) ? <img src={image} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-medium" style={{ color: C.muted }}>Existing image</span>}
                      <button type="button" onClick={() => removeExistingImage(image)} className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100">Remove</button>
                    </div>
                  ))}
                  {newImagePreviews.map((preview, index) => (
                    <div key={`${preview.url}-${index}`} className="relative aspect-square rounded-lg overflow-hidden border group bg-gray-100 flex items-center justify-center" style={{ borderColor: C.beige }}>
                      <img src={preview.url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeNewImage(index)} className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t" style={{ borderColor: C.beige }}>
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ color: C.slate, borderColor: C.beige }}>Cancel</button>
              <button type="button" onClick={saveEdit} disabled={submitting} className="px-4 py-2 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-60" style={{ background: C.emerald }}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {isResubmissionStatus(editing.status) ? 'Resubmit Listing' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-2xl shadow-xl p-6" style={{ background: C.white }}>
            <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>Delete listing?</h2>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              This will remove <span className="font-semibold">{deleting.title}</span> from active donor management by marking it as cancelled for audit traceability.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ color: C.slate, borderColor: C.beige }}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={submitting} className="px-4 py-2 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-60" style={{ background: C.danger }}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}