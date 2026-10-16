import { Link } from 'react-router-dom'
import { ArrowUpRight, FlaskConical, PenLine, Video } from 'lucide-react'
import type { ProjectSummary } from '../../lib/types'
import { StatusIndicator, TechnicalLabel } from '../ui/primitives'
import { relativeTime } from '../../lib/format'

const ORIGIN = {
  sample: { label: 'Guided sample', icon: FlaskConical },
  analysis: { label: 'Recorded analysis', icon: Video },
  manual: { label: 'Manual definition', icon: PenLine },
}

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-ink-925">
      {projects.map((p) => {
        const o = ORIGIN[p.origin]
        return (
          <li key={p.id}>
            <Link
              to={`/studio/projects/${p.id}`}
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-ink-900 sm:grid-cols-[minmax(0,1fr)_170px_140px_24px] sm:px-5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-fg">{p.name}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-subtle">
                  <o.icon className="size-3.5" aria-hidden />
                  {o.label}
                  {p.workflow_version ? <span className="font-mono text-[11px]"> · v{p.workflow_version}</span> : null}
                </span>
              </span>
              <StatusIndicator status={p.status} className="justify-self-end sm:justify-self-start" />
              <TechnicalLabel className="hidden sm:block">{relativeTime(p.updated_at)}</TechnicalLabel>
              <ArrowUpRight className="hidden size-4 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg sm:block" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
