import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Plus, Power, RotateCcw, Search, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import type { ApiError } from '../types'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5', beige: '#BBB09B',
  linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E', warning: '#92400E',
  warningLight: '#FFFBEB', danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type StaffField = 'full_name' | 'email' | 'temporaryPassword'
type AlertMsg = { type: 'success' | 'error'; text: string } | null
type StaffFormErrors = Partial<Record<keyof StaffForm, string>>

interface StaffAccount {
  uuid: string
  full_name: string
  email: string
  is_active: boolean
  created_at: string
  lastLoginAt?: string
}

interface StaffListResponse {
  staff: StaffAccount[]
  canManageStaff: boolean
}

interface StaffForm {
  full_name: string
  email: string
  temporaryPassword: string
}

const emptyForm: StaffForm = {
  full_name: '', email: '', temporaryPassword: '',
}

function inputSt(hasErr: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: `1px solid ${hasErr ? C.danger : C.beige}`,
    background: C.white, color: C.slate, fontSize: '14px', outline: 'none', ...extra,
  }
}

function formatDate(value?: string) {
  if (!value) return 'Never'
  return new Date(value).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusText(isActive: boolean) {
  return isActive ? 'Active' : 'Inactive'
}

function statusStyle(isActive: boolean): CSSProperties {
  return isActive
    ? { background: C.emeraldLight, color: C.emerald }
    : { background: C.dangerLight, color: C.danger }
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const apiErr = err as ApiError
  return apiErr?.message || fallback
}

function updateKnownField(form: StaffForm, field: StaffField, value: string): StaffForm {
  if (field === 'full_name') return { ...form, full_name: value }
  if (field === 'email') return { ...form, email: value }
  return { ...form, temporaryPassword: value }
}

function clearKnownError(errors: StaffFormErrors, field: StaffField): StaffFormErrors {
  if (field === 'full_name') return { ...errors, full_name: '' }
  if (field === 'email') return { ...errors, email: '' }
  return { ...errors, temporaryPassword: '' }
}

export default function CharityStaffManagementPage() {
  const { user } = useAuthStore()
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [canManageStaff, setCanManageStaff] = useState(false)
  const [createForm, setCreateForm] = useState<StaffForm>(emptyForm)
  const [createErrors, setCreateErrors] = useState<StaffFormErrors>({})
  const [message, setMessage] = useState<AlertMsg>(null)
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null)
  const [workingStaffId, setWorkingStaffId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const roles = user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isCharityOrg = roles.includes('charity')
  const hasManageRole = isAdmin || isCharityOrg

  useEffect(() => {
    let cancelled = false
    async function loadStaff() {
      setLoading(true)
      try {
        const res = await api.get<StaffListResponse>('/charities/staff')
        if (cancelled) return
        setStaff(res.data.staff)
        setCanManageStaff(res.data.canManageStaff)
      } catch (err) {
        if (cancelled) return
        setMessage({ type: 'error', text: apiErrorMessage(err, 'Failed to load staff accounts.') })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (hasManageRole) void loadStaff()
    return () => { cancelled = true }
  }, [hasManageRole])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((item) =>
      item.full_name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q),
    )
  }, [staff, search])

  const activeCount = useMemo(() => staff.filter((item) => item.is_active).length, [staff])
  const inactiveCount = staff.length - activeCount

  function updateCreateField(field: StaffField, value: string) {
    setCreateForm((prev) => updateKnownField(prev, field, value))
    setCreateErrors((prev) => clearKnownError(prev, field))
    setMessage(null)
  }

  function validateStaffForm(form: StaffForm) {
    const e: StaffFormErrors = {}
    const fullName = form.full_name.trim(), email = form.email.trim()

    if (!fullName) e.full_name = 'Full name is required.'
    else if (fullName.length < 2) e.full_name = 'Full name must be at least 2 characters.'
    else if (fullName.length > 80) e.full_name = 'Full name must be 80 characters or less.'

    if (!email) e.email = 'Work email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.'
    else if (staff.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
      e.email = 'This email is already used by another staff account.'
    }

    if (form.temporaryPassword.length < 8) {
      e.temporaryPassword = 'Temporary password must be at least 8 characters.'
    }

    return e
  }

  async function saveCreateStaff(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!canManageStaff) {
      setMessage({ type: 'error', text: 'Your organisation account must be approved before managing staff accounts.' })
      return
    }

    const eMap = validateStaffForm(createForm)
    setCreateErrors(eMap)
    if (Object.keys(eMap).length > 0) return

    setCreating(true)
    try {
      const res = await api.post<StaffAccount>('/charities/staff', createForm)
      setStaff((prev) => [res.data, ...prev])
      setCreateForm(emptyForm)
      setCreateErrors({})
      setMessage({ type: 'success', text: 'Staff account created successfully. They must change the temporary password on first login.' })
    } catch (err) {
      const apiErr = err as ApiError
      if (apiErr.errors) setCreateErrors(apiErr.errors)
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Failed to create staff account.') })
    } finally {
      setCreating(false)
    }
  }

  async function deactivateStaff(uuid: string) {
    setWorkingStaffId(uuid)
    try {
      const res = await api.patch<StaffAccount>(`/charities/staff/${uuid}/deactivate`)
      setStaff((prev) => prev.map((item) => (item.uuid === uuid ? res.data : item)))
      setConfirmDeactivateId(null)
      setMessage({ type: 'success', text: 'Staff account deactivated successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Failed to deactivate staff account.') })
    } finally {
      setWorkingStaffId(null)
    }
  }

  async function reactivateStaff(uuid: string) {
    setWorkingStaffId(uuid)
    try {
      const res = await api.patch<StaffAccount>(`/charities/staff/${uuid}/reactivate`)
      setStaff((prev) => prev.map((item) => (item.uuid === uuid ? res.data : item)))
      setMessage({ type: 'success', text: 'Staff account reactivated successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Failed to reactivate staff account.') })
    } finally {
      setWorkingStaffId(null)
    }
  }

  const showApprovalAlert = !loading && hasManageRole && !canManageStaff

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <Header />
        {showApprovalAlert && <Alert msg={{ type: 'error', text: 'Your organisation account must be approved before you can manage staff accounts.' }} />}
        {message && <Alert msg={message} />}

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 mt-6">
          <div className="space-y-6">
            <Card icon={<UserPlus className="w-5 h-5" />} title="Create staff account" desc="Add charity staff who can help manage campaigns and auction listings.">
              <form onSubmit={saveCreateStaff} noValidate className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <TextInput label="Full name" value={createForm.full_name} error={createErrors.full_name} disabled={!canManageStaff || creating} autoComplete="name" onChange={(e) => updateCreateField('full_name', e.target.value)} />
                  <TextInput label="Work email" type="email" value={createForm.email} error={createErrors.email} disabled={!canManageStaff || creating} autoComplete="email" onChange={(e) => updateCreateField('email', e.target.value)} />
                </div>
                <TextInput label="Temporary password" type="password" value={createForm.temporaryPassword} error={createErrors.temporaryPassword} disabled={!canManageStaff || creating} autoComplete="new-password" note="Staff must change this after their first login." onChange={(e) => updateCreateField('temporaryPassword', e.target.value)} />
                <div className="flex justify-end pt-2">
                  <PrimaryButton disabled={!canManageStaff || creating} icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} label={creating ? 'Creating...' : 'Create staff account'} />
                </div>
              </form>
            </Card>

            <Card icon={<Users className="w-5 h-5" />} title="Charity staff accounts" desc="View active and inactive staff linked to your organisation.">
              <SearchBox value={search} onChange={setSearch} />
              {loading ? (
                <div className="text-center py-10" style={{ color: C.muted }}>
                  <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />
                  <p className="text-sm">Loading staff accounts...</p>
                </div>
              ) : (
                <StaffTable
                  staff={filteredStaff}
                  canManageStaff={canManageStaff}
                  confirmDeactivateId={confirmDeactivateId}
                  workingStaffId={workingStaffId}
                  onConfirmDeactivate={deactivateStaff}
                  onAskDeactivate={setConfirmDeactivateId}
                  onCancelDeactivate={() => setConfirmDeactivateId(null)}
                  onReactivate={reactivateStaff}
                />
              )}
            </Card>
          </div>

          <aside className="space-y-6">
            <OverviewCard total={staff.length} active={activeCount} inactive={inactiveCount} />
            <InfoCard title="Account approval required" tone="warning">
              Only approved charity organisation accounts can create, deactivate, or reactivate staff accounts.
            </InfoCard>
            <InfoCard title="Security reminder" tone="success">
              Staff account changes are logged for audit purposes, and temporary passwords are forced to be changed on first login.
            </InfoCard>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold" style={{ color: C.slate }}>Manage Staff Accounts</h1>
      <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>Create, deactivate and reactivate charity staff accounts linked to your organisation.</p>
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-5 relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.beige }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search by name or email" style={inputSt(false, { paddingLeft: '40px' })} />
    </div>
  )
}

function StaffTable(props: {
  staff: StaffAccount[]
  canManageStaff: boolean
  confirmDeactivateId: string | null
  workingStaffId: string | null
  onConfirmDeactivate: (uuid: string) => void
  onAskDeactivate: (uuid: string) => void
  onCancelDeactivate: () => void
  onReactivate: (uuid: string) => void
}) {
  const { staff, canManageStaff, confirmDeactivateId, workingStaffId, onConfirmDeactivate, onAskDeactivate, onCancelDeactivate, onReactivate } = props

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b" style={{ borderColor: C.beige, color: C.muted }}>
            <th className="py-3 pr-4 font-semibold">Staff</th>
            <th className="py-3 pr-4 font-semibold">Status</th>
            <th className="py-3 pr-4 font-semibold">Last login</th>
            <th className="py-3 pr-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((account) => (
            <tr key={account.uuid} className="border-b last:border-b-0" style={{ borderColor: C.linen }}>
              <td className="py-4 pr-4">
                <p className="font-semibold" style={{ color: C.slate }}>{account.full_name}</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>{account.email}</p>
              </td>
              <td className="py-4 pr-4"><StatusBadge isActive={account.is_active} /></td>
              <td className="py-4 pr-4" style={{ color: C.muted }}>{formatDate(account.lastLoginAt)}</td>
              <td className="py-4 pr-4">
                <StaffActions
                  account={account}
                  canManageStaff={canManageStaff}
                  isConfirming={confirmDeactivateId === account.uuid}
                  isWorking={workingStaffId === account.uuid}
                  onConfirmDeactivate={onConfirmDeactivate}
                  onAskDeactivate={onAskDeactivate}
                  onCancelDeactivate={onCancelDeactivate}
                  onReactivate={onReactivate}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {staff.length === 0 && (
        <div className="text-center py-10">
          <XCircle className="w-8 h-8 mx-auto mb-3" style={{ color: C.beige }} />
          <p className="font-medium" style={{ color: C.slate }}>No staff accounts found</p>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Try a different search keyword.</p>
        </div>
      )}
    </div>
  )
}

function StaffActions(props: {
  account: StaffAccount
  canManageStaff: boolean
  isConfirming: boolean
  isWorking: boolean
  onConfirmDeactivate: (uuid: string) => void
  onAskDeactivate: (uuid: string) => void
  onCancelDeactivate: () => void
  onReactivate: (uuid: string) => void
}) {
  const { account, canManageStaff, isConfirming, isWorking, onConfirmDeactivate, onAskDeactivate, onCancelDeactivate, onReactivate } = props
  const disabled = !canManageStaff || isWorking

  if (isConfirming) {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onConfirmDeactivate(account.uuid)} disabled={disabled} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: C.danger, cursor: disabled ? 'not-allowed' : 'pointer' }}>{isWorking ? 'Deactivating...' : 'Confirm'}</button>
        <button type="button" onClick={onCancelDeactivate} disabled={disabled} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>Cancel</button>
      </div>
    )
  }

  return (
    <div className="flex justify-end gap-2">
      {account.is_active ? (
        <StaffActionButton label={isWorking ? 'Working...' : 'Deactivate'} icon={<Power className="w-3.5 h-3.5" />} danger disabled={disabled} onClick={() => onAskDeactivate(account.uuid)} />
      ) : (
        <StaffActionButton label={isWorking ? 'Working...' : 'Reactivate'} icon={<RotateCcw className="w-3.5 h-3.5" />} disabled={disabled} onClick={() => onReactivate(account.uuid)} />
      )}
    </div>
  )
}

function OverviewCard({ total, active, inactive }: { total: number; active: number; inactive: number }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-6" style={{ border: `1px solid ${C.beige}` }}>
      <div className="flex items-center gap-3 mb-5">
        <IconBox><ShieldCheck className="w-5 h-5" /></IconBox>
        <div>
          <h2 className="text-base font-bold" style={{ color: C.slate }}>Staff overview</h2>
          <p className="text-xs" style={{ color: C.muted }}>For your organisation</p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <StatusRow label="Total staff" value={String(total)} color={C.slate} />
        <StatusRow label="Active staff" value={String(active)} color={C.emerald} />
        <StatusRow label="Inactive staff" value={String(inactive)} color={C.danger} />
      </div>
    </section>
  )
}

function InfoCard({ title, tone, children }: { title: string; tone: 'warning' | 'success'; children: ReactNode }) {
  const isWarning = tone === 'warning'
  const color = isWarning ? C.warning : C.emerald
  return (
    <section className="rounded-2xl p-5" style={{ background: isWarning ? C.warningLight : C.emeraldLight, border: `1px solid ${isWarning ? '#FDE68A' : '#A7F3D0'}` }}>
      <h3 className="font-bold text-sm mb-2" style={{ color }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color }}>{children}</p>
    </section>
  )
}

function Card({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm" style={{ border: `1px solid ${C.beige}` }}>
      <div className="px-6 py-5 border-b flex items-start gap-3" style={{ borderColor: C.beige }}>
        <IconBox>{icon}</IconBox>
        <div>
          <h2 className="text-lg font-bold" style={{ color: C.slate }}>{title}</h2>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>{desc}</p>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function Alert({ msg }: { msg: AlertMsg }) {
  if (!msg) return null
  const isErr = msg.type === 'error'
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: isErr ? C.dangerLight : C.emeraldLight, border: `1px solid ${isErr ? C.dangerBorder : '#A7F3D0'}` }}>
      {isErr ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.danger }} /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: C.emerald }} />}
      <p className="text-sm font-medium" style={{ color: isErr ? C.danger : C.emerald }}>{msg.text}</p>
    </div>
  )
}

function TextInput(props: {
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  error?: string
  note?: string
  disabled?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  autoComplete?: string
}) {
  const { label, type = 'text', value, error, note, disabled, onChange, autoComplete } = props
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.slate }}>{label}</label>
      <input type={type} value={value} onChange={onChange} disabled={disabled} autoComplete={autoComplete}
        style={inputSt(!!error, { background: disabled ? C.linen : C.white, color: disabled ? C.muted : C.slate, cursor: disabled ? 'not-allowed' : 'text' })}
        onFocus={(e) => { e.target.style.borderColor = C.emerald }}
        onBlur={(e) => { e.target.style.borderColor = error ? C.danger : C.beige }} />
      {note && <p className="text-xs mt-1" style={{ color: C.muted }}>{note}</p>}
      {error && <p className="text-xs mt-1" style={{ color: C.danger }}>{error}</p>}
    </div>
  )
}

function PrimaryButton({ icon, label, disabled }: { icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ background: disabled ? '#6ba88e' : C.emerald, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {icon}
      {label}
    </button>
  )
}

function StaffActionButton({ label, icon, disabled, danger, onClick }: {
  label: string
  icon: ReactNode
  disabled: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5" style={{ borderColor: danger ? C.dangerBorder : C.beige, color: disabled ? C.muted : danger ? C.danger : C.slate, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {icon}
      {label}
    </button>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold" style={statusStyle(isActive)}>{statusText(isActive)}</span>
}

function IconBox({ children }: { children: ReactNode }) {
  return <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight, color: C.emerald }}>{children}</div>
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center justify-between gap-3"><span style={{ color: C.muted }}>{label}</span><span className="font-semibold" style={{ color }}>{value}</span></div>
}