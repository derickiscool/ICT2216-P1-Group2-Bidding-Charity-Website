import { useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5', beige: '#BBB09B',
  linen: '#F7F5F0', muted: '#5C6E6E', danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasErr ? C.danger : C.beige}`,
    background: '#fff', color: C.slate, fontSize: '14px', outline: 'none', ...extra,
  }
}

function passwordStrength(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (!password) return { label: '', score: 0, color: C.beige }
  if (score <= 1) return { label: 'Weak', score: 1, color: C.danger }
  if (score <= 2) return { label: 'Fair', score: 2, color: '#D97706' }
  if (score <= 3) return { label: 'Good', score: 3, color: C.emerald }
  return { label: 'Strong', score: 4, color: '#065F46' }
}

export default function ForceChangePasswordPage() {
  const { user, forceChangePassword } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const strength = useMemo(() => passwordStrength(form.newPassword), [form.newPassword])

  if (user && !user.mustChangePassword) return <Navigate to="/dashboard" replace />

  const update = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    setMessage(null)
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!form.currentPassword) next.currentPassword = 'Current temporary password is required.'
    if (!form.newPassword) next.newPassword = 'New password is required.'
    else if (form.newPassword.length < 8) next.newPassword = 'New password must be at least 8 characters.'
    else if (strength.score < 3) next.newPassword = 'Use a stronger password with uppercase, numbers, or symbols.'
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your new password.'
    else if (form.newPassword !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.'
    if (form.currentPassword && form.currentPassword === form.newPassword) next.newPassword = 'New password must be different from the temporary password.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      const text = await forceChangePassword(form.currentPassword, form.newPassword)
      setMessage({ type: 'success', text })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.errors) setErrors(apiErr.errors)
      setMessage({ type: 'error', text: apiErr.message || 'Unable to change password. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-10" style={{ background: C.linen }}>
      <section className="w-full max-w-lg bg-white rounded-2xl shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
        <div className="px-7 py-6 border-b flex items-start gap-4" style={{ borderColor: C.beige }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight, color: C.emerald }}>
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Change temporary password</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Your staff account was created with a temporary password. Set your own password before continuing.
            </p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="px-7 py-7 space-y-5">
          {message && <Alert type={message.type} text={message.text} />}

          <PasswordInput label="Current temporary password" value={form.currentPassword} error={errors.currentPassword} show={showCurrent} setShow={setShowCurrent} onChange={update('currentPassword')} autoComplete="current-password" />

          <div>
            <PasswordInput label="New password" value={form.newPassword} error={errors.newPassword} show={showNew} setShow={setShowNew} onChange={update('newPassword')} autoComplete="new-password" />
            {form.newPassword && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.linen }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${strength.score * 25}%`, background: strength.color }} />
                </div>
                <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label} password</p>
              </div>
            )}
          </div>

          <PasswordInput label="Confirm new password" value={form.confirmPassword} error={errors.confirmPassword} show={showConfirm} setShow={setShowConfirm} onChange={update('confirmPassword')} autoComplete="new-password" />

          <button type="submit" disabled={submitting}
            className="w-full px-5 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: submitting ? '#6ba88e' : C.emerald, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Changing…</> : <><KeyRound className="w-4 h-4" />Change password</>}
          </button>
        </form>
      </section>
    </div>
  )
}

function Alert({ type, text }: { type: 'success' | 'error'; text: string }) {
  const isError = type === 'error'
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: isError ? C.dangerLight : C.emeraldLight, border: `1px solid ${isError ? C.dangerBorder : '#A7F3D0'}` }}>
      {isError ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />}
      <p className="text-sm font-medium" style={{ color: isError ? C.danger : C.emerald }}>{text}</p>
    </div>
  )
}

function PasswordInput(props: {
  label: string
  value: string
  error?: string
  show: boolean
  setShow: (value: boolean) => void
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  autoComplete: string
}) {
  const { label, value, error, show, setShow, onChange, autoComplete } = props
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} style={inputSt(!!error, { paddingRight: '42px' })}
          onFocus={e => (e.target.style.borderColor = C.emerald)}
          onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}
