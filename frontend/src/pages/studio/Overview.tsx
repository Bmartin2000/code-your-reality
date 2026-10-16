import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, FlaskConical, LayoutTemplate, Video } from 'lucide-react'
import { motion } from 'motion/react'
import { Page } from '../../components/studio/Page'
import { CompilerCore } from '../../components/studio/CompilerCore'
import { ProjectList } from '../../components/studio/ProjectList'
import { EmptyState, ErrorState, LoadingState, TechnicalLabel } from '../../components/ui/primitives'
import { ButtonLink } from '../../components/ui/Button'
import { useApps, useCapabilities, useProjects } from '../../lib/queries'
import { relativeTime } from '../../lib/format'

const PATHS = [
  {
    to: '/demo',
    icon: FlaskConical,
    eyebrow: 'Path A · no model required',
    title: 'Guided sample',
    body: 'Walk through a predefined equipment-rental example: review its rules, compile it, operate the result.',
  },
  {
    to: '/studio/new',
    icon: Video,
    eyebrow: 'Path B · local AI model',
    title: 'Analyze my workflow',
    body: 'Upload or record a short demonstration. A local open-weight model proposes the structure for you to verify.',
  },
  {
    to: '/studio/new?mode=manual',
    icon: LayoutTemplate,
    eyebrow: 'Manual',
    title: 'Define by hand',
    body: 'Start from the rental template or a blank workflow when no recording or model is available.',
  },
]

export default function Overview() {
  const projects = useProjects()
  const apps = useApps()
  const caps = useCapabilities()
  const navigate = useNavigate()
  const latest = projects.data?.[0]

  return (
    <Page>
      <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-6">
          <TechnicalLabel>Studio · overview</TechnicalLabel>
          <h1 className="display mt-4 text-[clamp(2.4rem,4.6vw,4.25rem)] leading-[0.98]">
            What did you <span className="serif-accent text-accent">observe</span> today?
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted">
            Every compilation starts with evidence of real work and ends with an application you can operate. Choose where to begin.
          </p>
        </div>
        <div className="lg:col-span-6">
          <CompilerCore
            layers={latest?.status === 'ready' ? ['done', 'done', 'done', 'done'] : ['idle', 'idle', 'idle', 'idle']}
            className="mx-auto max-w-[620px] opacity-90"
            label="Compiler core: input, interpretation, logic, execution"
          />
        </div>
      </div>

      <div className="mt-12 grid gap-3 md:grid-cols-3">
        {PATHS.map((p, i) => (
          <motion.button
            key={p.title}
            onClick={() => navigate(p.to)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="surface group flex flex-col rounded-2xl p-5 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-ink-950 text-fg-muted group-hover:text-accent">
                <p.icon className="size-4" />
              </span>
              <ArrowUpRight className="size-4 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>
            <TechnicalLabel className="mt-6">{p.eyebrow}</TechnicalLabel>
            <span className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-fg">{p.title}</span>
            <span className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</span>
          </motion.button>
        ))}
      </div>

      {caps.data && !(caps.data.model.reachable && caps.data.model.installed) && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-warning/25 bg-warning/[0.04] px-4 py-3 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="text-warning">AI analysis is unavailable.</span> {caps.data.model.error} The guided sample and manual definitions still work.
          </span>
          <Link to="/studio/settings" className="shrink-0 text-fg underline-offset-4 hover:underline">
            Engine details
          </Link>
        </div>
      )}

      <div className="mt-14 grid gap-10 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-labelledby="recent-projects">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="recent-projects" className="text-lg font-semibold tracking-[-0.02em]">
              Recent projects
            </h2>
            <Link to="/studio/projects" className="text-sm text-fg-muted hover:text-fg">
              All projects
            </Link>
          </div>
          {projects.isLoading ? (
            <LoadingState />
          ) : projects.isError ? (
            <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
          ) : projects.data!.length === 0 ? (
            <EmptyState
              icon={<Video className="size-5" />}
              title="No projects yet"
              body="Start with the guided sample to see the full journey in about two minutes."
              action={
                <ButtonLink to="/demo" variant="primary" iconRight={<ArrowRight className="size-4" />}>
                  Start the guided sample
                </ButtonLink>
              }
            />
          ) : (
            <ProjectList projects={projects.data!.slice(0, 6)} />
          )}
        </section>

        <section className="lg:col-span-4" aria-labelledby="recent-apps">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="recent-apps" className="text-lg font-semibold tracking-[-0.02em]">
              Live applications
            </h2>
            <Link to="/studio/apps" className="text-sm text-fg-muted hover:text-fg">
              View all
            </Link>
          </div>
          {apps.isLoading ? (
            <LoadingState />
          ) : apps.isError ? (
            <ErrorState error={apps.error} onRetry={() => apps.refetch()} />
          ) : apps.data!.length === 0 ? (
            <EmptyState title="Nothing compiled yet" body="Applications appear here once a verified workflow compiles." />
          ) : (
            <ul className="space-y-2">
              {apps.data!.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link to={`/apps/${a.slug}`} className="surface group flex items-center justify-between rounded-xl px-4 py-3 hover:border-line">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
                      <TechnicalLabel>
                        {a.is_sample ? 'Sample · ' : ''}v{a.workflow_version} · {relativeTime(a.updated_at)}
                      </TechnicalLabel>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-fg-subtle group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  )
}
