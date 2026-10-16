import { useMemo, useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Page } from '../../components/studio/Page'
import { ProjectList } from '../../components/studio/ProjectList'
import { EmptyState, ErrorState, LoadingState, SectionHeading } from '../../components/ui/primitives'
import { ButtonLink } from '../../components/ui/Button'
import { useProjects } from '../../lib/queries'
import { cn } from '../../lib/cn'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'ready', label: 'Ready' },
  { key: 'failed', label: 'Failed' },
] as const

export default function Projects() {
  const { data, isLoading, isError, error, refetch } = useProjects()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [q, setQ] = useState('')

  const list = useMemo(
    () =>
      (data ?? []).filter((p) => (filter === 'all' || p.status === filter) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))),
    [data, filter, q],
  )

  return (
    <Page>
      <SectionHeading
        eyebrow="Studio · projects"
        title="Projects"
        description="Every observation, its reviewed workflow versions and the application it compiled into."
        actions={
          <ButtonLink to="/studio/new" variant="primary" icon={<Plus className="size-4" />}>
            New compilation
          </ButtonLink>
        }
      />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-full border border-line-soft bg-ink-925 p-1" role="tablist" aria-label="Filter projects">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn('h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors', filter === f.key ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:text-fg')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input className="field-input sm:max-w-xs" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
      </div>
      <div className="mt-5">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="size-5" />}
            title={data!.length ? 'No projects match' : 'No projects yet'}
            body={data!.length ? 'Try another filter or search term.' : 'Create a compilation to get started.'}
          />
        ) : (
          <ProjectList projects={list} />
        )}
      </div>
    </Page>
  )
}
