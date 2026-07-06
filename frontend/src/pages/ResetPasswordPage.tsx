import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Gavel } from 'lucide-react'
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

function pwdStrength(p: string) {
  if (!p) return { score: 0, label: '', color: '' }
  if (p.length < 8) return { score: 1, label: 'Too short', color: C.danger }
  if (p.length < 12) return { score: 2, label: 'Acceptable', color: '#D97706' }
  if (p.length < 16) return { score: 3, label: 'Good', color: C.emerald }
  return { score: 4, label: 'Strong', color: '#065f46' }
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefillEmail = (location.state as { email?: string })?.email ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)

  const strength = pwdStrength(password)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const errs: Record<string, string> = {}
    if (!email.trim()) errs.email = 'Email is required.'
    if (!/^\d{6}$/.test(otp)) errs.otp = 'Enter the 6-digit code from your email.'
    if (!password) errs.password = 'Password is required.'
    if (password && confirm !== password) errs.confirm = 'Passwords do not match.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { email: email.trim(), token: otp, password })
      setDone(true)
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setFieldErrors(ae.errors as Record<string, string>)
      else setError(ae.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex" style={{ background: C.linen }}>

      {/* ── Left panel ── */}
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
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">Set a new password</h2>
          <p className="text-base leading-relaxed" style={{ color: '#9DB5B5' }}>
            Enter the 6-digit code sent to your email and choose a strong new password.
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

          {done ? (
            <div>
              <div className="flex items-center gap-3 mb-6 rounded-xl px-4 py-3"
                style={{ background: C.emeraldLight, border: '1px solid rgba(4,120,87,0.20)' }}>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: C.emerald }} />
                <p className="text-sm font-medium" style={{ color: C.emerald }}>
                  Password reset successfully. You can now log in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: C.emerald }}
                onMouseEnter={e => (e.currentTarget.style.background = C.emeraldDark)}
                onMouseLeave={e => (e.currentTarget.style.background = C.emerald)}
              >
                Go to login
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: C.slate }}>Set new password</h1>
              <p className="text-sm mb-8" style={{ color: C.muted }}>
                Enter the code from the backend console and your new password.
              </p>

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
                  <p className="text-sm font-medium" style={{ color: C.danger }}>{error}</p>
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Email address</label>
                  <input type="email" autoComplete="email" value={email}
                    onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })) }}
                    placeholder="you@example.com" style={inputCls(!!fieldErrors.email)}
                    onFocus={e => (e.target.style.borderColor = C.emerald)}
                    onBlur={e => (e.target.style.borderColor = fieldErrors.email ? C.danger : C.beige)} />
                  {fieldErrors.email && <p className="text-xs mt-1" style={{ color: C.danger }}>{fieldErrors.email}</p>}
                </div>

                {/* OTP */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>6-digit reset code</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setFieldErrors(p => ({ ...p, otp: '' })) }}
                    placeholder="123456" style={inputCls(!!fieldErrors.otp)}
                    onFocus={e => (e.target.style.borderColor = C.emerald)}
                    onBlur={e => (e.target.style.borderColor = fieldErrors.otp ? C.danger : C.beige)} />
                  {fieldErrors.otp && <p className="text-xs mt-1" style={{ color: C.danger }}>{fieldErrors.otp}</p>}
                </div>

                {/* New password */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>New password</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} autoComplete="new-password" value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })) }}
                      placeholder="Choose a strong password"
                      style={{ ...inputCls(!!fieldErrors.password), paddingRight: '42px' }}
                      onFocus={e => (e.target.style.borderColor = C.emerald)}
                      onBlur={e => (e.target.style.borderColor = fieldErrors.password ? C.danger : C.beige)} />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(n => (
                          <div key={n} className="flex-1 h-1 rounded-full transition-all"
                            style={{ background: strength.score >= n ? strength.color : C.beige }} />
                        ))}
                      </div>
                      <p className="text-xs" style={{ color: strength.color }}>{strength.label}</p>
                    </div>
                  )}
                  {fieldErrors.password && <p className="text-xs mt-1" style={{ color: C.danger }}>{fieldErrors.password}</p>}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Confirm new password</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                      onChange={e => { setConfirm(e.target.value); setFieldErrors(p => ({ ...p, confirm: '' })) }}
                      placeholder="Repeat your password"
                      style={{ ...inputCls(!!fieldErrors.confirm), paddingRight: '42px' }}
                      onFocus={e => (e.target.style.borderColor = C.emerald)}
                      onBlur={e => (e.target.style.borderColor = fieldErrors.confirm ? C.danger : C.beige)} />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirm && <p className="text-xs mt-1" style={{ color: C.danger }}>{fieldErrors.confirm}</p>}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 mt-2 transition-all"
                  style={{ background: loading ? '#6ba88e' : C.emerald, cursor: loading ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = C.emeraldDark) }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget.style.background = C.emerald) }}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Resetting…</> : 'Reset password'}
                </button>
              </form>

              <p className="text-sm text-center mt-6" style={{ color: C.muted }}>
                Didn't get a code?{' '}
                <Link to="/forgot-password" className="font-semibold" style={{ color: C.emerald }}>Send again</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
