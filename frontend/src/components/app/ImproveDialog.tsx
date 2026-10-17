import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, LifeBuoy, MessageSquareText, Palette, Video } from 'lucide-react'
import { Dialog } from '../ui/overlays'
import { Button, ButtonLink } from '../ui/Button'
import { api, ApiError } from '../../lib/api'
import { qk, useMe } from '../../lib/queries'
import type { AppDetail, SectionColor } from '../../lib/types'
import { COLOR_KEYS, SECTION_COLORS } from '../../lib/sections'
import { SUPPORT_URL } from '../../lib/plans'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'
import { SectionTile } from './SectionBadge'

type Tab = 'change' | 'names' | 'help'

/** One place for everything an owner can do to a finished app: change it, rename it, get help. */
export function ImproveDialog({ app, open, onClose, initialTab = 'change' }: { app: AppDetail; open: boolean; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const tabs: { key: Tab; label: string; icon: typeof Check }[] = [
    { key: 'change', label: 'Change how it works', icon: MessageSquareText },
    { key: 'names', label: 'Names & colours', icon: Palette },
    { key: 'help', label: 'Help', icon: LifeBuoy },
  ]
  return (
    <Dialog open={open} onClose={onClose} wide title="Improve this app" description="Your app keeps running while you change it. Every change comes back to you for approval first.">
      <div role="tablist" aria-label="Improve this app" className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-ink-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium', tab === t.key ? 'bg-white text-fg shadow-sm' : 'text-fg-muted hover:text-fg')}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'change' && <ChangeTab app={app} onClose={onClose} />}
      {tab === 'names' && <NamesTab app={app} onClose={onClose} />}
      {tab === 'help' && <HelpTab />}
    </Dialog>
  )
}

function ChangeTab({ app, onClose }: { app: AppDetail; onClose: () => void }) {
  const me = useMe()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const project = `/studio/projects/${app.project_id}`

  if (!me.data?.user)
    return (
      <div className="rounded-2xl bg-ink-900 p-5 text-[15px]">
        <p>Changing how the app works happens in the Code Your Reality Studio.</p>
        <ButtonLink to={`/login?next=${encodeURIComponent(`/apps/${app.slug}`)}`} variant="primary" className="mt-4">
          Sign in to the Studio
        </ButtonLink>
      </div>
    )

  const submit = async () => {
    setBusy(true)
    try {
      await api.changeRequest(app.project_id, text.trim())
      toast.success('Working on your change', 'You’ll review it before it reaches the app.')
      onClose()
      navigate(project)
    } catch (e) {
      const err = e as ApiError
      toast.error('Could not start the change', err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line-soft p-4">
        <label htmlFor="change-text" className="flex items-center gap-2 text-[16px] font-semibold">
          <MessageSquareText className="size-5 text-accent" /> Describe a small change
        </label>
        <p className="mt-1 text-[14px] text-fg-muted">One sentence works best, e.g. “Customers should also give a phone number” or “Add a ‘Cleaning’ status for items”.</p>
        <textarea id="change-text" className="field-input mt-3 min-h-[96px]" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should change?" />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" loading={busy} disabled={text.trim().length < 8} onClick={submit}>
            Ask AI for this change
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to={`${project}/record`} onClick={onClose} className="flex gap-3 rounded-2xl border border-line-soft p-4 hover:border-accent">
          <Video className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block text-[15px] font-semibold">Record again</span>
            <span className="text-[13.5px] text-fg-muted">The process changed a lot? Film it again; your records are kept.</span>
          </span>
        </Link>
        <Link to={`${project}/advanced`} onClick={onClose} className="flex gap-3 rounded-2xl border border-line-soft p-4 hover:border-accent">
          <Palette className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block text-[15px] font-semibold">Edit in detail</span>
            <span className="text-[13.5px] text-fg-muted">Fields, statuses and rules, one by one, with the evidence from your video.</span>
          </span>
        </Link>
      </div>
    </div>
  )
}

function NamesTab({ app, onClose }: { app: AppDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(app.manifest.workflow.name)
  const [sections, setSections] = useState(() =>
    Object.fromEntries(app.manifest.entities.map((e) => [e.key, { label: e.label, plural_label: e.plural_label, color: (e.color ?? 'blue') as SectionColor }])),
  )
  const [busy, setBusy] = useState(false)
  const set = (key: string, patch: Partial<(typeof sections)[string]>) => setSections((s) => ({ ...s, [key]: { ...s[key], ...patch } }))

  const save = async () => {
    setBusy(true)
    try {
      await api.customizeApp(app.slug, { name: name.trim(), sections })
      await qc.invalidateQueries({ queryKey: qk.app(app.slug) })
      qc.invalidateQueries({ queryKey: qk.apps })
      toast.success('Names saved', 'Menus, lists, forms and reports use the new names.')
      onClose()
    } catch (e) {
      toast.error('Could not save the names', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-medium">App name</span>
        <input className="field-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-[14px] text-fg-muted">Sections are the main categories of your app. Rename them in your own words and give each a colour.</p>
      <ul className="space-y-3">
        {app.manifest.entities.map((e) => {
          const s = sections[e.key]
          return (
            <li key={e.key} className="rounded-2xl border border-line-soft p-4">
              <div className="flex items-center gap-3">
                <SectionTile entity={{ plural_label: s.plural_label || e.plural_label, color: s.color }} />
                <span className="text-[15px] font-semibold">{s.plural_label || e.plural_label}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-fg-muted">One</span>
                  <input className="field-input" aria-label={`${e.plural_label}: singular name`} value={s.label} maxLength={60} onChange={(ev) => set(e.key, { label: ev.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-fg-muted">Many (menu name)</span>
                  <input className="field-input" aria-label={`${e.plural_label}: menu name`} value={s.plural_label} maxLength={60} onChange={(ev) => set(e.key, { plural_label: ev.target.value })} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`${e.plural_label}: colour`}>
                {COLOR_KEYS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={s.color === c}
                    aria-label={SECTION_COLORS[c].name}
                    title={SECTION_COLORS[c].name}
                    onClick={() => set(e.key, { color: c })}
                    className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2', SECTION_COLORS[c].solid, s.color === c && 'ring-2 ring-fg')}
                  >
                    {s.color === c && <Check className="size-4" />}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save names
        </Button>
      </div>
    </div>
  )
}

function HelpTab() {
  return (
    <div className="space-y-3 text-[15px]">
      <div className="rounded-2xl bg-ink-900 p-5">
        <p className="font-semibold">Support by Integrint</p>
        <p className="mt-1 text-fg-muted">Not sure how to describe a change, or the AI misunderstood something? Real people help you get it right.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to="/studio/support" variant="primary">
            Help centre
          </ButtonLink>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-medium text-accent ring-1 ring-line-soft hover:bg-brand-50">
            Contact Integrint
          </a>
        </div>
      </div>
    </div>
  )
}
