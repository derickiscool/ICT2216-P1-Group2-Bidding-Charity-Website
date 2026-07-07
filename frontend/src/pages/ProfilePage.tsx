import { useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, AtSign, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, Phone, Save, ShieldCheck, UserCircle } from 'lucide-react'
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

// Temporary type extension because backend may name the phone field differently.
// Once backend confirms the exact field, we can keep only one field name.
type ProfileUser = User & { contact_number?: string | null; phone_number?: string | null }
type ProfileForm = { full_name: string; username: string; email: string; contact_number: string }
type EditableProfileField = 'full_name' | 'username' | 'contact_number'
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string }

const emptyPwd: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasErr ? C.danger : C.beige}`,
    background: '#fff', color: C.slate, fontSize: '14px', outline: 'none', ...extra,
  }
}

// Converts the logged-in user from authStore into editable form values.
function toForm(user: User | null): ProfileForm {
  const u = user as ProfileUser | null
  return {
    full_name: u?.full_name ?? '',
    username: u?.username ?? '',
    email: u?.email ?? '',
    contact_number: u?.contact_number ?? u?.phone_number ?? '',
  }
}

// Simple client-side password strength indicator.
// This is only for user guidance. Backend must still validate and hash passwords securely.
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
    case 'charity_organisation': return 'Charity Organisation'
    case 'admin': return 'Admin'
    default: return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}

// Shows user-friendly error messages instead of raw backend messages like "Not found".
// The current "Not found" happens because backend profile routes are not implemented/mounted yet.
function errMsg(err: unknown, fallback: string) {
  const ae = err as ApiError
  const msg = ae.message?.toLowerCase() ?? ''

  if (msg.includes('not found')) return fallback
  return ae.message || fallback
}

export default function ProfilePage() {
  const { user, fetchMe, logout } = useAuthStore()
  const navigate = useNavigate()

  // After a verified email change the backend revokes all sessions, so we clear
  // client auth state and send the user back to the login page to sign in afresh.
  const handleEmailChanged = async () => {
    try { await logout() } catch { /* session already revoked server-side */ }
    navigate('/login', { replace: true })
  }

  const [profileEdits, setProfileEdits] = useState<Partial<ProfileForm>>({})
  const [passwords, setPasswords] = useState<PasswordForm>(emptyPwd)
  const [profileErrs, setProfileErrs] = useState<Record<string, string>>({})
  const [pwdErrs, setPwdErrs] = useState<Record<string, string>>({})
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [savingProfile, setSavingProfile] = useState(false)
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

  // Avoid dynamic object injection warning by updating known fields only.
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

  const setPwdField = (key: keyof PasswordForm) => (e: ChangeEvent<HTMLInputElement>) => {
    setPasswords(prev => ({ ...prev, [key]: e.target.value }))
    setPwdErrs(prev => ({ ...prev, [key]: '' }))
    setPwdMsg(null)
  }

  // Frontend validation gives quick feedback before sending data to backend.
  function validateProfile() {
    const e: Record<string, string> = {}
    const name = profile.full_name.trim()
    const username = profile.username.trim()
    const contact = profile.contact_number.trim()

    if (!name) e.full_name = 'Full name is required.'
    else if (name.length < 2) e.full_name = 'Full name must be at least 2 characters.'
    else if (name.length > 80) e.full_name = 'Full name must be 80 characters or less.'

    if (!username) e.username = 'Username is required.'
    else if (username.length < 3) e.username = 'Username must be at least 3 characters.'
    else if (username.length > 30) e.username = 'Username must be 30 characters or less.'
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = 'Use letters, numbers, and underscores only.'

    if (contact && !/^\+?[0-9\s-]{8,20}$/.test(contact)) e.contact_number = 'Enter a valid contact number.'

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

      /*
        Expected backend route:
        PUT /api/users/profile

        Important security point:
        Frontend should not send user_id here.
        Backend should identify the current user from the token/session.
      */
      await api.put('/users/profile', {
        full_name: profile.full_name.trim(),
        username: profile.username.trim(),
        contact_number: profile.contact_number.trim() || null,
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

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPwdMsg(null)

    if (!validatePassword()) return

    try {
      setSavingPwd(true)

      /*
        Expected backend route:
        PUT /api/users/profile/password

        Password fields are cleared after success so they do not remain in component state.
      */
      await api.put('/users/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
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
            <Card icon={<UserCircle className="w-5 h-5" />} title="Account details" desc="Update your name, username and contact number.">
              <form onSubmit={saveProfile} noValidate className="space-y-5">
                <Alert msg={profileMsg} />

                <div className="grid md:grid-cols-2 gap-4">
                  <TextInput label="Full name" value={profile.full_name} error={profileErrs.full_name} onChange={setProfileField('full_name')} autoComplete="name" />
                  <TextInput label="Username" value={profile.username} error={profileErrs.username} onChange={setProfileField('username')} autoComplete="username" />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <IconInput label="Email address" icon={<Mail className="w-4 h-4" />} value={profile.email} disabled note="Use “Change email address” below to update it." />
                  <IconInput label="Contact number" icon={<Phone className="w-4 h-4" />} value={profile.contact_number} error={profileErrs.contact_number} onChange={setProfileField('contact_number')} autoComplete="tel" placeholder="+65 9123 4567" />
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

            <Card icon={<KeyRound className="w-5 h-5" />} title="Change password" desc="Use a strong password and avoid reusing old credentials." accent="mauve">
              <form onSubmit={savePassword} noValidate className="space-y-5">
                <Alert msg={pwdMsg} />

                <PasswordInput label="Current password" value={passwords.currentPassword} error={pwdErrs.currentPassword} show={showCur} setShow={setShowCur} onChange={setPwdField('currentPassword')} autoComplete="current-password" />

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

            <EmailChangeCard currentEmail={original.email} onChanged={handleEmailChanged} />
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

            {/*
              TODO: Remove this block when backend profile/password routes are fully completed.
            */}
            <section className="rounded-2xl p-5" style={{ background: C.warningLight, border: '1px solid #FDE68A' }}>
              <h3 className="font-bold text-sm mb-2" style={{ color: C.warning }}>Security reminder</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#A16207' }}>
                For your security, profile and password changes may require verification before they are saved.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

/*
  SFR03 verified email change (OWASP no-MFA, sequential current-first confirmation).
  Stage 1 (request):        re-authenticate with current password + new email → a code is
                            sent to the CURRENT address only.
  Stage 2 (verify current): enter that code → the new address is proven-safe to contact and
                            only then receives its own code.
  Stage 3 (confirm new):    enter the new-address code → backend applies the change and
                            revokes all sessions, so on success we log out and go to login.
*/
type EmailStage = 'idle' | 'request' | 'verifyCurrent' | 'confirmNew' | 'done'

function EmailChangeCard({ currentEmail, onChanged }: { currentEmail: string; onChanged: () => void }) {
  const [stage, setStage] = useState<EmailStage>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [oldEmailOtp, setOldEmailOtp] = useState('')
  const [newEmailOtp, setNewEmailOtp] = useState('')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  function reset() {
    setStage('idle'); setNewEmail(''); setCurrentPassword('')
    setOldEmailOtp(''); setNewEmailOtp(''); setErrs({}); setMsg(null)
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault(); setMsg(null); setErrs({})

    const email = newEmail.trim()
    const local: Record<string, string> = {}
    if (!email) local.newEmail = 'New email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) local.newEmail = 'Enter a valid email address.'
    else if (email.toLowerCase() === currentEmail.toLowerCase()) local.newEmail = 'New email must be different from your current email.'
    if (!currentPassword) local.currentPassword = 'Current password is required.'
    if (Object.keys(local).length) { setErrs(local); return }

    try {
      setBusy(true)
      await api.post('/users/profile/email', { newEmail: email, currentPassword })
      setStage('verifyCurrent')
      setMsg({ type: 'success', text: `We sent a 6-digit code to your current email (${currentEmail}). Enter it below to prove this is your account.` })
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrs(ae.errors)
      else setMsg({ type: 'error', text: ae.message || 'Unable to start email change right now. Please try again later.' })
    } finally { setBusy(false) }
  }

  async function submitVerifyCurrent(e: FormEvent) {
    e.preventDefault(); setMsg(null); setErrs({})

    if (!oldEmailOtp.trim()) { setErrs({ oldEmailOtp: 'Enter the code sent to your current email.' }); return }

    try {
      setBusy(true)
      await api.post('/users/profile/email/verify-current', { oldEmailOtp: oldEmailOtp.trim() })
      setStage('confirmNew')
      setMsg({ type: 'success', text: `Current email confirmed. We've now sent a code to your new email (${newEmail.trim()}). Enter it to finish.` })
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrs(ae.errors)
      else setMsg({ type: 'error', text: ae.message || 'Unable to verify that code right now. Please try again later.' })
    } finally { setBusy(false) }
  }

  async function submitConfirmNew(e: FormEvent) {
    e.preventDefault(); setMsg(null); setErrs({})

    if (!newEmailOtp.trim()) { setErrs({ newEmailOtp: 'Enter the code sent to your new email.' }); return }

    try {
      setBusy(true)
      await api.post('/users/profile/email/confirm', { newEmailOtp: newEmailOtp.trim() })
      setStage('done')
      setMsg({ type: 'success', text: 'Your email address has been changed. For security you have been signed out — please log in again with your new email.' })
    } catch (err) {
      const ae = err as ApiError
      if (ae.errors) setErrs(ae.errors)
      else setMsg({ type: 'error', text: ae.message || 'Unable to confirm email change right now. Please try again later.' })
    } finally { setBusy(false) }
  }

  return (
    <Card icon={<AtSign className="w-5 h-5" />} title="Change email address" desc="Changing your email requires your password, then confirmation from your current and new addresses in turn." accent="mauve">
      {stage === 'idle' && (
        <div className="space-y-4">
          <Alert msg={msg} />
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            To protect your account, updating your email needs your current password and a one-time code —
            first to confirm your <strong>current</strong> address, then your <strong>new</strong> one.
          </p>
          <button type="button" onClick={() => { setMsg(null); setStage('request') }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: C.emerald, cursor: 'pointer' }}>
            <AtSign className="w-4 h-4" />Change email
          </button>
        </div>
      )}

      {stage === 'request' && (
        <form onSubmit={submitRequest} noValidate className="space-y-5">
          <Alert msg={msg} />
          <TextInput label="New email address" value={newEmail} error={errs.newEmail}
            onChange={e => { setNewEmail(e.target.value); setErrs(p => ({ ...p, newEmail: '' })) }} autoComplete="email" />
          <PasswordInput label="Current password" value={currentPassword} error={errs.currentPassword}
            show={showPwd} setShow={setShowPwd}
            onChange={e => { setCurrentPassword(e.target.value); setErrs(p => ({ ...p, currentPassword: '' })) }} autoComplete="current-password" />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ color: C.muted, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: busy ? '#6ba88e' : C.emerald, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Mail className="w-4 h-4" />Send code</>}
            </button>
          </div>
        </form>
      )}

      {stage === 'verifyCurrent' && (
        <form onSubmit={submitVerifyCurrent} noValidate className="space-y-5">
          <Alert msg={msg} />
          <TextInput label="Code sent to your current email" value={oldEmailOtp} error={errs.oldEmailOtp}
            onChange={e => { setOldEmailOtp(e.target.value); setErrs(p => ({ ...p, oldEmailOtp: '' })) }} autoComplete="one-time-code" />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ color: C.muted, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: busy ? '#6ba88e' : C.emerald, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : <><CheckCircle2 className="w-4 h-4" />Verify current email</>}
            </button>
          </div>
        </form>
      )}

      {stage === 'confirmNew' && (
        <form onSubmit={submitConfirmNew} noValidate className="space-y-5">
          <Alert msg={msg} />
          <TextInput label="Code sent to your new email" value={newEmailOtp} error={errs.newEmailOtp}
            onChange={e => { setNewEmailOtp(e.target.value); setErrs(p => ({ ...p, newEmailOtp: '' })) }} autoComplete="one-time-code" />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ color: C.muted, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: busy ? '#6ba88e' : C.emerald, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Confirming…</> : <><CheckCircle2 className="w-4 h-4" />Confirm change</>}
            </button>
          </div>
        </form>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <Alert msg={msg} />
          <button type="button" onClick={onChanged}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: C.emerald, cursor: 'pointer' }}>
            Continue to login
          </button>
        </div>
      )}
    </Card>
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

/* Reusable card wrapper for profile and password sections. */
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

/* Shared alert banner for success/error feedback. */
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

function TextInput({ label, value, error, onChange, autoComplete }: {
  label: string; value: string; error?: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; autoComplete?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <input type="text" value={value} onChange={onChange} autoComplete={autoComplete} style={inputSt(!!error)}
        onFocus={e => (e.target.style.borderColor = C.emerald)}
        onBlur={e => (e.target.style.borderColor = error ? C.danger : C.beige)} />
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function IconInput({ label, icon, value, error, onChange, disabled, note, autoComplete, placeholder }: {
  label: string; icon: ReactNode; value: string; error?: string; disabled?: boolean; note?: string; autoComplete?: string; placeholder?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.beige }}>{icon}</span>
        <input type={label.includes('Email') ? 'email' : 'tel'} value={value} disabled={disabled} onChange={onChange}
          autoComplete={autoComplete} placeholder={placeholder}
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