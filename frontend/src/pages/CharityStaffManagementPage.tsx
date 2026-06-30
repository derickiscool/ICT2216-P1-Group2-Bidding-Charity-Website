import { useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Edit3, Plus, Power, Search, ShieldCheck, UserPlus, Users, X, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const C = {
  slate: '#2D3A3A', emerald: '#047857', emeraldLight: '#ECFDF5', beige: '#BBB09B',
  linen: '#F7F5F0', white: '#FFFFFF', muted: '#5C6E6E', warning: '#92400E',
  warningLight: '#FFFBEB', danger: '#B91C1C', dangerLight: '#FEF2F2', dangerBorder: '#FECACA',
}

type StaffStatus = 'active' | 'inactive'
type StaffField = 'full_name' | 'email' | 'username' | 'temporaryPassword'
type AlertMsg = { type: 'success' | 'error'; text: string } | null
type StaffFormErrors = Partial<Record<keyof StaffForm, string>>

interface StaffAccount {
  id: number
  full_name: string
  email: string
  username: string
  status: StaffStatus
  created_at: string
  last_login?: string
}

interface StaffForm {
  full_name: string
  email: string
  username: string
  temporaryPassword: string
}

const emptyForm: StaffForm = {
  full_name: '', email: '', username: '', temporaryPassword: '',
}

/*
  TODO: Replace mockStaff with GET /api/charities/staff when backend is ready.
*/
const mockStaff: StaffAccount[] = [
  {
    id: 1, full_name: 'Amelia Tan', email: 'amelia@hopefoundation.sg', username: 'amelia_tan',
    status: 'active', created_at: '2026-06-20T10:30:00.000Z', last_login: '2026-06-28T09:15:00.000Z',
  },
  {
    id: 2, full_name: 'Rahim Lim', email: 'rahim@hopefoundation.sg', username: 'rahim_lim',
    status: 'inactive', created_at: '2026-06-21T14:20:00.000Z',
  },
]

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

function statusText(status: StaffStatus) {
  return status === 'active' ? 'Active' : 'Inactive'
}

function statusStyle(status: StaffStatus): CSSProperties {
  return status === 'active'
    ? { background: C.emeraldLight, color: C.emerald }
    : { background: C.dangerLight, color: C.danger }
}

function updateKnownField(form: StaffForm, field: StaffField, value: string): StaffForm {
  if (field === 'full_name') return { ...form, full_name: value }
  if (field === 'email') return { ...form, email: value }
  if (field === 'username') return { ...form, username: value }
  return { ...form, temporaryPassword: value }
}

function clearKnownError(errors: StaffFormErrors, field: StaffField): StaffFormErrors {
  if (field === 'full_name') return { ...errors, full_name: '' }
  if (field === 'email') return { ...errors, email: '' }
  if (field === 'username') return { ...errors, username: '' }
  return { ...errors, temporaryPassword: '' }
}

export default function CharityStaffManagementPage() {
  const { user } = useAuthStore()
  const [staff, setStaff] = useState<StaffAccount[]>(mockStaff)
  const [createForm, setCreateForm] = useState<StaffForm>(emptyForm)
  const [editForm, setEditForm] = useState<StaffForm>(emptyForm)
  const [createErrors, setCreateErrors] = useState<StaffFormErrors>({})
  const [editErrors, setEditErrors] = useState<StaffFormErrors>({})
  const [message, setMessage] = useState<AlertMsg>(null)
  const [editingAccount, setEditingAccount] = useState<StaffAccount | null>(null)
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const roles = user?.roles ?? []
  const isAdmin = roles.includes('admin')
  const isCharityOrg = roles.includes('charity') // 'charity' currently represents Charity Organisation / charity_org.

  /*
    Temporary approval check. Replace user.is_verified with actual charity approval status
    once backend returns charity organisation approval data.
  */
  const canManageStaff = isAdmin || (isCharityOrg && user?.is_verified === true)

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((item) =>
      item.full_name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      item.username.toLowerCase().includes(q),
    )
  }, [staff, search])

  const activeCount = useMemo(() => staff.filter((item) => item.status === 'active').length, [staff])
  const inactiveCount = staff.length - activeCount

  function updateCreateField(field: StaffField, value: string) {
    setCreateForm((prev) => updateKnownField(prev, field, value))
    setCreateErrors((prev) => clearKnownError(prev, field))
    setMessage(null)
  }

  function updateEditField(field: StaffField, value: string) {
    setEditForm((prev) => updateKnownField(prev, field, value))
    setEditErrors((prev) => clearKnownError(prev, field))
    setMessage(null)
  }

  function validateStaffForm(form: StaffForm, editingId: number | null) {
    const e: StaffFormErrors = {}
    const fullName = form.full_name.trim(), email = form.email.trim(), username = form.username.trim()

    if (!fullName) e.full_name = 'Full name is required.'
    else if (fullName.length < 2) e.full_name = 'Full name must be at least 2 characters.'
    else if (fullName.length > 80) e.full_name = 'Full name must be 80 characters or less.'

    if (!email) e.email = 'Work email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.'
    else if (staff.some((item) => item.email.toLowerCase() === email.toLowerCase() && item.id !== editingId)) {
      e.email = 'This email is already used by another staff account.'
    }

    if (!username) e.username = 'Username is required.'
    else if (username.length < 3) e.username = 'Username must be at least 3 characters.'
    else if (username.length > 30) e.username = 'Username must be 30 characters or less.'
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = 'Use letters, numbers, and underscores only.'
    else if (staff.some((item) => item.username.toLowerCase() === username.toLowerCase() && item.id !== editingId)) {
      e.username = 'This username is already used by another staff account.'
    }

    if (editingId === null && form.temporaryPassword.length < 8) {
      e.temporaryPassword = 'Temporary password must be at least 8 characters.'
    }

    return e
  }

  function saveCreateStaff(e: FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!canManageStaff) {
      setMessage({ type: 'error', text: 'Your organisation account must be approved before managing staff accounts.' })
      return
    }

    const eMap = validateStaffForm(createForm, null)
    setCreateErrors(eMap)
    if (Object.keys(eMap).length > 0) return

    /*
      TODO: Replace local create with POST /api/charities/staff.
      Backend should hash the temporary password and link staff to the charity organisation.
    */
    const newStaff: StaffAccount = {
      id: Date.now(),
      full_name: createForm.full_name.trim(),
      email: createForm.email.trim(),
      username: createForm.username.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
    }

    setStaff((prev) => [newStaff, ...prev])
    setCreateForm(emptyForm)
    setCreateErrors({})
    setMessage({ type: 'success', text: 'Staff account created successfully.' })
  }

  function saveEditStaff(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!editingAccount) return

    const eMap = validateStaffForm(editForm, editingAccount.id)
    setEditErrors(eMap)
    if (Object.keys(eMap).length > 0) return

    /*
      TODO: Replace local update with PUT /api/charities/staff/:id.
      Backend must verify the current user owns/manages this charity organisation.
    */
    setStaff((prev) =>
      prev.map((item) =>
        item.id === editingAccount.id
          ? {
              ...item,
              full_name: editForm.full_name.trim(),
              email: editForm.email.trim(),
              username: editForm.username.trim(),
            }
          : item,
      ),
    )

    setEditingAccount(null)
    setEditForm(emptyForm)
    setEditErrors({})
    setMessage({ type: 'success', text: 'Staff account updated successfully.' })
  }

  function startEdit(account: StaffAccount) {
    setEditingAccount(account)
    setConfirmDeactivateId(null)
    setEditErrors({})
    setMessage(null)
    setEditForm({
      full_name: account.full_name,
      email: account.email,
      username: account.username,
      temporaryPassword: '',
    })
  }

  function closeEditModal() {
    setEditingAccount(null)
    setEditForm(emptyForm)
    setEditErrors({})
  }

  function deactivateStaff(id: number) {
    /*
      TODO: Replace local deactivate with PATCH /api/charities/staff/:id/deactivate.
      Deactivation is safer than deletion because staff action history can be retained.
    */
    setStaff((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'inactive' } : item)))
    setConfirmDeactivateId(null)
    setMessage({ type: 'success', text: 'Staff account deactivated successfully.' })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10" style={{ background: C.linen }}>
      <div className="max-w-6xl mx-auto">
        <Header />
        {!canManageStaff && <Alert msg={{ type: 'error', text: 'Your organisation account must be approved before you can manage staff accounts.' }} />}
        {message && <Alert msg={message} />}

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 mt-6">
          <div className="space-y-6">
            <Card icon={<UserPlus className="w-5 h-5" />} title="Create staff account" desc="Add charity staff who can help manage campaigns and auction listings.">
              <form onSubmit={saveCreateStaff} noValidate className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <TextInput label="Full name" value={createForm.full_name} error={createErrors.full_name} disabled={!canManageStaff} autoComplete="name" onChange={(e) => updateCreateField('full_name', e.target.value)} />
                  <TextInput label="Work email" type="email" value={createForm.email} error={createErrors.email} disabled={!canManageStaff} autoComplete="email" onChange={(e) => updateCreateField('email', e.target.value)} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <TextInput label="Username" value={createForm.username} error={createErrors.username} disabled={!canManageStaff} autoComplete="username" onChange={(e) => updateCreateField('username', e.target.value)} />
                  <TextInput label="Temporary password" type="password" value={createForm.temporaryPassword} error={createErrors.temporaryPassword} disabled={!canManageStaff} autoComplete="new-password" note="Staff should change this after first login." onChange={(e) => updateCreateField('temporaryPassword', e.target.value)} />
                </div>
                <div className="flex justify-end pt-2">
                  <PrimaryButton disabled={!canManageStaff} icon={<Plus className="w-4 h-4" />} label="Create staff account" />
                </div>
              </form>
            </Card>

            <Card icon={<Users className="w-5 h-5" />} title="Charity staff accounts" desc="View active and inactive staff linked to your organisation.">
              <SearchBox value={search} onChange={setSearch} />
              <StaffTable
                staff={filteredStaff}
                canManageStaff={canManageStaff}
                confirmDeactivateId={confirmDeactivateId}
                onEdit={startEdit}
                onConfirmDeactivate={deactivateStaff}
                onAskDeactivate={setConfirmDeactivateId}
                onCancelDeactivate={() => setConfirmDeactivateId(null)}
              />
            </Card>
          </div>

          <aside className="space-y-6">
            <OverviewCard total={staff.length} active={activeCount} inactive={inactiveCount} />
            <InfoCard title="Account approval required" tone="warning">
              Only approved charity organisation accounts can create, edit or deactivate staff accounts.
            </InfoCard>
            {/* TODO: Remove this reminder after backend staff management routes are implemented. */}
            <InfoCard title="Security reminder" tone="success">
              Staff account changes may require verification and activity logging before they are saved.
            </InfoCard>
          </aside>
        </div>
      </div>

      {editingAccount && (
        <EditStaffModal form={editForm} errors={editErrors} onClose={closeEditModal} onSave={saveEditStaff} onChange={updateEditField} />
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold" style={{ color: C.slate }}>Manage Staff Accounts</h1>
      <p className="text-sm mt-2 max-w-2xl" style={{ color: C.muted }}>Create, update and deactivate charity staff accounts linked to your organisation.</p>
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-5 relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.beige }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search by name, email or username" style={inputSt(false, { paddingLeft: '40px' })} />
    </div>
  )
}

function StaffTable(props: {
  staff: StaffAccount[]
  canManageStaff: boolean
  confirmDeactivateId: number | null
  onEdit: (account: StaffAccount) => void
  onConfirmDeactivate: (id: number) => void
  onAskDeactivate: (id: number) => void
  onCancelDeactivate: () => void
}) {
  const { staff, canManageStaff, confirmDeactivateId, onEdit, onConfirmDeactivate, onAskDeactivate, onCancelDeactivate } = props

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
            <tr key={account.id} className="border-b last:border-b-0" style={{ borderColor: C.linen }}>
              <td className="py-4 pr-4">
                <p className="font-semibold" style={{ color: C.slate }}>{account.full_name}</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>{account.email}</p>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>@{account.username}</p>
              </td>
              <td className="py-4 pr-4"><StatusBadge status={account.status} /></td>
              <td className="py-4 pr-4" style={{ color: C.muted }}>{formatDate(account.last_login)}</td>
              <td className="py-4 pr-4">
                <StaffActions
                  account={account}
                  canManageStaff={canManageStaff}
                  isConfirming={confirmDeactivateId === account.id}
                  onEdit={onEdit}
                  onConfirmDeactivate={onConfirmDeactivate}
                  onAskDeactivate={onAskDeactivate}
                  onCancelDeactivate={onCancelDeactivate}
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
  onEdit: (account: StaffAccount) => void
  onConfirmDeactivate: (id: number) => void
  onAskDeactivate: (id: number) => void
  onCancelDeactivate: () => void
}) {
  const { account, canManageStaff, isConfirming, onEdit, onConfirmDeactivate, onAskDeactivate, onCancelDeactivate } = props
  const disabled = !canManageStaff || account.status === 'inactive'

  if (isConfirming) {
    return (
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onConfirmDeactivate(account.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: C.danger }}>Confirm</button>
        <button type="button" onClick={onCancelDeactivate} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>Cancel</button>
      </div>
    )
  }

  return (
    <div className="flex justify-end gap-2">
      <StaffActionButton label="Edit" icon={<Edit3 className="w-3.5 h-3.5" />} disabled={disabled} onClick={() => onEdit(account)} />
      <StaffActionButton label="Deactivate" icon={<Power className="w-3.5 h-3.5" />} danger disabled={disabled} onClick={() => onAskDeactivate(account.id)} />
    </div>
  )
}

function EditStaffModal({ form, errors, onClose, onSave, onChange }: {
  form: StaffForm
  errors: StaffFormErrors
  onClose: () => void
  onSave: (e: FormEvent) => void
  onChange: (field: StaffField, value: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(45, 58, 58, 0.45)' }}>
      <section className="w-full max-w-2xl bg-white rounded-2xl shadow-xl" style={{ border: `1px solid ${C.beige}` }}>
        <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: C.beige }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.slate }}>Edit staff account</h2>
            <p className="text-sm mt-0.5" style={{ color: C.muted }}>Update staff account details and permissions.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-[#F7F5F0]" aria-label="Close edit modal">
            <X className="w-5 h-5" style={{ color: C.muted }} />
          </button>
        </div>

        <form onSubmit={onSave} noValidate className="px-6 py-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Full name" value={form.full_name} error={errors.full_name} autoComplete="name" onChange={(e) => onChange('full_name', e.target.value)} />
            <TextInput label="Work email" type="email" value={form.email} error={errors.email} autoComplete="email" onChange={(e) => onChange('email', e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Username" value={form.username} error={errors.username} autoComplete="username" onChange={(e) => onChange('username', e.target.value)} />
          </div>
          <p className="text-xs" style={{ color: C.muted }}>Password changes should be handled separately through a reset-password flow.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: C.beige, color: C.slate }}>Cancel</button>
            <PrimaryButton icon={<Edit3 className="w-4 h-4" />} label="Save changes" />
          </div>
        </form>
      </section>
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

function StatusBadge({ status }: { status: StaffStatus }) {
  return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold" style={statusStyle(status)}>{statusText(status)}</span>
}

function IconBox({ children }: { children: ReactNode }) {
  return <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.emeraldLight, color: C.emerald }}>{children}</div>
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center justify-between gap-3"><span style={{ color: C.muted }}>{label}</span><span className="font-semibold" style={{ color }}>{value}</span></div>
}