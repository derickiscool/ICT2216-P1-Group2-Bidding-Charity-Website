import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, Gavel } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
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

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, requestLoginOtp, verifyLoginOtp, isLoading } = useAuthStore()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Passwordless login state
  const [method, setMethod]     = useState<'password' | 'otp'>('password')
  const [step, setStep]         = useState<'request' | 'verify'>('request')
  const [otp, setOtp]           = useState('')
  const [infoMsg, setInfoMsg]   = useState<string | null>(null)

  const from = (location.state as { from?: string })?.from || '/dashboard'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setInfoMsg(null)
    if (method === 'password') {
      if (!email.trim() || !password) { setError('Please fill in all fields.'); return }
      try { await login(email.trim(), password); navigate(from, { replace: true }) }
      catch (err) { const ae = err as ApiError; setAttempts(n => n + 1); setError(ae.message || 'Invalid email or password.') }
    } else {
      if (step === 'request') {
        if (!email.trim()) { setError('Please enter your email address.'); return }
        try {
          const msg = await requestLoginOtp(email.trim())
          setInfoMsg(msg || 'A login verification OTP has been sent.')
          setStep('verify')
        } catch (err) {
          const ae = err as ApiError
          setError(ae.message || 'Failed to request login code.')
        }
      } else {
        if (!otp.trim()) { setError('Please enter the 6-digit OTP.'); return }
        if (!/^\d{6}$/.test(otp.trim())) { setError('Enter a valid 6-digit OTP.'); return }
        try {
          await verifyLoginOtp(email.trim(), otp.trim())
          navigate(from, { replace: true })
        } catch (err) {
          const ae = err as ApiError
          setError(ae.message || 'Invalid or expired OTP.')
        }
      }
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
            Bid on great items.<br />Support great causes.
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#9DB5B5' }}>
            Every bid you place supports verified charities making a real impact in the world.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-3">
          {[['124', 'Active Auctions'], ['43', 'Verified Charities'], ['$2.4M', 'Total Raised'], ['892', 'Bidders Online']].map(([v, l]) => (
            <div key={l} className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xl font-bold text-white">{v}</p>
              <p className="text-xs mt-0.5" style={{ color: C.beige }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.emerald }}>
              <Gavel className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold" style={{ color: C.slate }}>BidForGood</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: C.slate }}>Welcome back</h1>
          <p className="text-sm mb-8" style={{ color: C.muted }}>Log in to continue bidding for good</p>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
              <div>
                <p className="text-sm font-medium" style={{ color: C.danger }}>{error}</p>
                {method === 'password' && attempts >= 3 && (
                  <p className="text-xs mt-0.5" style={{ color: '#ef4444' }}>
                    {Math.max(0, 5 - attempts)} attempts remaining before lockout.
                  </p>
                )}
              </div>
            </div>
          )}

          {infoMsg && (
            <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: C.emeraldLight, border: '1px solid rgba(4,120,87,0.2)' }}>
              <div>
                <p className="text-sm font-medium text-emerald-800" style={{ color: C.emerald }}>{infoMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {/* Email - Show unless we are in verify step */}
            {!(method === 'otp' && step === 'verify') && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Email address</label>
                <input type="email" autoComplete="email" value={email}
                  disabled={isLoading}
                  onChange={e => { setEmail(e.target.value); setError(null) }}
                  placeholder="you@example.com" style={inputCls(!!error)}
                  onFocus={e => (e.target.style.borderColor = C.emerald)}
                  onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
              </div>
            )}

            {/* Password - Only for Password Login */}
            {method === 'password' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: C.slate }}>Password</label>
                  <Link to="/forgot-password" className="text-xs font-medium" style={{ color: C.emerald }}>Forgot password?</Link>
                </div>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                    disabled={isLoading}
                    value={password} onChange={e => { setPassword(e.target.value); setError(null) }}
                    placeholder="Enter your password"
                    style={{ ...inputCls(!!error), paddingRight: '42px' }}
                    onFocus={e => (e.target.style.borderColor = C.emerald)}
                    onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* OTP - Only for OTP login during verification step */}
            {method === 'otp' && step === 'verify' && (
              <div className="space-y-4">
                <div className="text-sm rounded-xl p-3 border" style={{ background: C.linen, borderColor: C.beige }}>
                  <p className="font-semibold" style={{ color: C.slate }}>OTP Code Sent</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    We sent a 6-digit OTP code to <span className="font-medium">{email}</span>.
                    Please check your email for the code.
                  </p>
                  <button type="button" onClick={() => { setStep('request'); setError(null); setInfoMsg(null); setOtp('') }}
                    className="text-xs font-semibold underline mt-2" style={{ color: C.emerald }}>
                    Change email or resend code
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Verification Code (OTP)</label>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={otp} disabled={isLoading}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
                    placeholder="000000" style={inputCls(!!error)}
                    onFocus={e => (e.target.style.borderColor = C.emerald)}
                    onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
                </div>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 mt-2 transition-all"
              style={{ background: isLoading ? '#6ba88e' : C.emerald, cursor: isLoading ? 'not-allowed' : 'pointer' }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget.style.background = C.emeraldDark) }}
              onMouseLeave={e => { if (!isLoading) (e.currentTarget.style.background = C.emerald) }}>
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
              ) : method === 'password' ? (
                'Log In'
              ) : step === 'request' ? (
                'Send Verification OTP'
              ) : (
                'Verify & Log In'
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: C.beige }} />
            <span className="text-xs" style={{ color: C.beige }}>or</span>
            <div className="flex-1 h-px" style={{ background: C.beige }} />
          </div>

          <button type="button" onClick={() => {
            setMethod(m => m === 'password' ? 'otp' : 'password')
            setStep('request')
            setError(null)
            setInfoMsg(null)
            setOtp('')
          }}
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 mb-6 transition-all"
            style={{ borderColor: C.beige, color: C.slate, background: 'transparent', cursor: isLoading ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (!isLoading) (e.currentTarget.style.background = C.linen) }}
            onMouseLeave={e => { if (!isLoading) (e.currentTarget.style.background = 'transparent') }}>
            {method === 'password' ? 'Sign In with Email OTP' : 'Sign In with Password'}
          </button>

          <div className="space-y-2 text-sm text-center" style={{ color: C.muted }}>
            <p>
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold" style={{ color: C.emerald }}>Create one free</Link>
            </p>
            <p>
              Registering a charity?{' '}
              <Link to="/register/charity" className="font-semibold" style={{ color: '#895B1E' }}>Apply here →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
