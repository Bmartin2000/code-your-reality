import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppWindow, Copy, Download, ExternalLink, MessageSquareText, Palette, Plus, Search, Video, Wand2 } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/primitives'
import { ButtonLink } from '../../components/ui/Button'
import { SectionTile } from '../../components/app/SectionBadge'
import { api } from '../../lib/api'
import { useAccount, useApps } from '../../lib/queries'
import { relativeTime } from '../../lib/format'
import { toast } from '../../lib/toast'
import { appPageUrl } from '../../lib/base'

const WAYS = [
  { icon: MessageSquareText, title: 'Ask in one sentence', body: '“Customers should also give a phone number.” The AI prepares the change, you approve it.' },
  { icon: Video, title: 'Record again', body: 'When the process changed a lot. Your records stay.' },
  { icon: Palette, title: 'Rename & recolour', body: 'Call the sections what your team calls them. Inside the app: Improve this app.' },
]

/** All apps of the workspace in one place: open, change, share, download. */
export default function RecentApps() {
  const apps = useApps()
  const account = useAccount()
  const [q, setQ] = useState('')
  const plan = account.data?.plan
  const used = account.data?.usage.apps ?? 0
  const list = (apps.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(appPageUrl(`/apps/${slug}`))
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">My apps</h1>
          <p className="mt-2 text-[17px] text-fg-muted">
            {plan ? (
              <>
                {used} of {plan.apps} {plan.apps === 1 ? 'app' : 'apps'} on {plan.name}
                {used >= plan.apps && plan.id === 'free' && (
                  <>
                    {' · '}
                    <Link to="/studio/upgrade?plan=plus" className="font-medium text-accent">
                      Plus allows 5
                    </Link>
                  </>
                )}
              </>
            ) : (
              'Everything you built, in one place.'
            )}
          </p>
        </div>
        <ButtonLink to="/studio/new" variant="primary" icon={<Plus className="size-4" />}>
          New app
        </ButtonLink>
      </div>

      <section aria-labelledby="change-title" className="mt-8 rounded-3xl bg-gradient-to-br from-[#00A1FF] to-[#0077BE] p-6 text-white sm:p-7">
        <h2 id="change-title" className="flex items-center gap-2 text-[20px] font-semibold">
          <Wand2 className="size-5" /> Your app grows with your business
        </h2>
        <p className="mt-1 text-[15px] text-white/85">A finished app is never set in stone. Three ways to change it; every change waits for your approval and your app keeps running meanwhile.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {WAYS.map((w) => (
            <li key={w.title} className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
              <w.icon className="size-5" />
              <p className="mt-2 text-[15px] font-semibold">{w.title}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-white/85">{w.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {(apps.data?.length ?? 0) > 3 && (
        <label className="relative mt-8 block sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input className="field-input pl-9" placeholder="Search apps" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search apps" />
        </label>
      )}

      <div className="mt-6">
        {apps.isLoading ? (
          <LoadingState />
        ) : apps.isError ? (
          <ErrorState error={apps.error} onRetry={() => apps.refetch()} />
        ) : apps.data!.length === 0 ? (
          <EmptyState
            icon={<AppWindow className="size-5" />}
            title="No apps yet"
            body="Record how you work and your first app appears here."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to="/studio/new" variant="primary">
                  Record a process
                </ButtonLink>
                <ButtonLink to="/demo">Try the demo</ButtonLink>
              </div>
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((a) => (
              <li key={a.id} className="flex flex-col rounded-3xl border border-line-soft bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[19px] font-semibold tracking-[-0.01em]">{a.name}</h2>
                    <p className="mt-0.5 text-[13.5px] text-fg-muted">
                      {a.record_count} records · version {a.workflow_version}
                      {a.last_activity_at ? ` · active ${relativeTime(a.last_activity_at)}` : ''}
                      {a.is_sample ? ' · example' : ''}
                    </p>
                  </div>
                  <ButtonLink to={`/apps/${a.slug}`} variant="primary" size="sm" iconRight={<ExternalLink className="size-3.5" />}>
                    Open
                  </ButtonLink>
                </div>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Sections">
                  {a.entities.map((e) => (
                    <li key={e.key} className="flex items-center gap-2 rounded-full bg-ink-900 py-1 pl-1 pr-3 text-[13px] font-medium">
                      <SectionTile entity={e} size="sm" />
                      {e.plural_label}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line-soft pt-4">
                  <Link to={`/studio/projects/${a.project_id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-[14px] font-medium text-accent hover:bg-accent hover:text-white">
                    <Wand2 className="size-4" /> Change
                  </Link>
                  <button onClick={() => copy(a.slug)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium text-fg-muted ring-1 ring-line-soft hover:text-fg">
                    <Copy className="size-4" /> Copy link
                  </button>
                  <a href={api.exportUrl(a.slug)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium text-fg-muted ring-1 ring-line-soft hover:text-fg">
                    <Download className="size-4" /> Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
