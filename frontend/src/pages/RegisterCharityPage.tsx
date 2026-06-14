// File: frontend/src/pages/RegisterCharityPage.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, Building2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { ApiError } from '../types'

// Claude's Updated Palette
const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldDark: '#035c43',
  emeraldLight: '#ECFDF5', beige: '#BBB09B', linen: '#F7F5F0',
  white: '#FFFFFF', muted: '#5C6E6E',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

function inputSt(hasErr: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`,
    background: C.white, color: C.slate, fontSize: '14px', outline: 'none',
    ...extra,
  }
}

export default function RegisterCharityPage() {
  const navigate = useNavigate()
  const { register, isLoading } = useAuthStore()

  const [form, setForm] = useState({ 
    org_name: '', reg_number: '', 
    full_name: '', email: '', username: '', password: '' 
  })
  const [showPwd, setShowPwd] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.org_name.trim()) e.org_name = 'Organization name is required.'
    if (!form.reg_number.trim()) e.reg_number = 'Registration number is required.'
    if (!form.full_name.trim()) e.full_name = 'Representative name is required.'
    if (!form.email.trim()) e.email = 'Email is required.'
    if (!form.username.trim()) e.username = 'Username is required.'
    if (form.password.length < 8) e.password = 'Min 8 characters required.'
    
    setErrors(e); return Object.keys(e).length === 0
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setGlobalErr(null)
    if (!validate()) return
    try {
      // Registering with the specific 'charity_staff' role
      await register({ 
        full_name: form.full_name, email: form.email, 
        username: form.username, password: form.password, 
        roles: ['charity_staff'] 
      })
      // NOTE: Once backend is ready, you'll also want to hit a /charities endpoint here 
      // to save the org_name and reg_number.
      setSuccess(true)
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrors(ae.errors);
      else setGlobalErr(ae.message || 'Application failed. Please try again.')
    }
  }

  if (success) return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-md text-center rounded-2xl px-8 py-12 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: C.emeraldLight }}>
          <ShieldCheck className="w-7 h-7" style={{ color: C.emerald }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>Application Submitted</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: C.muted }}>
          Thank you for registering <span className="font-semibold text-slate-800">{form.org_name}</span>. 
          Our admin team will verify your registration details. We have sent a confirmation link to <span className="font-medium text-slate-800">{form.email}</span>.
        </p>
        <Link to="/" className="block w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: C.emerald }}>
          Return to Home
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-start justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: C.emerald }}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: C.slate }}>Register a Charity</h1>
          <p className="text-sm" style={{ color: C.muted }}>Apply to host auctions and raise funds for your cause.</p>
        </div>

        <div className="rounded-2xl px-8 py-8 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
          {globalErr && (
            <div className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: C.dangerLight, border: `1px solid ${C.dangerBorder}` }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} />
              <p className="text-sm font-medium" style={{ color: C.danger }}>{globalErr}</p>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="space-y-6">
            {/* Organization Details Section */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2" style={{ color: C.slate, borderColor: C.beige }}>Organization Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Organization Name</label>
                  <input type="text" value={form.org_name} onChange={set('org_name')} style={inputSt(!!errors.org_name)} />
                  {errors.org_name && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.org_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Registration / UEN No.</label>
                  <input type="text" value={form.reg_number} onChange={set('reg_number')} style={inputSt(!!errors.reg_number)} />
                  {errors.reg_number && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.reg_number}</p>}
                </div>
              </div>
            </div>

            {/* Representative Details Section */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2" style={{ color: C.slate, borderColor: C.beige }}>Representative Account</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Full Name</label>
                  <input type="text" value={form.full_name} onChange={set('full_name')} style={inputSt(!!errors.full_name)} />
                  {errors.full_name && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.full_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Work Email</label>
                  <input type="email" value={form.email} onChange={set('email')} style={inputSt(!!errors.email)} />
                  {errors.email && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Username</label>
                  <input type="text" value={form.username} onChange={set('username')} style={inputSt(!!errors.username)} />
                  {errors.username && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.username}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Password</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')} style={inputSt(!!errors.password, { paddingRight: '42px' })} />
                    <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.password}</p>}
                </div>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all mt-4" style={{ background: isLoading ? '#6ba88e' : C.emerald, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : 'Submit Application'}
            </button>
          </form>
          
          <p className="text-center text-sm mt-6" style={{ color: C.muted }}>
            Are you a bidder or donor? <Link to="/register" className="font-semibold" style={{ color: C.emerald }}>Register here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}