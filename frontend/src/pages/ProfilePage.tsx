import { useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, Phone, Save, ShieldCheck, UserCircle } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { ApiError, User } from '../types'

// Centralised colours used only by this page. This keeps inline styling consistent and avoids repeating hex codes everywhere.
const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5',
  beige: '#BBB09B', linen: '#F7F5F0', muted: '#5C6E6E',
  mauve: '#A675A1', mauveLight: '#F5EFF5',
  warning: '#92400E', warningLight: '#FFFBEB',
  danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type ProfileUser = User & { contactNumber?: string | null }
type ProfileForm = { full_name: string; username: string; email: string; contact_number: string }
type EditableProfileField = 'full_name' | 'username' | 'contact_number'
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string; verificationCode: string }
type PasswordField = keyof PasswordForm

const emptyPwd: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '', verificationCode: '' }

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasErr ? C.danger : C.beige}`,
    background: '#fff', color: C.slate, fontSize: '14px', outline: 'none', ...extra,
  }
}

function toForm(user: User | null): ProfileForm {
  const u = user as ProfileUser | null
  return {
    full_name: u?.full_name ?? '',
    username: u?.username ?? '',
    email: u?.email ?? '',
    contact_number: u?.contactNumber ?? '',
  }
}

function pwdStrength(p: string) {
  if (!p) return { score: 0, label: '', color: C.beige }

  let s = 0
  if (p.length >= 8) s++; if (p.length >= 12) s++
  if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++

  if (s <= 1) return { score: 1, label: 'Weak', color: C.danger }
  if (s <= 2) return { score: 2, label: 'Fair', color: '#D97706' }
  if (s <= 3) return { score: 3, label: 'Good', color: C.emerald }
  return { score: 4, label: 'Strong', color: '#065F46' }
}

function roleText(role: string) {
  switch (role) {
    case 'bidder': return 'Bidder'
    case 'donor': return 'Donor'
    case 'charity_staff': return 'Charity Staff'
    case 'charity_org':
    case 'charity_organisation':
    case 'charity': return 'Charity Organisation'
    case 'admin': return 'Admin'
    default: return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}

function errMsg(err: unknown, fallback: string) {
  const ae = err as ApiError
  const msg = ae.message?.toLowerCase() ?? ''

  if (msg.includes('not found')) return fallback
  return ae.message || fallback
}

function normaliseSgMobilePreview(value: string): string | null {
  const raw = value.trim()
  if (!raw) return ''
  if (raw.length > 13 || !/^\+?[0-9\s-]+$/.test(raw)) return null

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('65') && digits.length === 10) digits = digits.slice(2)
  if (!/^[89]\d{7}$/.test(digits)) return null
  return `+65${digits}`
}

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore()

  const [profileEdits, setProfileEdits] = useState<Partial<ProfileForm>>({})
  const [passwords, setPasswords] = useState<PasswordForm>(emptyPwd)
  const [profileErrs, setProfileErrs] = useState<Record<string, string>>({})
  const [pwdErrs, setPwdErrs] = useState<Record<string, string>>({})
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [requestingCode, setRequestingCode] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showCfm, setShowCfm] = useState(false)

  const original = useMemo(() => toForm(user), [user])
  const profile = useMemo<ProfileForm>(() => ({ ...original, ...profileEdits }), [original, profileEdits])
  const strength = pwdStrength(passwords.newPassword)
  const dirty = profile.full_name !== original.full_name || profile.username !== original.username || profile.contact_number !== original.contact_number

  const setProfileField = (key: EditableProfileField) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    setProfileEdits(prev => {
      if (key === 'full_name') return { ...prev, full_name: value }
      if (key === 'username') return { ...prev, username: value }
      return { ...prev, contact_number: value }
    })

    setProfileErrs(prev => {
      if (key === 'full_name') return { ...prev, full_name: '' }
      if (key === 'username') return { ...prev, username: '' }
      return { ...prev, contact_number: '' }
    })

    setProfileMsg(null)
  }

  const setPwdField = (key: PasswordField) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    setPasswords(prev => {
      if (key === 'currentPassword') return { ...prev, currentPassword: value }
      if (key === 'newPassword') return { ...prev, newPassword: value }
      if (key === 'confirmPassword') return { ...prev, confirmPassword: value }
      return { ...prev, verificationCode: value }
    })

    setPwdErrs(prev => {
      if (key === 'currentPassword') return { ...prev, currentPassword: '' }
      if (key === 'newPassword') return { ...prev, newPassword: '' }
      if (key === 'confirmPassword') return { ...prev, confirmPassword: '' }
      return { ...prev, verificationCode: '' }
    })

    setPwdMsg(null)
  }

  function validateProfile() {
    const e: Record<string, string> = {}
    const name = profile.full_name.trim()
    const username = profile.username.trim()
    const contact = profile.contact_number.trim()
    const normalisedContact = normaliseSgMobilePreview(contact)

    if (!name) e.full_name = 'Full name is required.'
    else if (name.length < 2) e.full_name = 'Full name must be at least 2 characters.'
    else if (name.length > 80) e.full_name = 'Full name must be 80 characters or less.'

    if (!username) e.username = 'Username is required.'
    else if (username.length < 3) e.username = 'Username must be at least 3 characters.'
    else if (username.length > 30) e.username = 'Username must be 30 characters or less.'
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = 'Use letters, numbers, and underscores only.'

    if (normalisedContact === null) e.contact_number = 'Enter a valid Singapore mobile number, e.g. 91234567 or +65 9123 4567.'

    setProfileErrs(e)
    return Object.keys(e).length === 0
  }

  function validatePassword() {
    const e: Record<string, string> = {}

    if (!passwords.currentPassword) e.currentPassword = 'Current password is required.'

    if (!passwords.newPassword) e.newPassword = 'New password is required.'
    else if (passwords.newPassword.length < 8) e.newPassword = 'New password must be at least 8 characters.'
    else if (strength.score < 3) e.newPassword = 'Use a stronger password with uppercase, numbers, or symbols.'

    if (!passwords.confirmPassword) e.confirmPassword = 'Please confirm your new password.'
    else if (passwords.newPassword !== passwords.confirmPassword) e.confirmPassword = 'Passwords do not match.'

    if (!passwords.verificationCode.trim()) e.verificationCode = 'Enter the verification code sent to your email.'
    else if (!/^\d{6}$/.test(passwords.verificationCode.trim())) e.verificationCode = 'Verification code must be 6 digits.'

    if (passwords.currentPassword && passwords.newPassword && passwords.currentPassword === passwords.newPassword) {
      e.newPassword = 'New password must be different from current password.'
    }

    setPwdErrs(e)
    return Object.keys(e).length === 0
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setProfileMsg(null)

    if (!validateProfile()) return
    if (!dirty) {
      setProfileMsg({ type: 'success', text: 'No changes to save.' })
      return
    }

    try {
      setSavingProfile(true)
      const normalisedContact = normaliseSgMobilePreview(profile.contact_number.trim())

      await api.put('/users/profile', {
        full_name: profile.full_name.trim(),
        username: profile.username.trim(),
        contact_number: normalisedContact || null,
      })

      await fetchMe()
      setProfileEdits({})
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch (err) {
      const ae = err as ApiError

      if (ae.errors) setProfileErrs(ae.errors)
      else {
        setProfileMsg({
          type: 'error',
          text: errMsg(err, 'Unable to save changes right now. Please try again later.'),
        })
      }
    } finally {
      setSavingProfile(false)
    }
  }

  async function requestPasswordCode() {
    setPwdMsg(null)
    setPwdErrs(prev => ({ ...prev, currentPassword: '', verificationCode: '' }))

    if (!passwords.currentPassword) {
      setPwdErrs(prev => ({ ...prev, currentPassword: 'Current password is required before requesting a code.' }))
      return
    }

    try {
      setRequestingCode(true)
      await api.post('/users/profile/password/verification', { currentPassword: passwords.currentPassword })
      setPwdMsg({ type: 'success', text: 'Verification code sent to your registered email address.' })
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setPwdErrs(ae.errors)
      else setPwdMsg({ type: 'error', text: errMsg(err, 'Unable to send verification code right now. Please try again later.') })
    } finally {
      setRequestingCode(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPwdMsg(null)

    if (!validatePassword()) return

    try {
      setSavingPwd(true)
      await api.put('/users/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
        verificationCode: passwords.verificationCode.trim(),
      })

      setPasswords(emptyPwd)
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' })
    } catch (err) {
      const ae = err as ApiError

      if (ae.errors) setPwdErrs(ae.errors)
      else {
        setPwdMsg({
          type: 'error',
          text: errMsg(err, 'Unable to update password right now. Please try again later.'),
        })
      }
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-5xl mx-auto">
        <Header user={user} />

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            <Card icon={<UserCircle className="w-5 h-5" />} title="Account details" desc="Update your name, username and Singapore contact number.">
              <form onSubmit={saveProfile} noValidate className="space-y-5">
                <Alert msg={profileMsg} />

                <div className="grid md:grid-cols-2 gap-4">
                  <TextInput label="Full name" value={profile.full_name} error={profileErrs.full_name} onChange={setProfileField('full_name')} autoComplete="name" maxLength={80} />
                  <TextInput label="Username" value={profile.username} error={profileErrs.username} onChange={setProfileField('username')} autoComplete="username" maxLength={30} />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <IconInput label="Email address" icon={<Mail className="w-4 h-4" />} value={profile.email} disabled note="Email cannot be changed from the profile page." />
                  <IconInput label="Contact number" icon={<Phone className="w-4 h-4" />} value={profile.contact_number} error={profileErrs.contact_number} onChange={setProfileField('contact_number')} autoComplete="tel" placeholder="+65 9123 4567" maxLength={13} inputMode="tel" />
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={savingProfile || !dirty}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: savingProfile || !dirty ? '#6ba88e' : C.emerald, cursor: savingProfile || !dirty ? 'not-allowed' : 'pointer' }}>
                    {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Save changes</>}
                  </button>
                </div>
              </form>
            </Card>

            <Card icon={<KeyRound className="w-5 h-5" />} title="Change password" desc="Enter your current password, request an email code, then submit your new password." accent="mauve">
              <form onSubmit={savePassword} noValidate className="space-y-5">
                <Alert msg={pwdMsg} />

                <PasswordInput label="Current password" value={passwords.currentPassword} error={pwdErrs.currentPassword} show={showCur} setShow={setShowCur} onChange={setPwdField('currentPassword')} autoComplete="current-password" />

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>Email verification code</label>
                  <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                    <input type="text" value={passwords.verificationCode} onChange={setPwdField('verificationCode')} autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="6-digit code" style={inputSt(!!pwdErrs.verificationCode)} />
                    <button type="button" onClick={() => { void requestPasswordCode() }} disabled={requestingCode}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                      style={{ background: requestingCode ? '#6ba88e' : C.emerald, cursor: requestingCode ? 'not-allowed' : 'pointer' }}>
                      {requestingCode ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Mail className="w-4 h-4" />Send code</>}
                    </button>
                  </div>
                  {pwdErrs.verificationCode && <p className="text-xs mt-1" style={{ color: C.danger }}>{pwdErrs.verificationCode}</p>}
                  <p className="text-xs mt-1" style={{ color: C.muted }}>The code is sent to your registered email address.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <PasswordInput label="New password" value={passwords.newPassword} error={pwdErrs.newPassword} show={showNew} setShow={setShowNew} onChange={setPwdField('newPassword')} autoComplete="new-password" />
                    {passwords.newPassword && (
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.linen }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${strength.score * 25}%`, background: strength.color }} />
                        </div>
                        <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label} password</p>
                      </div>
                    )}
                  </div>

                  <PasswordInput label="Confirm new password" value={passwords.confirmPassword} error={pwdErrs.confirmPassword} show={showCfm} setShow={setShowCfm} onChange={setPwdField('confirmPassword')} autoComplete="new-password" />
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={savingPwd}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: savingPwd ? '#6ba88e' : C.emerald, cursor: savingPwd ? 'not-allowed' : 'pointer' }}>
                    {savingPwd ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</> : <><KeyRound className="w-4 h-4" />Update password</>}
                  </button>
                </div>
              </form>
            </Card>
          </div>

          <aside className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm p-6" style={{ border: `1px solid ${C.beige}` }}>
              <div className="flex items-center gap-3 mb-5">
                <IconBox><ShieldCheck className="w-5 h-5" /></IconBox>
                <div>
                  <h2 className="text-base font-bold" style={{ color: C.slate }}>Account status</h2>
                  <p className="text-xs" style={{ color: C.muted }}>Visible to you only</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <StatusRow label="Verified" value={user?.is_verified ? 'Yes' : 'Pending'} color={user?.is_verified ? C.emerald : C.warning} />
                <StatusRow label="Active" value={user?.is_active ? 'Yes' : 'No'} color={user?.is_active ? C.emerald : C.danger} />

                <div>
                  <span className="block mb-2" style={{ color: C.muted }}>Roles</span>
                  <div className="flex flex-wrap gap-2">
                    {user?.roles?.map(role => (
                      <span key={role} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: C.mauveLight, color: C.mauve }}>
                        {roleText(role)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl p-5" style={{ background: C.warningLight, border: '1px solid #FDE68A' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: C.warning }}>Security reminder</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#A16207' }}>
                Password changes require your current password and an email verification code before they are saved.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Header({ user }: { user: User | null }) {
  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: C.slate }}>My Profile</h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>
          View and update your account details. Password changes are handled separately from normal profile details.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-white shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold" style={{ background: C.emerald }}>
          {(user?.username || user?.full_name || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: C.slate }}>{user?.full_name || user?.username || 'User'}</p>
          <p className="text-xs" style={{ color: C.muted }}>{user?.email}</p>
        </div>
      </div>
    </div>
  )
}

function Card({ icon, title, desc, accent = 'emerald', children }: {
  icon: ReactNode; title: string; desc: string; accent?: 'emerald' | 'mauve'; children: ReactNode
}) {
  const bg = accent === 'mauve' ? C.mauveLight : C.emeraldLight
  const color = accent === 'mauve' ? C.mauve : C.emerald

  return (
    <section className="bg-white rounded-2xl shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="px-6 py-5 border-b flex items-start gap-3" style={{ borderColor: C.beige }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg, color }}>{icon}</div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.slate }}>{title}</h2>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>{desc}</p>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function Alert({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) {
  if (!msg) return null
  const isErr = msg.type === 'error'

  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: isErr ? C.dangerLight : C.emeraldLight, border: `1px solid ${isErr ? C.dangerBorder : '#A7F3D0'}` }}>
      {isErr ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />}
      <p className="text-sm font-medium" style={{ color: isErr ? C.danger : C.emerald }}>{msg.text}</p>
    </div>
  )
}

function TextInput({ label, value, error, onChange, autoComplete, maxLength }: {
  label: string; value: string; error?: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; autoComplete?: string; maxLength?: number
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <input type="text" value={value} onChange={onChange} autoComplete={autoComplete} maxLength={maxLength} style={inputSt(!!error)}
        onFocus={e => (e.target.style.borderColor = C.emerald)}
        onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function IconInput({ label, icon, value, error, onChange, disabled, note, autoComplete, placeholder, maxLength, inputMode }: {
  label: string; icon: ReactNode; value: string; error?: string; disabled?: boolean; note?: string; autoComplete?: string; placeholder?: string; maxLength?: number; inputMode?: 'tel' | 'numeric';
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>{icon}</span>
        <input type={label.includes('Email') ? 'email' : 'tel'} value={value} disabled={disabled} onChange={onChange}
          autoComplete={autoComplete} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode}
          style={inputSt(!!error, { paddingLeft: '40px', background: disabled ? C.linen : '#fff', color: disabled ? C.muted : C.slate, cursor: disabled ? 'not-allowed' : 'text' })}
          onFocus={e => (e.target.style.borderColor = C.emerald)}
          onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
      </div>
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function PasswordInput({ label, value, error, show, setShow, onChange, autoComplete }: {
  label: string; value: string; error?: string; show: boolean; setShow: (v: boolean) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void; autoComplete: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete}
          placeholder={label} style={inputSt(!!error, { paddingRight: '42px' })}
          onFocus={e => (e.target.style.borderColor = C.emerald)}
          onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function IconBox({ children }: { children: ReactNode }) {
  return <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight, color: C.emerald }}>{children}</div>
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: C.muted }}>{label}</span>
      <span className="font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}
