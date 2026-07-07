import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ExternalLink, RefreshCw, TimerReset } from 'lucide-react'
import api from '../services/api'
import type { PaymentWithListing } from '../types'

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
    return {
      label: 'Paid',
      icon: CheckCircle2,
      bg: C.emeraldLight, fg: C.emerald, border: 'rgba(4,120,87,0.20)',
    }
  }

  if (canCompletePayment(payment, nowMs)) {
    return {
      label: deadlineText(payment.payment_deadline, nowMs),
      icon: Clock,
      bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA',
    }
  }

  return {
    label: payment.status === 'pending' ? 'Overdue' : 'Expired',
    icon: AlertTriangle,
    bg: C.dangerLight,
    fg: C.danger,
    border: C.dangerBorder,
  }
}

function PaymentCard({ payment, onComplete, completing, nowMs, }: { payment: PaymentWithListing; onComplete: (uuid: string) => void; completing: boolean; nowMs: number }) {
  const style = statusStyle(payment, nowMs)
  const Icon = style.icon
  const canPay = canCompletePayment(payment, nowMs)

  return (
    <div className="rounded-2xl bg-white overflow-hidden shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="p-6 flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: C.linen, color: C.slate }}>
          <CreditCard className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}>
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
          <button
            type="button"
            disabled={!canPay || completing}
            onClick={() => onComplete(payment.uuid)}
            className="flex-1 lg:flex-none py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            style={{ background: C.emerald }}
          >
            {completing ? 'Processing…' : 'Pay Now'}
          </button>
          <Link
            to={`/auctions/${payment.listing_uuid}`}
            className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            style={{ color: C.slate, border: `1px solid ${C.beige}` }}
          >
            View <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PaymentDeadlinesPage() {
  const [payments, setPayments] = useState<PaymentWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [completingUuid, setCompletingUuid] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(0)

  const pendingCount = useMemo(
    () => payments.filter(payment => canCompletePayment(payment, nowMs)).length,
    [payments, nowMs],
  )

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: PaymentWithListing[]; total: number }>('/payments/mine')
      // Only show pending payments — exclude successful/expired ones
      setPayments(res.data.data.filter(p => p.status === 'pending'))
      setError(null)
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to load payment deadlines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const updateClock = () => {
      setNowMs(Date.now())
    }

    const firstTickId = window.setTimeout(updateClock, 0)
    const intervalId = window.setInterval(updateClock, 60_000)

    return () => {
      window.clearTimeout(firstTickId)
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadPayments()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [loadPayments])

  const completePayment = async (uuid: string) => {
    setCompletingUuid(uuid)
    setError(null)
    setMessage(null)

    try {
      await api.post(`/payments/${uuid}/complete`)
      setMessage('Payment completed successfully. The funds are now marked as held in escrow.')
      await loadPayments()
    } catch (err) {
      setError((err as { message?: string }).message || 'Payment could not be completed')
      await loadPayments()
    } finally {
      setCompletingUuid(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3" style={{ background: '#FFFFFF', border: `1px solid ${C.beige}`, color: C.emerald }}>
              <TimerReset className="w-3.5 h-3.5" /> FR14 Payment Deadline
            </div>
            <h1 className="text-3xl font-black" style={{ color: C.slate }}>Payment Deadlines</h1>
            <p className="mt-2" style={{ color: C.muted }}>
              Complete payment before the deadline. Missed payments are automatically reassigned to the next valid bidder.
            </p>
          </div>

          <button
            type="button"
            onClick={loadPayments}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={{ background: '#FFFFFF', border: `1px solid ${C.beige}`, color: C.slate }}
          >
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

        {error && <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.dangerLight, color: C.danger, border: `1px solid ${C.dangerBorder}` }}>{error}</div>}
        {message && <div className="mb-4 rounded-xl p-3 text-sm font-bold" style={{ background: C.emeraldLight, color: C.emerald, border: '1px solid rgba(4,120,87,0.20)' }}>{message}</div>}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center" style={{ border: `1px solid ${C.beige}` }}>
            <div className="w-10 h-10 mx-auto rounded-full border-4 animate-spin" style={{ borderColor: C.emerald, borderTopColor: 'transparent' }} />
            <p className="mt-4 text-sm font-medium" style={{ color: C.muted }}>Loading payment deadlines…</p>
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
              <PaymentCard key={payment.uuid} payment={payment} onComplete={completePayment} completing={completingUuid === payment.uuid} nowMs={nowMs} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}