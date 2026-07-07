import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import type { ApiError, Listing } from '../types'

const C = {
    slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#065F46', emeraldLight: '#ECFDF5',
    beige: '#BBB09B', linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E',
    warning: '#92400E', warningLight: '#FFFBEB', danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

interface CharityListingReviewResponse {
    canReviewListings: boolean
    charity?: {
        id: number
        uuid: string
        organisationName: string
        status: 'approved' | 'pending' | 'rejected'
    }
    listings: Listing[]
}

type AlertMsg = { type: 'success' | 'error'; text: string } | null

function apiErrMsg(err: unknown, fallback: string): string {
    return (err as ApiError)?.message || fallback
}

function formatMoney(value: number) {
    return `$${value.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-SG', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
}

function cardStyle(): CSSProperties {
    return { background: C.white, border: `1px solid ${C.beige}`, boxShadow: '0 4px 16px rgba(45,58,58,0.05)' }
}

function primaryButton(disabled: boolean): CSSProperties {
    return { background: disabled ? C.beige : C.emerald, color: '#fff' }
}

function rejectButton(disabled: boolean): CSSProperties {
    return { background: disabled ? C.beige : C.danger, color: '#fff' }
}

function cancelButton(disabled: boolean): CSSProperties {
    return {
        background: disabled ? C.beige : C.white,
        color: C.slate,
        border: `1px solid ${C.beige}`,
    }
}

export default function CharityListingReviewPage() {
    const [listings, setListings] = useState<Listing[]>([])
    const [charityName, setCharityName] = useState('')
    const [canReviewListings, setCanReviewListings] = useState(false)
    const [loading, setLoading] = useState(true)
    const [reviewingUuid, setReviewingUuid] = useState<string | null>(null)
    const [rejectingUuid, setRejectingUuid] = useState<string | null>(null)
    const [rejectionReason, setRejectionReason] = useState('')
    const [search, setSearch] = useState('')
    const [message, setMessage] = useState<AlertMsg>(null)

    useEffect(() => {
        let isMounted = true

        // Initial page load is triggered after the component mounts.
        // We avoid calling setState synchronously in the effect body because
        // React's lint rule flags that as a possible cascading render.
        void api.get<CharityListingReviewResponse>('/listings/charity/review')
            .then((res) => {
                if (!isMounted) return

                setListings(res.data.listings)
                setCanReviewListings(res.data.canReviewListings)
                setCharityName(res.data.charity?.organisationName ?? '')
            })
            .catch((err) => {
                if (!isMounted) return

                setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to load listing review queue.') })
                setListings([])
                setCanReviewListings(false)
            })
            .finally(() => {
                if (!isMounted) return

                setLoading(false)
            })

        return () => {
            isMounted = false
        }
    }, [])

    const filteredListings = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return listings
        return listings.filter((listing) => {
            const haystack = `${listing.title} ${listing.description} ${listing.category} ${listing.charityName ?? ''}`.toLowerCase()
            return haystack.includes(q)
        })
    }, [listings, search])

    const approveListing = async (listing: Listing) => {
        if (!listing.uuid) return
        setReviewingUuid(listing.uuid)
        setMessage(null)
        try {
            await api.post(`/listings/${listing.uuid}/charity-review`, { decision: 'approved' })
            setListings((prev) => prev.filter((item) => item.uuid !== listing.uuid))
            setMessage({ type: 'success', text: `“${listing.title}” was approved and published.` })
        } catch (err) {
            setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to approve listing.') })
        } finally {
            setReviewingUuid(null)
        }
    }

    const rejectListing = async (listing: Listing) => {
        if (!listing.uuid) return
        const reason = rejectionReason.trim()
        if (reason.length < 5) {
            setMessage({ type: 'error', text: 'Please enter a rejection reason of at least 5 characters.' })
            return
        }

        setReviewingUuid(listing.uuid)
        setMessage(null)
        try {
            await api.post(`/listings/${listing.uuid}/charity-review`, { decision: 'rejected', reason })
            setListings((prev) => prev.filter((item) => item.uuid !== listing.uuid))
            setRejectingUuid(null)
            setRejectionReason('')
            setMessage({ type: 'success', text: `“${listing.title}” was rejected and returned to the donor.` })
        } catch (err) {
            setMessage({ type: 'error', text: apiErrMsg(err, 'Failed to reject listing.') })
        } finally {
            setReviewingUuid(null)
        }
    }

    return (
        <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3"
                            style={{ background: C.emeraldLight, color: C.emerald }}>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black" style={{ color: C.slate }}>Review Assigned Auction Listings</h1>
                        <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>
                            Approve or reject donor listings linked to your charity campaigns before they appear publicly on the campaign page.
                        </p>
                    </div>
                    <Link to="/charity/campaigns" className="text-sm font-bold hover:underline" style={{ color: C.emerald }}>
                        Back to Campaigns
                    </Link>
                </div>

                {message && (
                    <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                        style={{ background: message.type === 'success' ? C.emeraldLight : C.dangerLight, border: `1px solid ${message.type === 'success' ? 'rgba(4,120,87,0.2)' : C.dangerBorder}` }}>
                        {message.type === 'success'
                            ? <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />
                            : <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />}
                        <p className="text-sm font-semibold" style={{ color: message.type === 'success' ? C.emerald : C.danger }}>{message.text}</p>
                    </div>
                )}

                <section className="rounded-2xl p-5 mb-6" style={cardStyle()}>
                    <div className="grid md:grid-cols-[1fr_280px] gap-4 items-center">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: C.muted }}>Reviewing for</p>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5" style={{ color: C.emerald }} />
                                <p className="font-black" style={{ color: C.slate }}>{charityName || 'Your charity organisation'}</p>
                            </div>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.beige }} />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search pending listings..."
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                                style={{ border: `1px solid ${C.beige}`, color: C.slate, background: C.white }}
                            />
                        </div>
                    </div>
                </section>

                {!canReviewListings && !loading && (
                    <div className="rounded-2xl p-8 text-center" style={cardStyle()}>
                        <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: C.warning }} />
                        <p className="font-black mb-1" style={{ color: C.slate }}>Review access is not available</p>
                        <p className="text-sm" style={{ color: C.muted }}>Your charity account may still be pending approval or not linked to a charity organisation.</p>
                    </div>
                )}

                {loading ? (
                    <div className="rounded-2xl p-10 flex items-center justify-center gap-3" style={cardStyle()}>
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.emerald }} />
                        <p className="text-sm font-semibold" style={{ color: C.muted }}>Loading listings for review...</p>
                    </div>
                ) : canReviewListings && filteredListings.length === 0 ? (
                    <div className="rounded-2xl p-10 text-center" style={cardStyle()}>
                        <ClipboardCheck className="w-10 h-10 mx-auto mb-4" style={{ color: C.beige }} />
                        <p className="font-black mb-1" style={{ color: C.slate }}>No pending listings</p>
                        <p className="text-sm" style={{ color: C.muted }}>Good news: your review queue is clear. Tiny confetti, audit-safe edition.</p>
                    </div>
                ) : canReviewListings && (
                    <div className="grid lg:grid-cols-2 gap-5">
                        {filteredListings.map((listing) => {
                            const image = listing.images?.[0] || 'https://via.placeholder.com/640x420?text=No+Image'
                            const isReviewing = reviewingUuid === listing.uuid
                            const isRejecting = rejectingUuid === listing.uuid
                            return (
                                <article key={listing.uuid ?? listing.id} className="rounded-2xl overflow-hidden" style={cardStyle()}>
                                    <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
                                        <img src={image} alt={listing.title} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.warningLight, color: C.warning }}>Awaiting Your Review</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.linen, color: C.muted }}>{listing.category}</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: C.linen, color: C.muted }}>{listing.condition.replace('_', ' ')}</span>
                                            </div>
                                            <h2 className="text-lg font-black leading-tight" style={{ color: C.slate }}>{listing.title}</h2>
                                            <p className="text-sm mt-2 line-clamp-3" style={{ color: C.muted }}>{listing.description}</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-xl p-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Starting price</p>
                                                <p className="font-black" style={{ color: C.slate }}>{formatMoney(listing.starting_price)}</p>
                                            </div>
                                            <div className="rounded-xl p-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Minimum increment</p>
                                                <p className="font-black" style={{ color: C.slate }}>{formatMoney(listing.min_increment ?? 1)}</p>
                                            </div>
                                            <div className="rounded-xl p-3 col-span-2" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
                                                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Scheduled auction window</p>
                                                <p className="font-bold" style={{ color: C.slate }}>{formatDateTime(listing.start_time)} → {formatDateTime(listing.end_time)}</p>
                                            </div>
                                        </div>

                                        {isRejecting && (
                                            <div className="rounded-xl p-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                                                <label className="block text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.danger }}>Rejection reason <span className="font-semibold normal-case tracking-normal">(min 5 characters, shown to the donor)</span></label>
                                                <textarea
                                                    value={rejectionReason}
                                                    onChange={(e) => setRejectionReason(e.target.value)}
                                                    rows={3}
                                                    maxLength={300}
                                                    placeholder="Explain why this listing is being rejected (min 5 characters)..."
                                                    className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                                                    style={{ border: `1px solid ${C.dangerBorder}`, color: C.slate }}
                                                />
                                                <p className="text-[11px] mt-1" style={{ color: rejectionReason.trim().length < 5 ? C.danger : C.muted }}>
                                                    {rejectionReason.trim().length < 5
                                                        ? `${5 - rejectionReason.trim().length} more character(s) required`
                                                        : 'This rejection is final — the donor cannot resubmit.'}
                                                </p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                            {isRejecting ? (
                                                <button
                                                    type="button"
                                                    disabled={isReviewing}
                                                    onClick={() => {
                                                        // Cancel rejection mode and clear the reason so the next listing starts clean.
                                                        setRejectingUuid(null)
                                                        setRejectionReason('')
                                                        setMessage(null)
                                                    }}
                                                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed"
                                                    style={cancelButton(isReviewing)}
                                                >
                                                    Cancel
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={isReviewing}
                                                    onClick={() => void approveListing(listing)}
                                                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed"
                                                    style={primaryButton(isReviewing)}
                                                >
                                                    <CheckCircle2 className="w-4 h-4" /> Approve
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                disabled={isReviewing}
                                                onClick={() => {
                                                    if (isRejecting) {
                                                        void rejectListing(listing)
                                                    } else {
                                                        // Enter rejection mode for this listing only.
                                                        setRejectingUuid(listing.uuid ?? null)
                                                        setRejectionReason('')
                                                        setMessage(null)
                                                    }
                                                }}
                                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed"
                                                style={rejectButton(isReviewing)}
                                            >
                                                <XCircle className="w-4 h-4" /> {isRejecting ? 'Confirm Reject' : 'Reject'}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}