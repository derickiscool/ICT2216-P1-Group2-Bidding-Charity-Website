import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import type { ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5', beige: '#BBB09B',
  linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E', danger: '#B91C1C',
  dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

interface ForceChangeResponse {
  message: string
}

function inputSt(hasErr: boolean): CSSProperties {
  return {
    width: '100%', padding: '11px 44px 11px 14px', borderRadius: '12px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`,
    background: C.white, color: C.slate, fontSize: '14px', outline: 'none',
  }
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, fetchMe, logout } = useAuthStore()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (user && !user.mustChangePassword) navigate('/dashboard', { replace: true })
  }, [navigate, user])

  function validate() {
    const e: Record<string, string> = {}
    if (!currentPassword) e.currentPassword = 'Current temporary password is required.'
    if (!newPassword) e.newPassword = 'New password is required.'
    else if (newPassword.length < 8 || newPassword.length > 128) e.newPassword = 'Password must be 8-128 characters.'
    else if (newPassword === currentPassword) e.newPassword = 'New password must be different from the temporary password.'
    if (!confirmPassword) e.confirmPassword = 'Confirm your new password.'
    else if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match.'
    return e
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const eMap = validate()
    setErrors(eMap)
    if (Object.keys(eMap).length > 0) return

    setSaving(true)
    try {
      const res = await api.post<ForceChangeResponse>('/auth/force-change-password', { currentPassword, newPassword })
      setMessage({ type: 'success', text: res.data.message })
      await fetchMe()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.errors) setErrors(apiErr.errors)
      setMessage({ type: 'error', text: apiErr.message || 'Failed to change password.' })
    } finally {
      setSaving(false)
    }
  }

  async function logoutNow() {
    setLeaving(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12" style={{ background: C.linen }}>
      <section className="w-full max-w-md rounded-2xl shadow-sm" style={{ background: C.white, border: `1px solid ${C.beige}` }}>
        <div className="px-8 pt-8 pb-6 text-center border-b" style={{ borderColor: C.beige }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: C.emeraldLight }}>
            <ShieldCheck className="w-7 h-7" style={{ color: C.emerald }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: C.slate }}>Change temporary password</h1>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: C.muted }}>
            This staff account was created with a temporary password. Set your own password before continuing.
          </p>
        </div>

        <form onSubmit={submit} noValidate className="px-8 py-7 space-y-5">
          {message && <Alert type={message.type} text={message.text} />}

          <PasswordInput
            label="Current temporary password"
            value={currentPassword}
            visible={showCurrent}
            error={errors.currentPassword}
            onToggle={() => setShowCurrent(v => !v)}
            onChange={(value) => { setCurrentPassword(value); setErrors(prev => ({ ...prev, currentPassword: '' })) }}
          />
          <PasswordInput
            label="New password"
            value={newPassword}
            visible={showNew}
            error={errors.newPassword}
            note="Use at least 8 characters. Avoid common or breached passwords. Password123 still belongs in the museum."
            onToggle={() => setShowNew(v => !v)}
            onChange={(value) => { setNewPassword(value); setErrors(prev => ({ ...prev, newPassword: '' })) }}
          />
          <PasswordInput
            label="Confirm new password"
            value={confirmPassword}
            visible={showConfirm}
            error={errors.confirmPassword}
            onToggle={() => setShowConfirm(v => !v)}
            onChange={(value) => { setConfirmPassword(value); setErrors(prev => ({ ...prev, confirmPassword: '' })) }}
          />

          <button type="submit" disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ background: saving ? '#6ba88e' : C.emerald, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Changing password...</> : <><KeyRound className="w-4 h-4" />Change password</>}
          </button>

          <button type="button" onClick={logoutNow} disabled={saving || leaving} className="w-full py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2" style={{ borderColor: C.beige, color: C.slate, cursor: saving || leaving ? 'not-allowed' : 'pointer' }}>
            {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Log out instead
          </button>
        </form>
      </section>
    </div>
  )
}

function PasswordInput(props: {
  label: string
  value: string
  visible: boolean
  error?: string
  note?: string
  onToggle: () => void
  onChange: (value: string) => void
}) {
  const { label, value, visible, error, note, onToggle, onChange } = props
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="relative">
        <input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" style={inputSt(!!error)} />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
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