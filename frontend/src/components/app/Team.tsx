import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Lock, Trash2, UserPlus } from 'lucide-react'
import { api, setAppKey } from '../../lib/api'
import { ErrorState, LoadingState } from '../ui/primitives'
import { Button } from '../ui/Button'
import { PlusGate } from '../studio/PlusGate'
import { toast } from '../../lib/toast'
import type { AppMember } from '../../lib/types'
import { appLink } from '../../lib/config'

const ROLE_INFO: Record<AppMember['role'], { label: string; can: string }> = {
  owner: { label: 'Owner', can: 'Everything, including team and connections' },
  manager: { label: 'Manager', can: 'Add, edit, move records; see reports' },
  staff: { label: 'Staff', can: 'Add records and move them along' },
  viewer: { label: 'Viewer', can: 'Look only' },
}

function personalLink(slug: string, key: string) {
  return appLink(`/apps/${slug}?key=${key}`)
}

export function Team({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ['app-data', slug, 'team'], queryFn: () => api.team(slug) })
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [role, setRole] = useState<'manager' | 'staff' | 'viewer'>('staff')
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['app-data', slug, 'team'] })
    qc.invalidateQueries({ queryKey: ['app', slug] })
  }

  if (q.isLoading) return <LoadingState />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const t = q.data!

  const copy = (key: string) => navigator.clipboard.writeText(personalLink(slug, key)).then(() => toast.success('Personal link copied'), () => toast.error('Copy failed'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-[clamp(1.8rem,3vw,2.4rem)] leading-[1.08]">Team</h1>
        <p className="mt-1 text-[15px] text-fg-muted">Give colleagues their own access, with only the rights they need.</p>
      </div>
      {!t.unlocked ? (
        <PlusGate title="Bring your team in" body="With Plus each colleague gets a personal link and a role: manager, staff or view-only. The server checks every action against the role." points={Object.values(ROLE_INFO).map((r) => `${r.label}: ${r.can}`)} />
      ) : t.access_mode === 'open' ? (
        <section className="rounded-3xl bg-ink-900 p-6">
          <p className="text-[16px] leading-relaxed text-fg-muted">Right now anyone with the app’s link can use it. Make it private to give each person their own link and role.</p>
          <Button
            variant="primary"
            className="mt-4"
            loading={busy === 'enable'}
            icon={<Lock className="size-4" />}
            onClick={async () => {
              setBusy('enable')
              try {
                const r = await api.enableTeam(slug)
                setAppKey(slug, r.owner_key)
                refresh()
                toast.success('Your app is now private', 'You’re signed in as the owner on this device.')
              } catch (e) {
                toast.error('Could not change access', (e as Error).message)
              } finally {
                setBusy(null)
              }
            }}
          >
            Make private and add people
          </Button>
        </section>
      ) : (
        <>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-3xl bg-ink-900">
            {t.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 font-semibold text-accent">{m.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-[13px] text-fg-subtle">
                    {ROLE_INFO[m.role].label} · {ROLE_INFO[m.role].can}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => copy(m.key)}>
                  Copy link
                </Button>
                {m.role !== 'owner' && (
                  <Button size="sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => api.removeMember(slug, m.id).then(refresh)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-fg-subtle">
            {t.members.length} of {t.seats} people on your plan. Each person opens the app with their own link; keep links private.
          </p>
          <section className="rounded-3xl bg-ink-900 p-5">
            <h2 className="text-[17px] font-semibold">Add a person</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
              <input className="field-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
              <select className="field-input" value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Role">
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button
                variant="primary"
                loading={busy === 'add'}
                disabled={!name.trim()}
                icon={<UserPlus className="size-4" />}
                onClick={async () => {
                  setBusy('add')
                  try {
                    const m = await api.addMember(slug, name.trim(), role)
                    setName('')
                    refresh()
                    copy(m.key)
                  } catch (e) {
                    toast.error('Could not add the person', (e as Error).message)
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                Add
              </Button>
            </div>
            <p className="mt-2 text-[13px] text-fg-subtle">{ROLE_INFO[role].can}.</p>
          </section>
          <button
            className="text-[14px] text-fg-subtle underline-offset-4 hover:underline"
            onClick={() => api.disableTeam(slug).then(() => (refresh(), toast.info('Anyone with the link can use the app again')))}
          >
            Make the app open again
          </button>
        </>
      )}
    </div>
  )
}
