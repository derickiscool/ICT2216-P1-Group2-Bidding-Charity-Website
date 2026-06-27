import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Info, Building2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { ApiError, UserRole } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#035c43',
  emeraldLight: '#ECFDF5', beige: '#BBB09B', linen: '#F7F5F0',
  muted: '#5C6E6E', mauve: '#A675A1', mauveLight: '#F5EFF5',
  bronze: '#895B1E', bronzeLight: '#FDF5EC',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

function pwdStrength(p: string) {
  if (!p) return { score: 0, label: '', color: '' }
  if (p.length < 8) return { score: 1, label: 'Too short', color: '#B91C1C' }
  if (p.length < 12) return { score: 2, label: 'Acceptable length', color: '#D97706' }
  if (p.length < 16) return { score: 3, label: 'Good length', color: C.emerald }
  return { score: 4, label: 'Strong length', color: '#065f46' }
}

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasErr ? C.danger : C.beige}`,
    background: '#fff', color: C.slate, fontSize: '14px', outline: 'none',
    ...extra,
  }
}

function RoleCard({ label, desc, selected, onToggle }: { label: string; desc: string; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="flex-1 text-left p-4 rounded-xl border-2 transition-all"
      style={{ borderColor: selected ? C.emerald : C.beige, background: selected ? C.emeraldLight : '#fff' }}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
          style={{ borderColor: selected ? C.emerald : C.beige, background: selected ? C.emerald : 'transparent' }}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: selected ? C.emerald : C.slate }}>{label}</p>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: C.muted }}>{desc}</p>
        </div>
      </div>
    </button>
  )
}

export default function RegisterPage() {
  const { register, verifyRegistration, isLoading } = useAuthStore()

  const [form, setForm] = useState({ full_name: '', email: '', username: '', password: '', confirm: '' })
  const [roles, setRoles] = useState<UserRole[]>(['bidder'])
  const [showPwd, setShowPwd] = useState(false)
  const [showCfm, setShowCfm] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'form' | 'otp' | 'complete'>('form')

  const strength = pwdStrength(form.password)

  const set = (f: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  const toggleRole = (r: UserRole) =>
    setRoles(prev => prev.includes(r) ? (prev.length > 1 ? prev.filter(x => x !== r) : prev) : [...prev, r])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.full_name.trim()) e.full_name = 'Full name is required.'
    if (!form.email.trim()) e.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address.'
    if (!form.username.trim()) e.username = 'Username is required.'
    else if (form.username.length < 3) e.username = 'At least 3 characters.'
    else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) e.username = 'Letters, numbers, and underscores only.'
    if (!form.password) e.password = 'Password is required.'
    else if (form.password.length < 8 || form.password.length > 128) e.password = 'Password must be 8-128 characters.'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.'
    if (!agreed) e.agreed = 'You must agree to the terms.'
    setErrors(e); return Object.keys(e).length === 0
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setGlobalErr(null); setNotice(null)
    if (!validate()) return
    try {
      const message = await register({ full_name: form.full_name, email: form.email, username: form.username, password: form.password, roles })
      setNotice(message)
      setStep('otp')
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrors(ae.errors); else setGlobalErr(ae.message || 'Registration failed. Please try again.')
    }
  }

  const onVerifyOtp = async (e: FormEvent) => {
    e.preventDefault(); setGlobalErr(null)
    if (!/^\d{6}$/.test(otp.trim())) {
      setGlobalErr('Enter the 6-digit verification OTP.')
      return
    }
    try {
      await verifyRegistration(form.email, otp.trim())
      setStep('complete')
    } catch (err) {
      const ae = err as ApiError
      setGlobalErr(ae.message || 'Registration verification failed. Please try again.')
    }
  }

  if (step === 'complete') return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-sm text-center bg-white rounded-2xl px-8 py-12 shadow-sm"
        style={{ border: `1px solid ${C.beige}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: C.emeraldLight }}>
          <CheckCircle2 className="w-7 h-7" style={{ color: C.emerald }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>Account verified</h2>
        <p className="text-sm mb-8" style={{ color: C.muted }}>
          Your BidForGood account has been created. You can now log in with your email and password.
        </p>
        <Link to="/login"
          className="block w-full py-2.5 rounded-xl text-sm font-semibold text-white text-center"
          style={{ background: C.emerald }}>
          Go to Login
        </Link>
      </div>
    </div>
  )

  if (step === 'otp') return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-sm bg-white rounded-2xl px-8 py-10 shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: C.emeraldLight }}>
          <CheckCircle2 className="w-7 h-7" style={{ color: C.emerald }} />
        </div>
        <h2 className="text-xl font-bold text-center mb-2" style={{ color: C.slate }}>Verify your email</h2>
        <p className="text-sm text-center mb-2" style={{ color: C.muted }}>
          Enter the 6-digit OTP sent to <span className="font-medium" style={{ color: C.slate }}>{form.email}</span>.
        </p>
        <p className="text-xs text-center mb-6" style={{ color: C.beige }}>
          For local development, the OTP is printed in the backend console.
        </p>

        {notice && <div className="mb-4 rounded-xl px-4 py-3 text-xs" style={{ background: C.emeraldLight, color: '#065F46' }}>{notice}</div>}
        {globalErr && (
          <div className="mb-4 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
            <p className="text-sm font-medium" style={{ color: C.danger }}>{globalErr}</p>
          </div>
        )}

        <form onSubmit={onVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Verification OTP</label>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" style={inputSt(false)} />
          </div>
          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
            style={{ background: isLoading ? '#6ba88e' : C.emerald, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : 'Verify Account'}
          </button>
          <button type="button" className="w-full text-sm font-medium" style={{ color: C.muted }} onClick={() => setStep('form')}>
            Back to registration form
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-start justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: C.slate }}>Create your account</h1>
          <p className="text-sm" style={{ color: C.muted }}>Join BidForGood and start making a difference</p>
        </div>

        <Link to="/register/charity"
          className="flex items-center gap-3 p-4 rounded-xl mb-6 transition-opacity hover:opacity-90"
          style={{ background: C.bronzeLight, border: `1px solid #E8C99A` }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: C.bronze }}>
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.bronze }}>Registering a charity organisation?</p>
            <p className="text-xs mt-0.5" style={{ color: '#A07030' }}>Apply for charity account →</p>
          </div>
        </Link>

        <div className="bg-white rounded-2xl px-8 py-8 shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
          {globalErr && (
            <div className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
              <p className="text-sm font-medium" style={{ color: C.danger }}>{globalErr}</p>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Full name</label>
              <input type="text" autoComplete="name" value={form.full_name} onChange={set('full_name')}
                placeholder="Jordan Smith" style={inputSt(!!errors.full_name)} />
              {errors.full_name && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Email address</label>
              <input type="email" autoComplete="email" value={form.email} onChange={set('email')}
                placeholder="you@example.com" style={inputSt(!!errors.email)} />
              {errors.email && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Username</label>
              <input type="text" autoComplete="username" value={form.username} onChange={set('username')}
                placeholder="jordansmith" style={inputSt(!!errors.username)} />
              {errors.username && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.username}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Password</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                  value={form.password} onChange={set('password')}
                  placeholder="8-128 characters" style={inputSt(!!errors.password, { paddingRight: '42px' })} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-colors"
                        style={{ background: i <= strength.score ? strength.color : '#E5E7EB' }} />
                    ))}
                  </div>
                  <p className="text-xs font-medium" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
              {errors.password && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Confirm password</label>
              <div className="relative">
                <input type={showCfm ? 'text' : 'password'} autoComplete="new-password"
                  value={form.confirm} onChange={set('confirm')}
                  placeholder="Repeat your password" style={inputSt(!!errors.confirm, { paddingRight: '42px' })} />
                <button type="button" onClick={() => setShowCfm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                  {showCfm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirm && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.confirm}</p>}
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-sm font-medium" style={{ color: C.slate }}>I want to…</label>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: C.mauveLight, color: C.mauve }}>Both can be selected</span>
              </div>
              <div className="flex gap-3">
                <RoleCard label="Bid on items" desc="Browse and bid on charity auctions" selected={roles.includes('bidder')} onToggle={() => toggleRole('bidder')} />
                <RoleCard label="Donate items" desc="List items for charity auctions" selected={roles.includes('donor')} onToggle={() => toggleRole('donor')} />
              </div>
            </div>

            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all"
                  onClick={() => { setAgreed(v => !v); setErrors(prev => ({ ...prev, agreed: '' })) }}
                  style={{ borderColor: errors.agreed ? C.danger : (agreed ? C.emerald : C.beige), background: agreed ? C.emerald : '#fff' }}>
                  {agreed && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 8">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>}
                </div>
                <span className="text-sm leading-snug" style={{ color: C.muted }}>
                  I agree to the{' '}
                  <a href="#" className="font-medium" style={{ color: C.emerald }}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="font-medium" style={{ color: C.emerald }}>Privacy Policy</a>
                </span>
              </label>
              {errors.agreed && <p className="text-xs mt-1 ml-7" style={{ color: C.danger }}>{errors.agreed}</p>}
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all mt-2"
              style={{ background: isLoading ? '#6ba88e' : C.emerald, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account…</> : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: C.muted }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: C.emerald }}>Log in</Link>
          </p>

          <div className="mt-5 flex items-start gap-2.5 rounded-xl px-4 py-3"
            style={{ background: C.emeraldLight, border: `1px solid #A7F3D0` }}>
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />
            <p className="text-xs leading-snug" style={{ color: '#065F46' }}>
              Passwords must be 8-128 characters and must not appear in known breached-password lists. Account creation requires OTP verification.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
