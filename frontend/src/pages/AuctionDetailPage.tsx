import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import type { Bid, Listing } from '../types'
import { useAuthStore } from '../store/authStore'

export default function AuctionDetailPage() {
  const { id } = useParams()
  const { isAuthenticated, user } = useAuthStore()
  const [listing, setListing] = useState<Listing | null>(null)
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      try {
        const res = await api.get<Listing>(`/listings/${id}`)
        setListing(res.data)
        setAmount(String((res.data.current_bid || res.data.starting_price) + (res.data.min_increment || 1)))
      } catch (err) {
        setError((err as { message?: string }).message || 'Listing not found')
      }
    }
    load()
  }, [id])

  const submitBid = async () => {
    if (!listing) return
    setError(null); setMessage(null)
    try {
      const res = await api.post<Bid>('/bids', { listing_id: listing.id, amount: Number(amount) })
      setMessage(`Bid accepted at $${res.data.amount.toFixed(2)}`)
      setListing({ ...listing, current_bid: res.data.amount, bid_count: listing.bid_count + 1 })
    } catch (err) {
      setError((err as { message?: string }).message || 'Bid failed')
    }
  }

  if (error && !listing) return <div className="container mx-auto px-4 py-12"><p>{error}</p></div>
  if (!listing) return <div className="container mx-auto px-4 py-12"><p>Loading listing...</p></div>

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto rounded-2xl bg-white p-8" style={{ border: '1px solid var(--bfg-beige)' }}>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--bfg-emerald)' }}>{listing.category}</p>
        <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--bfg-slate)' }}>{listing.title}</h1>
        <p className="mb-6" style={{ color: 'var(--bfg-text-muted)' }}>{listing.description}</p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div><p className="text-xs uppercase">Current bid</p><p className="text-2xl font-bold">${listing.current_bid.toLocaleString()}</p></div>
          <div><p className="text-xs uppercase">Minimum increment</p><p className="text-2xl font-bold">${listing.min_increment ?? 1}</p></div>
        </div>
        {isAuthenticated && user?.roles.includes('bidder') ? (
          <div className="flex gap-3">
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" className="flex-1 rounded-xl px-4 py-2" style={{ border: '1px solid var(--bfg-beige)' }} />
            <button onClick={submitBid} className="rounded-xl px-5 py-2 text-white font-semibold" style={{ background: 'var(--bfg-emerald)' }}>Place Bid</button>
          </div>
        ) : <p className="text-sm">Log in as a bidder to place a bid.</p>}
        {message && <p className="mt-4 text-sm" style={{ color: 'var(--bfg-emerald)' }}>{message}</p>}
        {error && <p className="mt-4 text-sm" style={{ color: 'var(--bfg-danger)' }}>{error}</p>}
      </div>
    </div>
  )
}
