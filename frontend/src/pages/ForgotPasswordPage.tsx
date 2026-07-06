import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, Gavel } from 'lucide-react'
import api from '../services/api'
import type { ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#035c43',
  emeraldLight: '#ECFDF5', beige: '#BBB09B', linen: '#F7F5F0',
  muted: '#5C6E6E', danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

function inputCls(hasErr: boolean) {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasErr ? C.danger : C.beige}`,
    background: '#fff', color: C.slate, fontSize: '14px', outline: 'none',
  } as React.CSSProperties
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError((err as ApiError).message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex" style={{ background: C.linen }}>

      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden" style={{ background: C.slate }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle,white 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10"
          style={{ background: C.emerald, transform: 'translate(35%,-35%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.emerald }}>
              <Gavel className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-lg">BidForGood</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            Forgot your password?
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#9DB5B5' }}>
            Enter your email address and we'll send a one-time code to reset your password.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.emerald }}>
              <Gavel className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold" style={{ color: C.slate }}>BidForGood</span>
          </div>

          {sent ? (
            <div>
              <div className="flex items-center gap-3 mb-4 rounded-xl px-4 py-3"
                style={{ background: C.emeraldLight, border: '1px solid rgba(4,120,87,0.20)' }}>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: C.emerald }} />
                <p className="text-sm font-medium" style={{ color: C.emerald }}>
                  A reset code has been sent. Check the backend console for the code.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/reset-password', { state: { email: email.trim() } })}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-2 transition-all"
                style={{ background: C.emerald }}
                onMouseEnter={e => (e.currentTarget.style.background = C.emeraldDark)}
                onMouseLeave={e => (e.currentTarget.style.background = C.emerald)}
              >
                Enter reset code →
              </button>
              <p className="text-sm text-center mt-4" style={{ color: C.muted }}>
                <Link to="/login" style={{ color: C.emerald }} className="font-medium">Back to login</Link>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.slate }}>Reset your password</h1>
              <p className="text-sm mb-8" style={{ color: C.muted }}>
                We'll send a 6-digit code to your email address.
              </p>

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
                  <p className="text-sm font-medium" style={{ color: C.danger }}>{error}</p>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Email address</label>
                  <input type="email" autoComplete="email" value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    placeholder="you@example.com" style={inputCls(!!error)}
                    onFocus={e => (e.target.style.borderColor = C.emerald)}
                    onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 mt-2 transition-all"
                  style={{ background: loading ? '#6ba88e' : C.emerald, cursor: loading ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = C.emeraldDark) }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget.style.background = C.emerald) }}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : 'Send reset code'}
                </button>
              </form>

              <p className="text-sm text-center mt-6" style={{ color: C.muted }}>
                Remember your password?{' '}
                <Link to="/login" className="font-semibold" style={{ color: C.emerald }}>Log in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
