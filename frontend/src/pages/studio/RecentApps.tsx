import { Link } from 'react-router-dom'
import { AppWindow, ArrowUpRight } from 'lucide-react'
import { Page } from '../../components/studio/Page'
import { EmptyState, ErrorState, LoadingState, SectionHeading, TechnicalLabel } from '../../components/ui/primitives'
import { ButtonLink } from '../../components/ui/Button'
import { useApps } from '../../lib/queries'
import { relativeTime } from '../../lib/format'

export default function RecentApps() {
  const { data, isLoading, isError, error, refetch } = useApps()
  return (
    <Page>
      <SectionHeading eyebrow="Studio · applications" title="Recent applications" description="Applications compiled from verified workflows. Each one runs on the schema-driven runtime with its own persistent records." />
      <div className="mt-8">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data!.length === 0 ? (
          <EmptyState
            icon={<AppWindow className="size-5" />}
            title="No applications yet"
            body="Compile a verified workflow and it will appear here."
            action={<ButtonLink to="/demo" variant="primary">Try the guided sample</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data!.map((a) => (
              <li key={a.id}>
                <Link to={`/apps/${a.slug}`} className="surface group flex h-full flex-col rounded-2xl p-5 hover:border-line">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{a.name}</span>
                    <ArrowUpRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {a.entities.map((e) => (
                      <span key={e.key} className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-muted">
                        {e.plural_label}
                      </span>
                    ))}
                  </div>
                  <TechnicalLabel className="mt-auto pt-6">
                    {a.is_sample ? 'Sample data · ' : ''}workflow v{a.workflow_version} · updated {relativeTime(a.updated_at)}
                  </TechnicalLabel>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  )
}
