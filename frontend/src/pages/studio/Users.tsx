import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus } from 'lucide-react'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/overlays'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { api, fieldErrors, type AuthUser } from '../../lib/api'
import { qk, useMe, useUsers } from '../../lib/queries'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'

const EMPTY = { name: '', email: '', password: '', role: 'user' as 'admin' | 'user' }

/** Admin page: everyone who can sign in to the Studio. */
export default function Users() {
  const users = useUsers()
  const me = useMe()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<AuthUser | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const myId = me.data?.user?.id

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Enter a name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.'
    if (form.password.length < 8) errs.password = 'Use at least 8 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const user = await api.createUser({ ...form, name: form.name.trim(), email: form.email.trim() })
      qc.invalidateQueries({ queryKey: qk.users })
      toast.success(`${user.name} can now sign in`, 'Share the email and password with them in person or over a secure channel.')
      setForm(EMPTY)
    } catch (err) {
      const fields = fieldErrors(err)
      if (fields) setErrors(fields)
      else toast.error('Could not add the user', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setRole = async (u: AuthUser, role: 'admin' | 'user') => {
    try {
      await api.setUserRole(u.id, role)
      qc.invalidateQueries({ queryKey: qk.users })
    } catch (err) {
      toast.error('Could not change the role', (err as Error).message)
    }
  }

  const remove = async () => {
    if (!removing) return
    setRemoveBusy(true)
    try {
      await api.deleteUser(removing.id)
      qc.invalidateQueries({ queryKey: qk.users })
      toast.success(`${removing.name} was removed`)
      setRemoving(null)
    } catch (err) {
      toast.error('Could not remove the user', (err as Error).message)
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Users</h1>
      <p className="text-[16px] text-fg-muted">People who can sign in to the Studio. Admins can add and remove users.</p>

      <section className="rounded-3xl bg-ink-900 p-2">
        {users.isLoading ? (
          <LoadingState />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {users.data!.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">
                    {u.name} {u.id === myId && <span className="text-[13px] font-normal text-fg-subtle">(you)</span>}
                  </p>
                  <p className="truncate text-[14px] text-fg-muted">{u.email}</p>
                </div>
                <select
                  className="field-input !w-auto !py-2"
                  value={u.role}
                  aria-label={`Role of ${u.name}`}
                  disabled={u.id === myId}
                  onChange={(e) => setRole(u, e.target.value as 'admin' | 'user')}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <IconButton label={`Remove ${u.name}`} disabled={u.id === myId} onClick={() => setRemoving(u)} className={cn(u.id === myId && 'invisible')}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={add} noValidate className="rounded-3xl border border-line-soft bg-white p-6">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold">
          <UserPlus className="size-5 text-accent" /> Add a user
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Name</span>
            <input className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name || undefined} autoComplete="off" />
            {errors.name && <span className="mt-1 block text-[13px] text-error">{errors.name}</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Email</span>
            <input className="field-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email || undefined} autoComplete="off" />
            {errors.email && <span className="mt-1 block text-[13px] text-error">{errors.email}</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Password</span>
            <input className="field-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-invalid={!!errors.password || undefined} autoComplete="new-password" />
            {errors.password && <span className="mt-1 block text-[13px] text-error">{errors.password}</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Role</span>
            <select className="field-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <Button type="submit" variant="primary" className="mt-6" loading={busy} icon={<UserPlus className="size-4" />}>
          Add user
        </Button>
      </form>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Remove ${removing?.name ?? 'this user'}?`}
        description="They will be signed out and can no longer use the Studio. Projects and apps stay."
        confirmLabel="Remove"
        destructive
        loading={removeBusy}
      />
    </div>
  )
}
