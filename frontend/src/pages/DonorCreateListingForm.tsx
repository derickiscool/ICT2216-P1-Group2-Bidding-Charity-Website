import { useEffect, useMemo, useState } from 'react'
import { Upload, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react'
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
  hasImage: boolean
}

export default function DonorCreateListingForm({ onCreated }: { onCreated?: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState('')

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
  const formatForInput = (d: Date) => {
    const tzOffset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
  }

  const localInputToIso = (value: string): string => {
    const normalised = value.length === 16 ? `${value}:00` : value
    return new Date(normalised).toISOString()
  }

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
    reserve_price: '',
    buy_now_price: '',
    min_increment: '5',
    start_time: formatForInput(now),
    end_time: formatForInput(tomorrow),
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState<string | null>(null)

  const setField = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  const selectCampaign = (campaign: PublicCampaign) => {
    setForm(prev => ({ ...prev, campaign_id: String(campaign.id) }))
    setErrors(prev => ({ ...prev, campaign_id: '' }))
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

  const containsScriptLikeInput = (value: string) => /<\s*script|javascript:|[\s"'<]on\w+\s*=|<\s*iframe/i.test(value)

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 3) e.title = 'Title must be at least 3 characters.'
    if (form.description.trim().length < 10) e.description = 'Description must be at least 10 characters.'
    if (containsScriptLikeInput(form.title) || containsScriptLikeInput(form.description)) {
      e.description = 'Please remove script-like content from the listing text.'
    }
    if (form.category.trim().length < 2) e.category = 'Category is required.'
    if (!form.campaign_id) e.campaign_id = 'Please select a campaign before submitting.'
    if (images.length === 0) setImgError('Please upload at least one item image before submitting.')

    const price = Number(form.starting_price)
    if (!form.starting_price || isNaN(price) || price < 1) e.starting_price = 'Starting price must be at least $1.'

    if (form.reserve_price) {
      const rp = Number(form.reserve_price)
      if (isNaN(rp) || rp < price) e.reserve_price = 'Reserve price must be equal to or higher than the starting price.'
    }
    if (form.buy_now_price) {
      const bn = Number(form.buy_now_price)
      if (isNaN(bn) || bn <= price) e.buy_now_price = 'Buy-Now price must be higher than starting price.'
    }

    const start = new Date(localInputToIso(form.start_time)).getTime()
    const end = new Date(localInputToIso(form.end_time)).getTime()
    if (isNaN(start)) e.start_time = 'Invalid start time.'
    if (isNaN(end)) e.end_time = 'Invalid end time.'
    if (!isNaN(start) && !isNaN(end) && end <= start) e.end_time = 'End time must be after start time.'

    setErrors(e)
    return Object.keys(e).length === 0 && images.length > 0
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
    if (form.reserve_price) payload.append('reserve_price', form.reserve_price)
    if (form.buy_now_price) payload.append('buy_now_price', form.buy_now_price)
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
            It is currently <span className="font-semibold" style={{ color: '#D97706' }}>Pending Admin Approval</span>.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setSuccess(false); setForm({
              title: '', description: '', category: '', condition: 'like_new', campaign_id: '',
              starting_price: '', reserve_price: '', buy_now_price: '', min_increment: '5',
              start_time: formatForInput(new Date()), end_time: formatForInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
            }); setImages([]) }}
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
      {/* Breadcrumb removed — sidebar handles nav */}
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
                    {['New', 'Like New', 'Good', 'Fair'].map(c => {
                      const val = c.toLowerCase().replace(' ', '_')
                      const isSelected = form.condition === val
                      return (
                        <button key={val} type="button" onClick={() => setForm(p => ({ ...p, condition: val }))}
                          className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors border"
                          style={{ borderColor: isSelected ? C.emerald : C.beige, color: isSelected ? C.emeraldDark : C.slate, background: isSelected ? C.emeraldLight : C.white }}>
                          {c}
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
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Starting Price <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.muted }}>$</span>
                    <input id="listing-starting-price" type="number" min="1" step="0.01" placeholder="0.00" value={form.starting_price} onChange={setField('starting_price')} style={inputSt(!!errors.starting_price, { paddingLeft: '28px' })} />
                  </div>
                  {errors.starting_price && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.starting_price}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-1" style={{ color: C.slate }}>
                    Reserve Price <Info className="w-3.5 h-3.5 opacity-50" />
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.muted }}>$</span>
                    <input id="listing-reserve-price" type="number" placeholder="Optional" value={form.reserve_price} onChange={setField('reserve_price')} style={inputSt(!!errors.reserve_price, { paddingLeft: '28px' })} />
                  </div>
                  {errors.reserve_price && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.reserve_price}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Buy-Now Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: C.muted }}>$</span>
                    <input id="listing-buy-now-price" type="number" placeholder="Optional" value={form.buy_now_price} onChange={setField('buy_now_price')} style={inputSt(!!errors.buy_now_price, { paddingLeft: '28px' })} />
                  </div>
                  {errors.buy_now_price && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.buy_now_price}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Auction Start <span className="text-red-500">*</span></label>
                    <input id="listing-start-time" type="datetime-local" value={form.start_time} onChange={setField('start_time')} style={inputSt(!!errors.start_time, { fontSize: '12px' })} />
                    {errors.start_time && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.start_time}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Auction End <span className="text-red-500">*</span></label>
                    <input id="listing-end-time" type="datetime-local" value={form.end_time} onChange={setField('end_time')} style={inputSt(!!errors.end_time, { fontSize: '12px' })} />
                    {errors.end_time && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.end_time}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl p-6 shadow-sm bg-white flex-1 flex flex-col" style={{ border: `1px solid ${C.beige}` }}>
              <h3 className="text-base font-bold mb-1" style={{ color: C.slate }}>Target Campaign <span className="text-red-500 text-xs font-normal">* Required</span></h3>
              <p className="text-xs mb-3" style={{ color: C.muted }}>Select an active charity campaign to donate auction proceeds to</p>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2" style={{ color: C.muted }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading campaigns…</span>
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
                <div className="space-y-3 flex-1 overflow-y-auto max-h-72">
                  {campaigns.map(campaign => {
                    const isSelected = form.campaign_id === String(campaign.id)
                    return (
                      <div key={campaign.id} id={`campaign-option-${campaign.id}`} onClick={() => selectCampaign(campaign)}
                        className="p-3 rounded-lg border cursor-pointer transition-colors flex gap-3 items-start"
                        style={{ borderColor: isSelected ? C.emerald : C.beige, background: isSelected ? C.emeraldLight : C.white }}>
                        {campaign.hasImage && (
                          <img src={`/api/charities/campaigns/${campaign.uuid}/image`} alt={campaign.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate" style={{ color: C.slate }}>{campaign.name}</p>
                            {isSelected && <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.emerald }} />}
                          </div>
                          {campaign.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: C.muted }}>{campaign.description}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {errors.campaign_id && <p className="text-xs mt-2" style={{ color: C.danger }}>{errors.campaign_id}</p>}
            </section>
          </div>
        </div>

        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t" style={{ borderColor: C.beige }}>
          <div className="px-3 py-1.5 text-xs font-medium rounded-md" style={{ background: C.emeraldLight, color: C.emeraldDark, border: '1px solid #A7F3D0' }}>
            Your listing will be reviewed by an Admin before going live.
          </div>
          <button type="submit" id="submit-listing-btn" disabled={isLoading || campaignsLoading}
            className="px-5 py-2 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-sm flex items-center gap-2"
            style={{ background: (isLoading || campaignsLoading) ? '#6ba88e' : C.emerald, cursor: (isLoading || campaignsLoading) ? 'not-allowed' : 'pointer' }}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Submitting…' : 'Submit for Admin Approval'}
          </button>
        </div>
      </form>
    </div>
  )
}
