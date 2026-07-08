import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, PackageCheck, RefreshCw, TimerReset, Loader2, X } from 'lucide-react'
import api from '../services/api'
import type { PaymentWithListing, Receipt, ApiError } from '../types'

const C = {
  linen: 'var(--bfg-linen)',
  beige: 'var(--bfg-beige)',
  slate: 'var(--bfg-slate)',
  muted: 'var(--bfg-text-muted)',
  emerald: 'var(--bfg-emerald)',
  emeraldLight: 'var(--bfg-emerald-light)',
  danger: 'var(--bfg-danger)',
  dangerLight: 'var(--bfg-danger-light)',
  dangerBorder: 'var(--bfg-danger-border)',
}

const money = (value: number) => `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getDeadlineMs = (deadline: string) => new Date(deadline).getTime()

const canCompletePayment = (payment: PaymentWithListing, nowMs: number) =>
  payment.status === 'pending' &&
  nowMs > 0 &&
  getDeadlineMs(payment.payment_deadline) > nowMs

const deadlineText = (deadline: string, nowMs: number) => {
  if (nowMs <= 0) return 'Pending'
  const diff = getDeadlineMs(deadline) - nowMs
  if (diff <= 0) return 'Deadline passed'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

const statusStyle = (payment: PaymentWithListing, nowMs: number) => {
  if (payment.status === 'successful') {
    if (payment.listing_status === 'delivered') {
      return { label: 'Delivered', icon: PackageCheck, bg: '#D1FAE5', fg: '#065F46', border: 'rgba(6,95,70,0.20)' }
    }
    if (payment.listing_status === 'shipped') {
      return { label: 'Shipped', icon: PackageCheck, bg: '#EDE9FE', fg: '#5B21B6', border: 'rgba(91,33,182,0.20)' }
    }
    return { label: 'Paid', icon: CheckCircle2, bg: C.emeraldLight, fg: C.emerald, border: 'rgba(4,120,87,0.20)' }
  }
  if (canCompletePayment(payment, nowMs)) {
    return { label: deadlineText(payment.payment_deadline, nowMs), icon: Clock, bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' }
  }
  return { label: payment.status === 'pending' ? 'Overdue' : 'Expired', icon: AlertTriangle, bg: C.dangerLight, fg: C.danger, border: C.dangerBorder }
}

// ─── Receipt modal ────────────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="rounded-2xl bg-white w-full max-w-md mx-4 overflow-hidden shadow-xl"
        style={{ border: '1px solid var(--bfg-beige)' }}
        onClick={e => e.stopPropagation()}>

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.beige }}>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: C.emerald }} />
            <h2 className="font-black text-base" style={{ color: C.slate }}>Donation Receipt</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: C.muted }} /></button>
        </div>

        {/* body */}
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl p-4 space-y-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
            <Row label="Donor" value={receipt.bidder_username} />
            <Row label="Item" value={receipt.item_title} />
            <Row label="Beneficiary" value={receipt.charity_name} />
            <Row label="Amount Paid" value={money(receipt.amount)} highlight />
            <Row label="Generated" value={new Date(receipt.generated_at).toLocaleString()} />
            <Row label="Receipt ID" value={receipt.uuid} mono />
            <Row label="Payment Ref" value={receipt.payment_ref} mono />
          </div>
          <p className="text-xs text-center" style={{ color: C.muted }}>
            This receipt is immutable and cannot be modified after generation.
          </p>
        </div>

        <div className="px-6 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold"
            style={{ border: `1px solid ${C.beige}`, color: C.slate }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs font-bold shrink-0" style={{ color: C.muted }}>{label}</span>
      <span className={`text-xs text-right break-all ${mono ? 'font-mono' : 'font-semibold'}`}
        style={{ color: highlight ? C.emerald : C.slate }}>
        {value}
      </span>
    </div>
  )
}

// ─── Payment card ─────────────────────────────────────────────────────────────
function PaymentCard({
  payment, onComplete, onViewReceipt, onConfirmDelivery,
  completing, confirmingDelivery, nowMs,
}: {
  payment: PaymentWithListing
  onComplete: (uuid: string) => void
  onViewReceipt: (paymentUuid: string) => void
  onConfirmDelivery: (paymentUuid: string) => void
  completing: boolean
  confirmingDelivery: boolean
  nowMs: number
}) {
  const style = statusStyle(payment, nowMs)
  const Icon = style.icon
  const canPay = canCompletePayment(payment, nowMs)
  const isPaid = payment.status === 'successful'
  const isShipped = isPaid && payment.listing_status === 'shipped'
  const isDelivered = isPaid && payment.listing_status === 'delivered'

  return (
    <div className="rounded-2xl bg-white overflow-hidden shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="p-6 flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: C.linen, color: C.slate }}>
          <CreditCard className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
              style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}>
              <Icon className="w-3.5 h-3.5" /> {style.label}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
              Ref: {payment.payment_ref}
            </span>
          </div>

          <h2 className="text-lg font-black leading-tight" style={{ color: C.slate }}>{payment.listing_title}</h2>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>Beneficiary: {payment.charity_name}</p>

          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl p-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Amount Due</p>
              <p className="text-lg font-black font-mono" style={{ color: C.emerald }}>{money(payment.amount)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Deadline</p>
              <p className="text-sm font-bold" style={{ color: C.slate }}>{new Date(payment.payment_deadline).toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: C.linen, border: `1px solid ${C.beige}` }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Escrow</p>
              <p className="text-sm font-bold capitalize" style={{ color: C.slate }}>{payment.escrow_state.replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        <div className="flex lg:flex-col gap-2 lg:w-44">
          {/* pending: pay now */}
          {!isPaid && (
            <button type="button" disabled={!canPay || completing}
              onClick={() => onComplete(payment.uuid)}
              className="flex-1 lg:flex-none py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              style={{ background: C.emerald }}>
              {completing ? 'Processing…' : 'Pay Now'}
            </button>
          )}

          {/* paid: view receipt (SFR14) */}
          {isPaid && (
            <button type="button"
              onClick={() => onViewReceipt(payment.uuid)}
              className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
              style={{ background: C.emeraldLight, color: C.emerald, border: `1px solid rgba(4,120,87,0.20)` }}>
              <FileText className="w-3.5 h-3.5" /> Receipt
            </button>
          )}

          {/* shipped: confirm delivery (SFR15) */}
          {isShipped && (
            <button type="button" disabled={confirmingDelivery}
              onClick={() => onConfirmDelivery(payment.uuid)}
              className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: '#5B21B6' }}>
              {confirmingDelivery
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…</>
                : <><PackageCheck className="w-3.5 h-3.5" /> Item Received</>}
            </button>
          )}

          {/* delivered: badge */}
          {isDelivered && (
            <div className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest"
              style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid rgba(6,95,70,0.20)' }}>
              <PackageCheck className="w-3.5 h-3.5" /> Delivered
            </div>
          )}

          <Link to={`/auctions/${payment.listing_uuid}`}
            className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            style={{ color: C.slate, border: `1px solid ${C.beige}` }}>
            View <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PaymentDeadlinesPage() {
  const [payments, setPayments] = useState<PaymentWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [completingUuid, setCompletingUuid] = useState<string | null>(null)
  const [confirmingUuid, setConfirmingUuid] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(0)

  // receipt modal
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)

  const pendingCount = useMemo(
    () => payments.filter(p => canCompletePayment(p, nowMs)).length,
    [payments, nowMs],
  )

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: PaymentWithListing[]; total: number }>('/payments/mine')
      setPayments(res.data.data)
      setError(null)
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to load payment deadlines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => setNowMs(Date.now()), 0)
    const iv = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => { window.clearTimeout(id); window.clearInterval(iv) }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadPayments() }, 0)
    return () => window.clearTimeout(id)
  }, [loadPayments])

  const completePayment = async (uuid: string) => {
    setCompletingUuid(uuid)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/payments/${uuid}/complete`)
      setMessage('Payment completed successfully. Your donation receipt is now available.')
      await loadPayments()
    } catch (err) {
      setError((err as { message?: string }).message || 'Payment could not be completed')
      await loadPayments()
    } finally {
      setCompletingUuid(null)
    }
  }

  const viewReceipt = async (paymentUuid: string) => {
    setReceiptLoading(true)
    setReceiptError(null)
    try {
      const res = await api.get<Receipt>(`/payments/${paymentUuid}/receipt`)
      setReceipt(res.data)
    } catch (err) {
      setReceiptError((err as ApiError).message || 'Failed to load receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const confirmDelivery = async (paymentUuid: string) => {
    const payment = payments.find(p => p.uuid === paymentUuid)
    if (!payment) return
    setConfirmingUuid(paymentUuid)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/listings/${payment.listing_uuid}/confirm-delivery`)
      setMessage('Delivery confirmed. The escrow has been released to the charity.')
      await loadPayments()
    } catch (err) {
      setError((err as ApiError).message || 'Failed to confirm delivery.')
    } finally {
      setConfirmingUuid(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3"
              style={{ background: '#FFFFFF', border: `1px solid ${C.beige}`, color: C.emerald }}>
              <TimerReset className="w-3.5 h-3.5" /> FR14 Payment Deadline
            </div>
            <h1 className="text-3xl font-black" style={{ color: C.slate }}>Payment Deadlines</h1>
            <p className="mt-2" style={{ color: C.muted }}>
              Complete payment before the deadline. If payment is missed, the auction expires instead of being reassigned to another bidder.
            </p>
          </div>
          <button type="button" onClick={loadPayments}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={{ background: '#FFFFFF', border: `1px solid ${C.beige}`, color: C.slate }}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Pending Offers</p>
            <p className="text-2xl font-black mt-1" style={{ color: C.emerald }}>{pendingCount}</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>All Payment Records</p>
            <p className="text-2xl font-black mt-1" style={{ color: C.slate }}>{payments.length}</p>
          </div>
          <div className="rounded-2xl p-5 bg-white" style={{ border: `1px solid ${C.beige}` }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Reminder</p>
            <p className="text-sm font-bold mt-1" style={{ color: C.slate }}>Deadline is enforced by backend worker</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
            {error}
          </div>
        )}
        {receiptError && (
          <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>
            {receiptError}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.emeraldLight, color: C.emerald, border: '1px solid rgba(4,120,87,0.20)' }}>
            {message}
          </div>
        )}

        {loading || receiptLoading ? (
          <div className="rounded-2xl bg-white p-10 text-center" style={{ border: `1px solid ${C.beige}` }}>
            <div className="w-10 h-10 mx-auto rounded-full border-4 animate-spin" style={{ borderColor: C.emerald, borderTopColor: 'transparent' }} />
            <p className="mt-4 text-sm font-medium" style={{ color: C.muted }}>
              {receiptLoading ? 'Loading receipt…' : 'Loading payment deadlines…'}
            </p>
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center" style={{ border: `1px solid ${C.beige}` }}>
            <CreditCard className="w-10 h-10 mx-auto mb-3" style={{ color: C.beige }} />
            <p className="font-black" style={{ color: C.slate }}>No payment offers yet</p>
            <p className="text-sm mt-1" style={{ color: C.muted }}>When you win an auction, your payment deadline will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map(payment => (
              <PaymentCard
                key={payment.uuid}
                payment={payment}
                onComplete={completePayment}
                onViewReceipt={viewReceipt}
                onConfirmDelivery={confirmDelivery}
                completing={completingUuid === payment.uuid}
                confirmingDelivery={confirmingUuid === payment.uuid}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
      </div>

      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}