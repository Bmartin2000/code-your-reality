import { Link } from 'react-router-dom'
import { ChevronRight, ExternalLink, FlaskConical, Plus } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { useProjects } from '../../lib/queries'
import { relativeTime } from '../../lib/format'
import { PLAIN_STATUS } from './project/ProjectLayout'

export default function Overview() {
  const projects = useProjects()

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Your apps</h1>
      <p className="mt-2 text-[17px] text-fg-muted">Every app starts with a short video of how you work.</p>

      <Link to="/studio/new" className="mt-8 flex items-center gap-4 rounded-3xl bg-accent p-5 text-on-accent transition-transform active:scale-[0.99]">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/20">
          <Plus className="size-6" />
        </span>
        <span className="flex-1">
          <span className="block text-[19px] font-semibold">New app</span>
          <span className="block text-[15px] opacity-85">Record a process with your camera</span>
        </span>
        <ChevronRight className="size-5 opacity-80" />
      </Link>

      <section className="mt-10" aria-labelledby="list-title">
        <h2 id="list-title" className="sr-only">
          Apps
        </h2>
        {projects.isLoading ? (
          <LoadingState />
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
        ) : projects.data!.length === 0 ? (
          <div className="rounded-3xl bg-ink-900 p-8 text-center">
            <p className="text-[17px] font-semibold">No apps yet</p>
            <p className="mt-1 text-[15px] text-fg-muted">Not ready to record? See how it works with a prepared example.</p>
            <Link to="/demo" className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
              <FlaskConical className="size-4" /> Open the demo
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-3xl bg-ink-900">
            {projects.data!.map((p) => {
              const st = PLAIN_STATUS[p.status]
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-4">
                  <Link to={`/studio/projects/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-medium">{p.workflow_name ?? p.name}</span>
                    <span className="mt-0.5 block text-[14px]">
                      <span className={st.cls}>{st.label}</span>
                      <span className="text-fg-subtle"> · {relativeTime(p.updated_at)}</span>
                      {p.origin === 'sample' && <span className="text-fg-subtle"> · example</span>}
                    </span>
                  </Link>
                  {p.app_slug && (
                    <Link to={`/apps/${p.app_slug}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-3.5 text-[14px] font-medium text-accent">
                      Open <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                  <Link to={`/studio/projects/${p.id}`} aria-label={`Details of ${p.name}`} className="text-fg-subtle">
                    <ChevronRight className="size-5" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-center text-[15px] text-fg-muted">
        Want to see the whole journey first?{' '}
        <Link to="/demo" className="text-accent">
          Try the demo
        </Link>
      </p>
    </div>
  )
}
