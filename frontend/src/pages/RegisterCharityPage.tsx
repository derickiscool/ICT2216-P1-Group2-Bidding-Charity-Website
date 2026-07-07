// File: frontend/src/pages/RegisterCharityPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, Building2, ShieldCheck, UploadCloud, FileText, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
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
  const { register, verifyRegistration, login, isLoading } = useAuthStore()

  const [form, setForm] = useState({ 
    org_name: '', description: '', 
    full_name: '', email: '', password: '' 
  })
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalErr, setGlobalErr] = useState<string | null>(null)
  
  // Navigation steps: 'form' -> 'otp' -> 'complete'
  const [step, setStep] = useState<'form' | 'otp' | 'complete'>('form')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [f]: e.target.value }))
    setErrors(prev => ({ ...prev, [f]: '' }))
  }

  // File Upload Handlers
  const handleFileSelect = (selectedFile: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(selectedFile.type)) {
      setErrors(prev => ({ ...prev, file: 'Only PDF, JPG, and PNG files are allowed.' }))
      return
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, file: 'File size must be under 5MB.' }))
      return
    }
    setErrors(prev => ({ ...prev, file: '' }))
    setFile(selectedFile)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.org_name.trim()) e.org_name = 'Organization name is required.'
    else if (form.org_name.length < 2) e.org_name = 'Must be at least 2 characters.'
    
    if (!form.description.trim()) e.description = 'Description is required.'
    else if (form.description.length < 10) e.description = 'Description must be at least 10 characters.'
    
    if (!file) e.file = 'Supporting document is required.'
    
    if (!form.full_name.trim()) e.full_name = 'Representative name is required.'
    if (!form.email.trim()) e.email = 'Email is required.'
    if (form.password.length < 8) e.password = 'Min 8 characters required.'
    
    setErrors(e); return Object.keys(e).length === 0
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setGlobalErr(null); setNotice(null)
    if (!validate()) return
    
    try {
      // 1. Create User Account
      const message = await register({ 
        full_name: form.full_name, 
        email: form.email, 
        password: form.password, 
        roles: ['charity'] // Must match backend required roles for /charities/register
      })
      
      setNotice(message)
      setStep('otp') // Move to OTP verification step
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrors(ae.errors);
      else setGlobalErr(ae.message || 'Registration failed. Please try again.')
    }
  }

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setGlobalErr(null)
    if (!/^\d{6}$/.test(otp.trim())) {
      setGlobalErr('Enter the 6-digit verification OTP.')
      return
    }
    
    setIsSubmitting(true)
    try {
      // 2. Verify OTP
      await verifyRegistration(form.email, otp.trim())
      
      // 3. Log in automatically to get session and CSRF token
      await login(form.email, form.password)
      
      // 4. Submit Charity Application to the authenticated /charities/register endpoint
      const formData = new FormData()
      formData.append('organisationName', form.org_name)
      formData.append('description', form.description)
      if (file) formData.append('supportingDocument', file)

      await api.post('/charities/register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setStep('complete')
    } catch (err) {
      const ae = err as ApiError
      setGlobalErr(ae.message || 'Charity application failed during submission. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'complete') return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-md text-center rounded-2xl px-8 py-12 shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: C.emeraldLight }}>
          <ShieldCheck className="w-7 h-7" style={{ color: C.emerald }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: C.slate }}>Application Submitted</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: C.muted }}>
          Thank you for registering <span className="font-semibold text-slate-800">{form.org_name}</span>. 
          Our admin team will review your supporting documents and verify your registration details.
        </p>
        <Link to="/" className="block w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: C.emerald }}>
          Return to Home
        </Link>
      </div>
    </div>
  )

  if (step === 'otp') return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <div className="w-full max-w-sm bg-white rounded-2xl px-8 py-10 shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: C.emeraldLight }}>
          <ShieldCheck className="w-7 h-7" style={{ color: C.emerald }} />
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
          <button type="submit" disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
            style={{ background: isSubmitting ? '#6ba88e' : C.emerald, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting Application...</> : 'Verify & Submit'}
          </button>
        </form>
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
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Organization Name</label>
                  <input type="text" value={form.org_name} onChange={set('org_name')} style={inputSt(!!errors.org_name)} />
                  {errors.org_name && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.org_name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Description (Min 10 chars)</label>
                  <textarea rows={3} value={form.description} onChange={set('description')} style={inputSt(!!errors.description, { resize: 'none' })} />
                  {errors.description && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.description}</p>}
                </div>

                {/* Drag and Drop File Upload Area */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Supporting Document (PDF, JPG, PNG)</label>
                  <div 
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${isDragging ? 'border-emerald-500 bg-emerald-50' : errors.file ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-emerald-400 bg-gray-50'}`}
                  >
                    <input 
                      type="file" 
                      accept="application/pdf,image/jpeg,image/png"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileSelect(e.target.files[0])
                        }
                      }}
                    />
                    
                    {!file ? (
                      <div className="flex flex-col items-center pointer-events-none">
                        <UploadCloud className="w-10 h-10 mb-3" style={{ color: C.muted }} />
                        <p className="text-sm font-semibold mb-1" style={{ color: C.slate }}>Click or drag file to upload</p>
                        <p className="text-xs" style={{ color: C.muted }}>Max file size 5MB</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-white pointer-events-none z-10 relative">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                          <div className="text-left overflow-hidden">
                            <p className="text-sm font-semibold truncate text-slate-800">{file.name}</p>
                            <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); }}
                          className="p-1.5 rounded-full hover:bg-gray-100 pointer-events-auto"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.file && <p className="text-xs mt-1" style={{ color: C.danger }}>{errors.file}</p>}
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
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Starting Application...</> : 'Continue to Verification'}
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
