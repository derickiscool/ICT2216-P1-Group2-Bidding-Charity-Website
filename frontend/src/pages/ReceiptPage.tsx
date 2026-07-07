import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Loader2, AlertCircle, Printer } from 'lucide-react'
import api from '../services/api'
import type { Receipt, ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  danger: '#B91C1C',
}

export default function ReceiptPage() {
  const { uuid } = useParams()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<Receipt>(`/receipts/${uuid}`)
        setReceipt(res.data)
      } catch (err) {
        setError((err as ApiError).message || 'Receipt not found.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [uuid])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.emerald }} />
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.linen }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.danger }} />
          <p className="text-lg font-bold mb-2" style={{ color: C.slate }}>Receipt Not Found</p>
          <p className="text-sm mb-6" style={{ color: C.muted }}>{error}</p>
          <Link to="/dashboard" className="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.emerald }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: C.linen }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-6" style={{ color: C.emerald }}>
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        {/* Receipt card — this is what gets printed */}
        <div id="receipt-content" className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid', borderColor: C.beige }}>
          {/* Header */}
          <div className="px-8 py-6" style={{ background: C.emerald }}>
            <div className="flex items-center gap-3 mb-1">
              <CheckCircle className="w-6 h-6 text-white" />
              <h1 className="text-xl font-bold text-white">Donation Receipt</h1>
            </div>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Receipt #{receipt.receipt_ref}</p>
          </div>

          <div className="p-8 space-y-6">
            {/* Charity & Amount */}
            <div className="flex items-center justify-between pb-6 border-b" style={{ borderColor: C.beige }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Beneficiary</p>
                <p className="text-lg font-bold" style={{ color: C.slate }}>{receipt.charity_name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Amount</p>
                <p className="text-3xl font-black" style={{ color: C.emerald }}>${receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Item details */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>Item</p>
              <p className="text-base font-semibold" style={{ color: C.slate }}>{receipt.item_title}</p>
            </div>

            {/* Receipt details */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: C.beige }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Receipt Reference</p>
                <p className="text-sm font-mono" style={{ color: C.slate }}>{receipt.receipt_ref}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Date Issued</p>
                <p className="text-sm" style={{ color: C.slate }}>{new Date(receipt.generated_at).toLocaleString('en-SG', { dateStyle: 'long', timeStyle: 'short' })}</p>
              </div>
            </div>

            {/* Integrity hash */}
            <div className="pt-4 border-t" style={{ borderColor: C.beige }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Integrity Hash (SHA-256)</p>
              <p className="text-[10px] font-mono break-all" style={{ color: C.muted }}>{receipt.integrity_hash}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: C.slate }}
          >
            <Printer className="w-4 h-4" /> Download PDF / Print
          </button>
        </div>
      </div>
    </div>
  )
}
