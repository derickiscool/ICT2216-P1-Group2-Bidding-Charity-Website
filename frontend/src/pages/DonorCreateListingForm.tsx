import { useEffect, useMemo, useState } from 'react'
import { Upload, AlertCircle, CheckCircle2, Loader2, Building2, CalendarDays, Search, X } from 'lucide-react'
import api from '../services/api'
import type { ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#035c43',
  emeraldLight: '#ECFDF5', beige: '#BBB09B', linen: '#F7F5F0',
  white: '#FFFFFF', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const USER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time zone'

const toSafePreviewUrl = (file: File): string => URL.createObjectURL(file).replace(/[<>"'&]/g, '')

function inputSt(hasErr: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`,
    background: C.white, color: C.slate, fontSize: '14px', outline: 'none',
    transition: 'border-color 0.2s',
    ...extra,
  }
}

interface PublicCampaign {
  id: number
  uuid: string
  name: string
  description: string
  charity_id: number
  charityName: string
  end_date?: string
  hasImage: boolean
}

interface CharityOption {
  id: number
  name: string
  campaignCount: number
}

const formatForInput = (d: Date) => {
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

const localInputToIso = (value: string): string => {
  const normalised = value.length === 16 ? `${value}:00` : value
  return new Date(normalised).toISOString()
}

const campaignEndDateLabel = (endDate?: string): string => {
  if (!endDate) return 'No campaign end date'
  const [year, month, day] = endDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return 'No campaign end date'
  return new Date(year, month - 1, day).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

const campaignEndOfDayMs = (endDate?: string): number | undefined => {
  if (!endDate) return undefined
  const [year, month, day] = endDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
}

const campaignEndsBeforeAuction = (campaign: PublicCampaign, auctionEndInput: string): boolean => {
  const campaignEnd = campaignEndOfDayMs(campaign.end_date)
  if (campaignEnd === undefined) return false
  const auctionEnd = new Date(localInputToIso(auctionEndInput)).getTime()
  return Number.isFinite(auctionEnd) && auctionEnd > campaignEnd
}

function CampaignPickerModal({
  campaigns, auctionEndInput, search, onSearchChange, onSelect, onClose,
}: {
  campaigns: PublicCampaign[]
  auctionEndInput: string
  search: string
  onSearchChange: (value: string) => void
  onSelect: (campaign: PublicCampaign) => void
  onClose: () => void
}) {
  const filtered = campaigns.filter(campaign => (`${campaign.name} ${campaign.description}`).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ border: `1px solid ${C.beige}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
          <div>
            <h2 className="text-lg font-black" style={{ color: C.slate }}>Select Target Campaign</h2>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Campaigns ending before your auction end date are disabled.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-[#F7F5F0]" aria-label="Close campaign picker">
            <X className="w-5 h-5" style={{ color: C.muted }} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search campaign name or description"
              style={inputSt(false, { paddingLeft: '38px' })}
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
            {filtered.length === 0 ? (
              <div className="rounded-xl px-4 py-8 text-center" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                <p className="text-sm font-bold" style={{ color: C.slate }}>No matching campaigns</p>
                <p className="text-xs mt-1" style={{ color: C.muted }}>Try a different search term.</p>
              </div>
            ) : filtered.map(campaign => {
              const disabled = campaignEndsBeforeAuction(campaign, auctionEndInput)
              return (
                <button
                  key={campaign.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(campaign)}
                  className="w-full text-left p-4 rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-55 hover:shadow-sm"
                  style={{ borderColor: disabled ? C.dangerBorder : C.beige, background: disabled ? C.dangerLight : C.white }}>
                  <div className="flex gap-3">
                    {campaign.hasImage && (
                      <img src={`/api/charities/campaigns/${campaign.uuid}/image`} alt="Campaign" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black break-words" style={{ color: C.slate }}>{campaign.name}</p>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: C.muted }}>{campaign.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: C.linen, color: C.slate, border: `1px solid ${C.beige}` }}>
                          <CalendarDays className="w-3 h-3" /> Ends: {campaignEndDateLabel(campaign.end_date)}
                        </span>
                        {disabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
                            Campaign ends before auction
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DonorCreateListingForm({ onCreated }: { onCreated?: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState('')
  const [selectedCharityId, setSelectedCharityId] = useState('')
  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')

  useEffect(() => {
    api.get<PublicCampaign[]>('/charities/campaigns/public')
      .then(res => {
        setCampaigns(res.data)
        setCampaignsLoading(false)
      })
      .catch(() => {
        setCampaignsError('Could not load campaigns. Please refresh the page.')
        setCampaignsLoading(false)
      })
  }, [])

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const [images, setImages] = useState<File[]>([])
  const [imgError, setImgError] = useState('')

  const imagePreviews = useMemo(() => images.map(file => ({ file, url: toSafePreviewUrl(file) })), [images])
  useEffect(() => () => imagePreviews.forEach(preview => URL.revokeObjectURL(preview.url)), [imagePreviews])

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    condition: 'like_new',
    campaign_id: '',
    starting_price: '',
    min_increment: '5',
    start_time: formatForInput(now),
    end_time: formatForInput(tomorrow),
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState<string | null>(null)

  const charityOptions = useMemo<CharityOption[]>(() => {
    const grouped = new Map<number, CharityOption>()
    campaigns.forEach(campaign => {
      const existing = grouped.get(campaign.charity_id)
      grouped.set(campaign.charity_id, {
        id: campaign.charity_id,
        name: campaign.charityName,
        campaignCount: (existing?.campaignCount ?? 0) + 1,
      })
    })
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [campaigns])

  const campaignsForSelectedCharity = useMemo(
    () => campaigns.filter(campaign => String(campaign.charity_id) === selectedCharityId),
    [campaigns, selectedCharityId],
  )

  const selectedCampaign = useMemo(
    () => campaigns.find(campaign => String(campaign.id) === form.campaign_id),
    [campaigns, form.campaign_id],
  )

  const setField = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  const selectCharity = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const charityId = e.target.value
    setSelectedCharityId(charityId)
    setCampaignSearch('')
    setErrors(prev => ({ ...prev, campaign_id: '' }))

    // The campaign list depends on the selected organisation. Clear the previous
    // campaign if it belongs to another charity so donors do not accidentally submit
    // to the wrong beneficiary.
    const currentCampaignStillBelongs = campaigns.some(campaign => String(campaign.id) === form.campaign_id && String(campaign.charity_id) === charityId)
    if (!currentCampaignStillBelongs) {
      setForm(prev => ({ ...prev, campaign_id: '' }))
    }
  }

  const selectCampaign = (campaign: PublicCampaign) => {
    if (campaignEndsBeforeAuction(campaign, form.end_time)) {
      setErrors(prev => ({ ...prev, campaign_id: 'This campaign ends before your auction ends. Please choose another campaign.' }))
      return
    }
    setForm(prev => ({ ...prev, campaign_id: String(campaign.id) }))
    setErrors(prev => ({ ...prev, campaign_id: '' }))
    setCampaignPickerOpen(false)
  }

  const addImageFiles = (files: File[]) => {
    setImgError('')
    const accepted = files.filter(file => ALLOWED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES)
    if (accepted.length !== files.length) {
      setImgError('Some files were rejected. Only JPG, PNG, or WebP images up to 2MB each are allowed.')
    }
    if (images.length + accepted.length > MAX_IMAGES) {
      setImgError(`You can only upload a maximum of ${MAX_IMAGES} images.`)
    }
    setImages(prev => [...prev, ...accepted].slice(0, MAX_IMAGES))
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    if (images.length >= MAX_IMAGES) return
    addImageFiles(Array.from(e.dataTransfer.files))
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    addImageFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const removeImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index))

  const containsScriptLikeInput = (value: string) => /<\s*script|javascript:|[\s"'</]on\w+\s*=|<\s*iframe/i.test(value)

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 3) e.title = 'Title must be at least 3 characters.'
    if (form.description.trim().length < 10) e.description = 'Description must be at least 10 characters.'
    if (containsScriptLikeInput(form.title) || containsScriptLikeInput(form.description)) {
      e.description = 'Please remove script-like content from the listing text.'
    }
    if (form.category.trim().length < 2) e.category = 'Category is required.'
    if (!selectedCharityId) e.charity_id = 'Please select a target organisation first.'
    if (!form.campaign_id) e.campaign_id = 'Please select a campaign before submitting.'
    if (images.length === 0) setImgError('Please upload at least one item image before submitting.')

    const price = Number(form.starting_price)
    if (!form.starting_price || isNaN(price) || price < 1) e.starting_price = 'Starting price must be at least $1.'

    const minIncrement = Number(form.min_increment)
    if (!form.min_increment || isNaN(minIncrement) || minIncrement < 1) {
      e.min_increment = 'Minimum bid increment is required and must be at least $1.'
    }

    const start = new Date(localInputToIso(form.start_time)).getTime()
    const end = new Date(localInputToIso(form.end_time)).getTime()
    if (isNaN(start)) e.start_time = 'Invalid start time.'
    if (isNaN(end)) e.end_time = 'Invalid end time.'
    if (!isNaN(start) && !isNaN(end) && end <= start) e.end_time = 'End time must be after start time.'

    if (selectedCampaign && campaignEndsBeforeAuction(selectedCampaign, form.end_time)) {
      e.campaign_id = 'This campaign ends before your auction ends. Please choose another campaign.'
    }

    setErrors(e)
    return Object.keys(e).length === 0 && images.length > 0
  }

  const resetForm = () => {
    setSuccess(false)
    setForm({
      title: '', description: '', category: '', condition: 'like_new', campaign_id: '',
      starting_price: '', min_increment: '5',
      start_time: formatForInput(new Date()), end_time: formatForInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    })
    setSelectedCharityId('')
    setCampaignSearch('')
    setImages([])
    setErrors({})
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGlobalErr(null)
    setImgError('')
    if (!validate()) return

    const startIso = localInputToIso(form.start_time)
    const endIso = localInputToIso(form.end_time)
    const durationHours = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60)))

    if (durationHours > 720) {
      setErrors(prev => ({ ...prev, end_time: 'Auction duration cannot exceed 30 days (720 hours).' }))
      return
    }

    const payload = new FormData()
    payload.append('title', form.title.trim())
    payload.append('description', form.description.trim())
    payload.append('category', form.category.trim())
    payload.append('condition', form.condition)
    payload.append('campaign_id', form.campaign_id)
    payload.append('starting_price', form.starting_price)
    payload.append('min_increment', form.min_increment)
    payload.append('start_time', startIso)
    payload.append('end_time', endIso)
    payload.append('durationHours', String(durationHours))
    images.forEach(file => payload.append('images', file))

    setIsLoading(true)
    try {
      await api.post('/listings', payload)
      setSuccess(true)
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrors(ae.errors)
      else setGlobalErr(ae.message || 'Failed to create listing.')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-full max-w-md text-center rounded-2xl px-8 py-12 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: C.emeraldLight }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: C.emerald }} />
          </div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: C.slate }}>Listing Submitted!</h2>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: C.muted }}>
            Your auction listing for <span className="font-semibold" style={{ color: C.slate }}>{form.title}</span> has been submitted.
            It is currently <span className="font-semibold" style={{ color: '#D97706' }}>Pending Admin Review</span>. After that, the charity will complete the final review.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={resetForm}
              className="px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
              Create Another
            </button>
            {onCreated && (
              <button onClick={onCreated}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: C.emerald }}>
                Back to My Listings
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {globalErr && (
        <div className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
          <p className="text-sm font-medium" style={{ color: C.danger }}>{globalErr}</p>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <section className="rounded-xl p-6 shadow-sm bg-white" style={{ border: `1px solid ${C.beige}` }}>
              <h3 className="text-base font-bold mb-5" style={{ color: C.slate }}>Item Details</h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Item Name <span className="text-red-500">*</span></label>
                  <input id="listing-title" type="text" placeholder="e.g. Signed Football Jersey — Premier League" value={form.title} onChange={setField('title')} style={inputSt(!!errors.title)} />
                  {errors.title && <p className="text-xs mt-1 text-red-500">{errors.title}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Description <span className="text-red-500">*</span></label>
                  <textarea id="listing-description" rows={4} placeholder="Describe the item, its history, and what makes it special..." value={form.description} onChange={setField('description')} style={inputSt(!!errors.description, { resize: 'none' })} />
                  {errors.description && <p className="text-xs mt-1 text-red-500">{errors.description}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Item Condition <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    {['New', 'Like New', 'Good', 'Fair'].map(condition => {
                      const val = condition.toLowerCase().replace(' ', '_')
                      const isSelected = form.condition === val
                      return (
                        <button key={val} type="button" onClick={() => setForm(prev => ({ ...prev, condition: val }))}
                          className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors border"
                          style={{ borderColor: isSelected ? C.emerald : C.beige, color: isSelected ? C.emeraldDark : C.slate, background: isSelected ? C.emeraldLight : C.white }}>
                          {condition}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Category <span className="text-red-500">*</span></label>
                  <select id="listing-category" value={form.category} onChange={setField('category')} style={inputSt(!!errors.category)}>
                    <option value="" disabled>Select a category...</option>
                    <option value="Sports">Sports</option>
                    <option value="Experiences">Experiences</option>
                    <option value="Collectibles">Collectibles</option>
                    <option value="Art">Art</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion</option>
                  </select>
                  {errors.category && <p className="text-xs mt-1 text-red-500">{errors.category}</p>}
                </div>
              </div>
            </section>

            <section className="rounded-xl p-6 shadow-sm bg-white flex-1 flex flex-col" style={{ border: `1px solid ${C.beige}` }}>
              <h3 className="text-base font-bold mb-4 flex items-center justify-between" style={{ color: C.slate }}>
                Images <span className="text-xs font-normal" style={{ color: C.muted }}>(1 to 5 images)</span>
              </h3>
              <label
                className={`flex-1 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${images.length >= MAX_IMAGES ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                style={{ borderColor: C.emerald, background: '#FAFAFA' }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleFilePick} disabled={images.length >= MAX_IMAGES} />
                <Upload className="w-8 h-8 mb-3" style={{ color: C.emerald }} />
                <p className="text-sm font-medium mb-1" style={{ color: C.slate }}>Click to upload, or drag &amp; drop images here</p>
                <p className="text-xs mb-4" style={{ color: C.muted }}>JPG, PNG, or WebP. Max 2MB each.</p>
              </label>
              {imgError && <p className="text-xs mt-2" style={{ color: C.danger }}>{imgError}</p>}
              {imagePreviews.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {imagePreviews.map((img, i) => (
                    <div key={`${img.url}-${i}`} className="relative group rounded-md overflow-hidden bg-gray-100 aspect-square flex items-center justify-center border border-gray-200">
                      <img src={img.url} alt="Listing image preview" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)}
                        className="absolute inset-0 bg-black/50 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <section className="rounded-xl p-6 shadow-sm bg-white" style={{ border: `1px solid ${C.beige}` }}>
              <h3 className="text-base font-bold mb-5" style={{ color: C.slate }}>Auction Settings</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Starting Price <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.muted }}>$</span>
                      <input id="listing-starting-price" type="number" min="1" step="0.01" placeholder="0.00" value={form.starting_price} onChange={setField('starting_price')} style={inputSt(!!errors.starting_price, { paddingLeft: '28px' })} />
                    </div>
                    {errors.starting_price && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.starting_price}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Minimum Bid Increment <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.muted }}>$</span>
                      <input id="listing-min-increment" type="number" min="1" step="0.01" placeholder="5.00" value={form.min_increment} onChange={setField('min_increment')} style={inputSt(!!errors.min_increment, { paddingLeft: '28px' })} />
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: C.muted }}>Every manual bid and auto-bid increment must meet this amount.</p>
                    {errors.min_increment && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.min_increment}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Auction Start (local time) <span className="text-red-500">*</span></label>
                    <input id="listing-start-time" type="datetime-local" value={form.start_time} onChange={setField('start_time')} style={inputSt(!!errors.start_time, { fontSize: '12px' })} />
                    <p className="text-[11px] mt-1" style={{ color: C.muted }}>Shown in {USER_TIME_ZONE}. Future starts appear as Upcoming until this time.</p>
                    {errors.start_time && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.start_time}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Auction End (local time) <span className="text-red-500">*</span></label>
                    <input id="listing-end-time" type="datetime-local" value={form.end_time} onChange={setField('end_time')} style={inputSt(!!errors.end_time, { fontSize: '12px' })} />
                    <p className="text-[11px] mt-1" style={{ color: C.muted }}>Must be after the start time. Max duration is 30 days.</p>
                    {errors.end_time && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.end_time}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl p-6 shadow-sm bg-white flex-1 flex flex-col" style={{ border: `1px solid ${C.beige}` }}>
              <h3 className="text-base font-bold mb-1" style={{ color: C.slate }}>Target Beneficiary <span className="text-red-500 text-xs font-normal">* Required</span></h3>
              <p className="text-xs mb-4" style={{ color: C.muted }}>
                Select the target organisation first, then choose one of its active campaigns.
              </p>

              {campaignsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2" style={{ color: C.muted }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading organisations and campaigns…</span>
                </div>
              ) : campaignsError ? (
                <div className="flex items-start gap-2 rounded-lg px-3 py-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
                  <p className="text-xs" style={{ color: C.danger }}>{campaignsError}</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm font-medium mb-1" style={{ color: C.slate }}>No active campaigns</p>
                  <p className="text-xs" style={{ color: C.muted }}>Charities must create an active campaign before you can select one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Target Organisation</label>
                    <select id="listing-target-organisation" value={selectedCharityId} onChange={selectCharity} style={inputSt(!!errors.charity_id)}>
                      <option value="" disabled>Select an organisation...</option>
                      {charityOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.name} ({option.campaignCount} campaign{option.campaignCount === 1 ? '' : 's'})</option>
                      ))}
                    </select>
                    {errors.charity_id && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.charity_id}</p>}
                  </div>

                  <div className="rounded-xl p-4" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                    {selectedCampaign ? (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.muted }}>Selected Campaign</p>
                            <p className="text-sm font-black mt-1" style={{ color: C.slate }}>{selectedCampaign.name}</p>
                            <p className="text-xs mt-1" style={{ color: C.muted }}>{selectedCampaign.charityName}</p>
                          </div>
                          <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: C.emerald }} />
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: C.slate }}>
                          <CalendarDays className="w-4 h-4" style={{ color: C.emerald }} />
                          Campaign end date: {campaignEndDateLabel(selectedCampaign.end_date)}
                        </div>
                        <button type="button" onClick={() => setCampaignPickerOpen(true)}
                          className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors"
                          style={{ border: `1px solid ${C.beige}`, color: C.emerald, background: C.white }}>
                          Change Campaign
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: C.beige }} />
                        <p className="text-sm font-bold" style={{ color: C.slate }}>No campaign selected</p>
                        <p className="text-xs mt-1 mb-3" style={{ color: C.muted }}>
                          {selectedCharityId ? 'Open the campaign picker to choose a campaign.' : 'Select a target organisation first.'}
                        </p>
                        <button type="button" disabled={!selectedCharityId} onClick={() => setCampaignPickerOpen(true)}
                          className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: C.emerald }}>
                          Choose Campaign
                        </button>
                      </div>
                    )}
                  </div>

                  {errors.campaign_id && <p className="text-xs" style={{ color: C.danger }}>{errors.campaign_id}</p>}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t" style={{ borderColor: C.beige }}>
          <div className="px-3 py-1.5 text-xs font-medium rounded-md" style={{ background: C.emeraldLight, color: C.emeraldDark, border: '1px solid #A7F3D0' }}>
            Your listing needs Admin approval, then Charity approval before it appears publicly.
          </div>
          <button type="submit" id="submit-listing-btn" disabled={isLoading || campaignsLoading}
            className="px-5 py-2 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-sm flex items-center gap-2"
            style={{ background: (isLoading || campaignsLoading) ? '#6ba88e' : C.emerald, cursor: (isLoading || campaignsLoading) ? 'not-allowed' : 'pointer' }}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Submitting…' : 'Submit for Review'}
          </button>
        </div>
      </form>

      {campaignPickerOpen && selectedCharityId && (
        <CampaignPickerModal
          campaigns={campaignsForSelectedCharity}
          auctionEndInput={form.end_time}
          search={campaignSearch}
          onSearchChange={setCampaignSearch}
          onSelect={selectCampaign}
          onClose={() => setCampaignPickerOpen(false)}
        />
      )}
    </div>
  )
}