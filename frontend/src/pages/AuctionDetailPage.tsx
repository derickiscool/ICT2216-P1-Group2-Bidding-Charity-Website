import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { Clock, Heart, ArrowLeft, Flame, Shield, CheckCircle } from 'lucide-react'
import api from '../services/api'
import type { AutoBid, AutoBidResponse, Bid, BidPlacementResponse, Listing } from '../types'
import { useAuthStore } from '../store/authStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

const maskUsername = (u: string) => {
  if (!u || u.length === 0) return '***'
  if (u.length <= 2) return u[0] + '***'
  return u[0] + '***' + u[u.length - 1]
}

interface TimeLeft { d: number; h: number; m: number; s: number }

const calcTimeLeft = (endTime: string): TimeLeft | null => {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CountdownBlock({ end }: { end: string }) {
  const [tl, setTl] = useState<TimeLeft | null>(() => calcTimeLeft(end))
  useEffect(() => {
    const iv = setInterval(() => setTl(calcTimeLeft(end)), 1000)
    return () => clearInterval(iv)
  }, [end])

  if (!tl)
    return (
      <div className="rounded-xl px-4 py-3 text-center text-sm font-bold uppercase tracking-widest"
           style={{ background: 'var(--bfg-danger-light)', color: 'var(--bfg-danger)', border: '1px solid var(--bfg-danger-border)' }}>
        Auction Ended
      </div>
    )

  const urgent = tl.d === 0 && tl.h < 3
  const parts = [
    { label: 'Days', val: tl.d },
    { label: 'Hrs',  val: tl.h },
    { label: 'Min',  val: tl.m },
    { label: 'Sec',  val: tl.s },
  ]

  return (
    <div className="flex gap-2">
      {parts.map(({ label, val }, i) => (
        <div key={i} className="flex-1 rounded-xl py-3 text-center"
             style={{ background: 'var(--bfg-linen)', border: `1px solid ${urgent ? 'var(--bfg-danger-border)' : 'var(--bfg-beige)'}` }}>
          <p className="text-xl font-black font-mono leading-none"
             style={{ color: urgent ? 'var(--bfg-danger)' : 'var(--bfg-slate)' }}>
            {String(val).padStart(2, '0')}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--bfg-text-muted)' }}>
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}

function BidRow({ bid, isTop }: { bid: Bid; isTop: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
         style={{
           background: isTop ? 'var(--bfg-emerald-light)' : 'transparent',
           border: `1px solid ${isTop ? 'rgba(4,120,87,0.25)' : 'var(--bfg-beige)'}`,
         }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black uppercase flex-shrink-0"
             style={{ background: 'var(--bfg-linen)', color: 'var(--bfg-slate)', border: '1px solid var(--bfg-beige)' }}>
          {maskUsername(bid.bidder_username)[0]}
        </div>
        <div>
          <p className="text-sm font-bold leading-none font-mono" style={{ color: 'var(--bfg-slate)' }}>
            {maskUsername(bid.bidder_username)}
            {isTop && (
              <span className="ml-2 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--bfg-emerald)', color: '#fff' }}>
                Top
              </span>
            )}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider mt-0.5" style={{ color: 'var(--bfg-text-muted)' }}>
            {new Date(bid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <p className="font-black text-base font-mono" style={{ color: 'var(--bfg-emerald)' }}>
        ${bid.amount.toLocaleString()}
      </p>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AuctionDetailPage() {
  const { id } = useParams()          // UUID from the URL
  const { isAuthenticated, user } = useAuthStore()
  const isBidderUser = Boolean(isAuthenticated && user?.roles.includes('bidder'))

  const [listing, setListing]       = useState<Listing | null>(null)
  const [bidHistory, setBidHistory] = useState<Bid[]>([])
  const [pageError, setPageError]   = useState<string | null>(null)
  const [amount, setAmount]         = useState('')
  const [bidError, setBidError]     = useState<string | null>(null)
  const [bidMessage, setBidMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedImage, setSelectedImage] = useState(0)
  const [autoBidOn, setAutoBidOn]   = useState(false)
  const [maxAutoBid, setMaxAutoBid] = useState('')
  const [savedAutoBidActive, setSavedAutoBidActive] = useState(false)
  const [autoBidSaving, setAutoBidSaving] = useState(false)
  const [saved, setSaved]           = useState(false)
  const processedBids = useRef<Set<number>>(new Set())
  const listingRef = useRef<Listing | null>(null)

  useEffect(() => {
    listingRef.current = listing
  }, [listing])

  // Keep bid-history and the listing summary in sync for both manual bids and
  // backend-generated auto-bids. The processedBids set prevents double counting
  // when the same event arrives through HTTP response and WebSocket.
  const applyAcceptedBid = useCallback((bid: Bid) => {
    if (!bid.id || processedBids.current.has(bid.id)) return
    processedBids.current.add(bid.id)

    setListing(prev => {
      if (!prev) return prev
      return {
        ...prev,
        current_bid: bid.amount,
        bid_count: prev.bid_count + 1,
        winner_id: bid.bidder_id,
      }
    })
    setBidHistory(prev => prev.some(existing => existing.id === bid.id) ? prev : [bid, ...prev])

    const minInc = listingRef.current?.min_increment ?? 1
    setAmount(String(bid.amount + minInc))
  }, [])

  // ── Track current time for pure renders & dynamic badges ────────────────
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const listRes = await api.get<Listing>(`/listings/${id}`)
        setListing(listRes.data)
        const base = listRes.data.current_bid || listRes.data.starting_price
        setAmount(String(base + (listRes.data.min_increment ?? 1)))
      } catch (err) {
        setPageError((err as { message?: string }).message || 'Listing not found')
      }
    }
    load()
  }, [id])

  useEffect(() => {
    if (!listing?.id) return
    api.get<Bid[]>(`/bids/listings/${listing.id}`)
      .then(res => {
        setBidHistory(res.data)
        processedBids.current.clear()
        res.data.forEach(bid => {
          if (bid.id) processedBids.current.add(bid.id)
        })
      })
      .catch(() => setBidHistory([]))
  }, [listing?.id])

  useEffect(() => {
    let cancelled = false

    const resetAutoBidState = () => {
      if (cancelled) return

      setAutoBidOn(false)
      setSavedAutoBidActive(false)
      setMaxAutoBid('')
    }

    if (!listing?.id || !isBidderUser) {
      queueMicrotask(resetAutoBidState)

      return () => {
        cancelled = true
      }
    }

    api.get<AutoBid | null>(`/bids/auto-bids/${listing.id}`)
      .then(res => {
        if (cancelled) return

        if (res.data?.is_active) {
          setAutoBidOn(true)
          setSavedAutoBidActive(true)
          setMaxAutoBid(String(res.data.max_amount))
        } else {
          resetAutoBidState()
        }
      })
      .catch(() => {
        resetAutoBidState()
      })

    return () => {
      cancelled = true
    }
  }, [listing?.id, isBidderUser])

  useEffect(() => {
    if (!listing?.id) return
    // @ts-expect-error - Vite env types may not be loaded in CI checks
    const url = import.meta.env.VITE_WS_URL || ''
    const socket = io(url, { withCredentials: true })
    socket.emit('listing:join', listing.id)

    socket.on('bid:placed', (bid: Bid) => {
      applyAcceptedBid(bid)
    })

    return () => { socket.disconnect() }
  }, [listing?.id, applyAcceptedBid])

  // ── Place bid ─────────────────────────────────────────────────────────────
  const submitBid = async () => {
    if (!listing) return
    setBidError(null); setBidMessage(null)

    const amt = Number(amount)
    const min = Math.max(listing.starting_price, listing.current_bid) + (listing.min_increment ?? 1)

    if (new Date(listing.end_time).getTime() <= now) { setBidError('This auction has ended.'); return }
    if (listing.donor_id === user?.id)                      { setBidError('You cannot bid on your own listing.'); return }
    if (isNaN(amt) || amt < min)                            { setBidError(`Bid must be at least $${min.toLocaleString()}.`); return }

    setSubmitting(true)
    try {
      const res = await api.post<BidPlacementResponse>('/bids', { listing_id: listing.id, amount: amt })
      res.data.bids.forEach(applyAcceptedBid)
      setListing(prev => prev ? { ...prev, current_bid: res.data.currentBid, winner_id: res.data.winnerId } : prev)

      const autoResponse = res.data.bids.find(bid => bid.is_auto_bid && bid.bidder_id !== user?.id)
      if (autoResponse) {
        setBidMessage(`Bid accepted, but another bidder's auto-bid raised the price to $${res.data.currentBid.toLocaleString()}.`)
      } else {
        setBidMessage(`Bid of $${amt.toLocaleString()} placed!`)
      }
    } catch (err) {
      setBidError((err as { message?: string }).message || 'Bid failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitAutoBid = async () => {
    if (!listing) return
    setBidError(null); setBidMessage(null)

    const max = Number(maxAutoBid)
    const min = listing.winner_id === user?.id ? listing.current_bid : minNextBid
    if (new Date(listing.end_time).getTime() <= now) { setBidError('This auction has ended.'); return }
    if (listing.donor_id === user?.id)                      { setBidError('You cannot auto-bid on your own listing.'); return }
    if (isNaN(max) || max < min)                            { setBidError(`Maximum auto-bid must be at least $${min.toLocaleString()}.`); return }

    setAutoBidSaving(true)
    try {
      const res = await api.post<AutoBidResponse>('/bids/auto-bids', { listing_id: listing.id, max_amount: max })
      res.data.result.bids.forEach(applyAcceptedBid)
      setListing(prev => prev ? { ...prev, current_bid: res.data.result.currentBid, winner_id: res.data.result.winnerId } : prev)
      setSavedAutoBidActive(res.data.autoBid.is_active)
      setAutoBidOn(true)
      setMaxAutoBid(String(res.data.autoBid.max_amount))
      setBidMessage('Auto-bid saved. Your maximum stays private.')
    } catch (err) {
      setBidError((err as { message?: string }).message || 'Auto-bid failed. Please try again.')
    } finally {
      setAutoBidSaving(false)
    }
  }

  const cancelSavedAutoBid = async () => {
    if (!listing) return
    setBidError(null); setBidMessage(null)
    setAutoBidSaving(true)
    try {
      await api.delete(`/bids/auto-bids/${listing.id}`)
      setSavedAutoBidActive(false)
      setAutoBidOn(false)
      setMaxAutoBid('')
      setBidMessage('Auto-bid cancelled.')
    } catch (err) {
      setBidError((err as { message?: string }).message || 'Could not cancel auto-bid.')
    } finally {
      setAutoBidSaving(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (pageError && !listing)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bfg-linen)' }}>
        <div className="rounded-2xl p-10 text-center bg-white" style={{ border: '1px solid var(--bfg-beige)' }}>
          <p className="text-lg font-bold mb-4" style={{ color: 'var(--bfg-slate)' }}>Listing not found</p>
          <p className="text-sm mb-6" style={{ color: 'var(--bfg-text-muted)' }}>{pageError}</p>
          <div className="flex items-center justify-center gap-3">
            <Link to={user && user.roles.includes('admin') ? '/admin' : '/dashboard'} className="px-6 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--bfg-linen)', color: 'var(--bfg-slate)', border: '1px solid var(--bfg-beige)' }}>
              Dashboard
            </Link>
            <Link to="/auctions" className="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--bfg-emerald)' }}>
              Browse Auctions
            </Link>
          </div>
        </div>
      </div>
    )

  if (!listing)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bfg-linen)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 animate-spin"
               style={{ borderColor: 'var(--bfg-emerald)', borderTopColor: 'transparent' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--bfg-text-muted)' }}>Loading auction…</p>
        </div>
      </div>
    )

  // ── Derived values ────────────────────────────────────────────────────────
  const charityName  = listing.charityName ?? listing.campaign?.charity?.name ?? 'Verified Charity'
  const campaignName = listing.campaign?.name ?? charityName
  const raised       = listing.campaign?.total_raised ?? 45_230
  const goal         = 80_000
  const pct          = Math.min(100, Math.round((raised / goal) * 100))
  // Real images if they exist; otherwise a single placeholder (no fake 4-image array)
  const images       = listing.images?.length ? listing.images : ['https://via.placeholder.com/800x500?text=No+Image']
  const auctionEnded = new Date(listing.end_time).getTime() <= now
  const minNextBid   = Math.max(listing.starting_price, listing.current_bid) + (listing.min_increment ?? 1)
  const urgent       = !auctionEnded && new Date(listing.end_time).getTime() - now < 3 * 3_600_000

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bfg-linen)' }}>

      {/* ── Dark hero banner ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden pt-10 pb-0 px-6"
           style={{ background: 'linear-gradient(135deg, #1C2C2B 0%, #223433 46%, #142220 100%)' }}>
        <div className="absolute inset-0 opacity-[0.04]"
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl"
             style={{ background: 'rgba(4,120,87,0.2)' }} />

        <div className="relative max-w-[1440px] mx-auto">
          <div className="flex items-center gap-4 mb-5">
            <Link to={user && user.roles.includes('admin') ? '/admin' : '/dashboard'}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-70"
                  style={{ color: 'var(--bfg-beige)' }}>
              Dashboard
            </Link>
            <span style={{ color: 'rgba(187,176,155,0.4)' }}>/</span>
            <Link to="/auctions"
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-70"
                  style={{ color: 'var(--bfg-beige)' }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Auctions
            </Link>
          </div>

          {/* ── Admin preview banner ───────────────────────────── */}
          {user?.roles?.includes('admin') && listing.status !== 'active' && (
            <div className="mb-5 px-5 py-3 rounded-xl flex items-center gap-3"
              style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#92400E' }}>
              <Shield className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold">Preview — {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)} Review</p>
                <p className="text-xs mt-0.5 opacity-80">Only admins can see this listing. It is not yet visible to the public.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest"
                  style={{ background: 'rgba(187,176,155,0.12)', color: 'var(--bfg-beige)', border: '1px solid rgba(187,176,155,0.2)' }}>
              <Shield className="w-3 h-3" /> {charityName}
            </span>
            {urgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest"
                    style={{ background: 'var(--bfg-danger)', color: '#fff' }}>
                <Flame className="w-3 h-3" /> Ending Soon
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-white mb-10 max-w-3xl leading-tight">
            {listing.title}
          </h1>
        </div>

      </div>

      {/* ── Campaign metrics band — sits between hero and body ─── */}
      <div className="px-6 py-5 border-b" style={{ background: '#FFFFFF', borderColor: 'var(--bfg-beige)' }}>
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center gap-x-8 gap-y-3">

          {[
            { label: 'Raised',      value: `$${raised.toLocaleString()}`,                    color: 'var(--bfg-emerald)' },
            { label: 'Goal',        value: `$${goal.toLocaleString()}`,                       color: 'var(--bfg-slate)'   },
            { label: 'Total Bids',  value: String(listing.bid_count),                         color: 'var(--bfg-slate)'   },
            { label: 'Starting at', value: `$${listing.starting_price.toLocaleString()}`,     color: 'var(--bfg-slate)'   },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} className="flex items-center gap-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--bfg-text-muted)' }}>{label}</p>
                <p className="text-xl font-black leading-none" style={{ color }}>{value}</p>
              </div>
              {/* Dot separator between stats only, not after last one */}
              {i < arr.length - 1 && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--bfg-beige)' }} />
              )}
            </div>
          ))}

          {/* Progress bar — takes remaining horizontal space */}
          <div className="flex-1 min-w-[200px] ml-4">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--bfg-text-muted)' }}>
              <span>Campaign Progress</span>
              <span style={{ color: 'var(--bfg-emerald)' }}>{pct}% funded</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#E5E0D8' }}>
              <div className="h-2 rounded-full transition-all duration-700"
                   style={{ width: `${pct}%`, background: 'var(--bfg-emerald)' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 pt-8 pb-10">
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── LEFT: gallery + details ─────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Gallery card */}
            <div className="rounded-2xl bg-white overflow-hidden"
                 style={{ border: '1px solid var(--bfg-beige)' }}>

              {/* Main image */}
              <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                {/* eslint-disable-next-line security/detect-object-injection */}
                <img src={images[selectedImage]} alt={listing.title}
                     className="w-full h-full object-cover transition-opacity duration-200" />
              </div>

              {/* Thumbnail strip */}
              <div className="flex gap-2 p-4 overflow-x-auto border-t" style={{ borderColor: 'var(--bfg-beige)' }}>
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    disabled={images.length === 1}
                    className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 transition-all"
                    style={{
                      border: `2px solid ${i === selectedImage ? 'var(--bfg-emerald)' : 'var(--bfg-beige)'}`,
                      opacity: i === selectedImage ? 1 : 0.55,
                      cursor: images.length === 1 ? 'default' : 'pointer',
                    }}>
                    <img src={img} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Item detail card */}
            <div className="rounded-2xl p-8 bg-white" style={{ border: '1px solid var(--bfg-beige)' }}>
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  listing.category,
                  listing.condition.replace('_', ' '),
                  `Auction #${listing.id}`,
                  `Listed ${new Date(listing.start_time).toLocaleDateString()}`,
                ].map(tag => (
                  <span key={tag}
                        className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                        style={{ background: 'var(--bfg-linen)', color: 'var(--bfg-text-muted)', border: '1px solid var(--bfg-beige)' }}>
                    {tag}
                  </span>
                ))}
              </div>

              <h2 className="text-2xl font-black mb-4" style={{ color: 'var(--bfg-slate)' }}>
                About This Auction
              </h2>
              <p className="leading-relaxed text-sm whitespace-pre-wrap mb-8" style={{ color: 'var(--bfg-text-muted)' }}>
                {listing.description}
              </p>

              {/* Beneficiary row */}
              <div className="flex items-center gap-4 rounded-xl p-4"
                   style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-black"
                     style={{ background: 'var(--bfg-emerald-light)', color: 'var(--bfg-emerald)', border: '1px solid rgba(4,120,87,0.2)' }}>
                  {charityName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--bfg-text-muted)' }}>Beneficiary</p>
                  <p className="font-bold text-sm truncate" style={{ color: 'var(--bfg-slate)' }}>{charityName}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--bfg-text-muted)' }}>In support of {campaignName}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--bfg-emerald)' }}>
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Verified</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 lg:sticky lg:top-6"
               style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>

            {/* Bid card */}
            <div className="rounded-2xl bg-white overflow-hidden mb-6"
                 style={{ border: '1px solid var(--bfg-beige)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>

              {/* Callout */}
              <div className="px-6 py-4 border-b" style={{ background: 'var(--bfg-linen)', borderColor: 'var(--bfg-beige)' }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--bfg-text-muted)' }}>
                  Your bid supports
                </p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--bfg-emerald)' }}>{campaignName}</p>
              </div>

              <div className="p-6 space-y-6">

                {/* Current bid */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--bfg-text-muted)' }}>
                    Current Highest Bid
                  </p>
                  <p className="text-5xl font-black leading-none mb-1.5" style={{ color: 'var(--bfg-emerald)' }}>
                    ${listing.current_bid.toLocaleString()}
                  </p>
                  <p className="text-xs font-medium" style={{ color: 'var(--bfg-text-muted)' }}>
                    {listing.bid_count > 0
                      ? (<>by <span className="font-mono font-bold" style={{ color: 'var(--bfg-slate)' }}>{maskUsername(bidHistory[0]?.bidder_username ?? 'someone')}</span> · {listing.bid_count} bid{listing.bid_count !== 1 ? 's' : ''}</>)
                      : 'No bids yet — be the first!'}
                  </p>
                </div>

                {/* Timer */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--bfg-text-muted)' }}>
                    Auction Ends In
                  </p>
                  <CountdownBlock end={listing.end_time} />
                </div>

                {/* Bid form — bidders only */}
                {isBidderUser ? (
                  <>
                    <div>
                      <div className="flex justify-between items-baseline mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--bfg-slate)' }}>
                          Your Bid
                        </p>
                        <p className="text-[10px] font-medium" style={{ color: 'var(--bfg-text-muted)' }}>
                          Min&nbsp;${minNextBid.toLocaleString()}
                        </p>
                      </div>
                      {/* Dollar prefix + input in a proper flex row — no absolute positioning */}
                      <div className="flex items-center rounded-xl overflow-hidden"
                           style={{ border: '2px solid var(--bfg-beige)' }}
                           onFocus={() => {}} // handled inline below
                      >
                        <span className="pl-4 pr-1 font-bold text-base select-none flex-shrink-0"
                              style={{ color: 'var(--bfg-text-muted)' }}>$</span>
                        <input
                          type="number"
                          min={minNextBid}
                          value={amount}
                          disabled={auctionEnded}
                          onChange={e => setAmount(e.target.value)}
                          className="flex-1 py-3 pr-4 font-black text-lg bg-transparent outline-none"
                          style={{ color: 'var(--bfg-slate)' }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={submitBid}
                      disabled={auctionEnded || submitting}
                      className="w-full py-3.5 text-white font-black rounded-xl text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'var(--bfg-emerald)' }}
                      onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bfg-emerald-dark)' }}
                      onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bfg-emerald)' }}>
                      {submitting ? 'Placing Bid…' : 'Place Bid'}
                    </button>

                    {bidError && (
                      <p className="text-xs font-bold text-center rounded-lg py-2 px-3"
                         style={{ background: 'var(--bfg-danger-light)', color: 'var(--bfg-danger)', border: '1px solid var(--bfg-danger-border)' }}>
                        {bidError}
                      </p>
                    )}
                    {bidMessage && (
                      <p className="text-xs font-bold text-center rounded-lg py-2 px-3"
                         style={{ background: 'var(--bfg-emerald-light)', color: 'var(--bfg-emerald)', border: '1px solid rgba(4,120,87,0.2)' }}>
                        {bidMessage}
                      </p>
                    )}

                    {/* Auto-bid */}
                    <div className="pt-5 border-t" style={{ borderColor: 'var(--bfg-beige)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--bfg-slate)' }}>Auto-Bid</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--bfg-text-muted)' }}>Bid automatically up to a limit</p>
                        </div>
                        {/* Toggle — pure CSS, no translate issues */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoBidOn}
                          onClick={() => setAutoBidOn(v => !v)}
                          className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                          style={{ background: autoBidOn ? 'var(--bfg-emerald)' : 'var(--bfg-beige)' }}>
                          <span
                            className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
                            style={{ transform: autoBidOn ? 'translateX(20px)' : 'translateX(0px)' }}
                          />
                        </button>
                      </div>
                      {autoBidOn && (
                        <div className="space-y-3">
                          <div className="flex items-center rounded-xl overflow-hidden"
                               style={{ border: '1px solid var(--bfg-beige)' }}>
                            <span className="pl-4 pr-1 font-bold text-sm flex-shrink-0 select-none"
                                  style={{ color: 'var(--bfg-text-muted)' }}>$</span>
                            <input
                              type="number"
                              min={listing.winner_id === user?.id ? listing.current_bid : minNextBid}
                              placeholder="Max amount…"
                              value={maxAutoBid}
                              onChange={e => setMaxAutoBid(e.target.value)}
                              className="flex-1 py-2.5 pr-3 text-sm bg-transparent outline-none"
                              style={{ color: 'var(--bfg-slate)' }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={submitAutoBid}
                            disabled={auctionEnded || autoBidSaving}
                            className="w-full py-2.5 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'var(--bfg-slate)' }}>
                            {autoBidSaving ? 'Saving Auto-Bid…' : savedAutoBidActive ? 'Update Auto-Bid' : 'Save Auto-Bid'}
                          </button>
                          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--bfg-text-muted)' }}>
                            Your maximum is only visible to you. Other bidders only see public bid amounts.
                          </p>
                        </div>
                      )}

                      {!autoBidOn && savedAutoBidActive && (
                        <button
                          type="button"
                          onClick={cancelSavedAutoBid}
                          disabled={autoBidSaving}
                          className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ border: '1px solid var(--bfg-danger-border)', color: 'var(--bfg-danger)', background: 'var(--bfg-danger-light)' }}>
                          {autoBidSaving ? 'Cancelling…' : 'Cancel Saved Auto-Bid'}
                        </button>
                      )}
                    </div>

                    {listing.buy_now_price && (
                      <button
                        className="w-full py-3 text-white font-black rounded-xl text-sm uppercase tracking-widest transition-all"
                        style={{ background: 'var(--bfg-slate)' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#000'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bfg-slate)'}>
                        Buy Now — ${listing.buy_now_price.toLocaleString()}
                      </button>
                    )}

                    <button
                      onClick={() => setSaved(v => !v)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                      style={{ border: '1px solid var(--bfg-beige)', color: saved ? 'var(--bfg-danger)' : 'var(--bfg-text-muted)', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bfg-linen)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Heart className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} />
                      {saved ? 'Saved to Watchlist' : 'Save to Watchlist'}
                    </button>
                  </>
                ) : !isAuthenticated ? (
                  <div className="rounded-xl px-4 py-5 text-center" style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
                    <p className="text-xs font-medium mb-3" style={{ color: 'var(--bfg-text-muted)' }}>
                      Sign in as a bidder to participate
                    </p>
                    <Link to="/login"
                          className="inline-block px-6 py-2.5 text-white text-xs font-black rounded-xl uppercase tracking-widest"
                          style={{ background: 'var(--bfg-slate)' }}>
                      Sign In
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Live bid history */}
            <div className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid var(--bfg-beige)' }}>
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--bfg-beige)' }}>
                <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--bfg-slate)' }}>
                  Live Bid History
                </h3>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                     style={{ background: 'var(--bfg-linen)', border: '1px solid var(--bfg-beige)' }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--bfg-danger)' }} />
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--bfg-danger)' }}>Live</span>
                </div>
              </div>

              <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
                {bidHistory.length > 0
                  ? bidHistory.map((b, i) => <BidRow key={b.id ?? i} bid={b} isTop={i === 0} />)
                  : (
                    <div className="py-8 text-center">
                      <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--bfg-beige)' }} />
                      <p className="text-xs font-medium" style={{ color: 'var(--bfg-text-muted)' }}>
                        No bids placed yet. Be the first!
                      </p>
                    </div>
                  )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}