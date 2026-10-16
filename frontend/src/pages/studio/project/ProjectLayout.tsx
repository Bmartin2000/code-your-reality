import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, FlaskConical, MoreHorizontal, Trash2 } from 'lucide-react'
import { useProject, qk } from '../../../lib/queries'
import type { ProjectDetail, ProjectStatus } from '../../../lib/types'
import { ErrorState, LoadingState } from '../../../components/ui/primitives'
import { ConfirmDialog } from '../../../components/ui/overlays'
import { api } from '../../../lib/api'
import { toast } from '../../../lib/toast'
import { cn } from '../../../lib/cn'

export function useProjectContext() {
  return useOutletContext<{ project: ProjectDetail }>()
}

export const PLAIN_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  draft: { label: 'Not started', cls: 'text-fg-subtle' },
  uploaded: { label: 'Video saved', cls: 'text-fg-subtle' },
  analyzing: { label: 'Working…', cls: 'text-accent' },
  needs_review: { label: 'Waiting for your check', cls: 'text-warning' },
  verified: { label: 'Confirmed', cls: 'text-success' },
  compiling: { label: 'Building…', cls: 'text-accent' },
  ready: { label: 'Live', cls: 'text-success' },
  failed: { label: 'Needs attention', cls: 'text-error' },
}

const ADVANCED = [
  { to: 'advanced', label: 'Workspace' },
  { to: 'review', label: 'Verify' },
  { to: 'compile', label: 'Compile' },
  { to: 'evidence', label: 'Evidence & history' },
]

export default function ProjectLayout() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const { data: project, isLoading, isError, error, refetch } = useProject(id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading" />
  if (isError || !project)
    return (
      <div className="p-6">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    )

  const advanced = ADVANCED.some((a) => pathname.endsWith(`/${a.to}`))
  const status = PLAIN_STATUS[project.status]

  const doDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteProject(project.id)
      qc.removeQueries({ queryKey: qk.project(project.id) })
      qc.invalidateQueries({ queryKey: qk.projects })
      qc.invalidateQueries({ queryKey: qk.apps })
      toast.success('App deleted', 'Its videos, versions and records were removed.')
      navigate('/studio')
    } catch (e) {
      toast.error('Could not delete', (e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="border-b border-line-soft bg-ink-950">
        <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-4 sm:px-6', advanced ? 'max-w-[1760px]' : 'max-w-[720px]')}>
          <div className="min-w-0">
            <Link to={advanced ? `/studio/projects/${project.id}` : '/studio'} className="inline-flex items-center text-[14px] text-accent">
              <ChevronLeft className="-ml-1 size-4" /> {advanced ? 'Simple view' : 'Home'}
            </Link>
            <h1 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]">{project.workflow?.definition.name ?? project.name}</h1>
            <p className="mt-0.5 flex items-center gap-2 text-[14px]">
              <span className={status.cls}>{status.label}</span>
              {project.origin === 'sample' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[12px] font-medium text-warning" title="Prepared example data. No AI was used.">
                  <FlaskConical className="size-3" /> Example
                </span>
              )}
            </p>
          </div>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="inline-flex size-10 items-center justify-center rounded-full bg-ink-900 text-fg-muted hover:text-fg" aria-label="More actions" aria-expanded={menu}>
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="surface-raised absolute right-0 z-20 mt-2 w-60 rounded-2xl p-1.5">
                  {[
                    ['advanced', 'Advanced editor'],
                    ['evidence', 'Evidence & history'],
                  ].map(([to, label]) => (
                    <Link key={to} onClick={() => setMenu(false)} to={`/studio/projects/${project.id}/${to}`} className="block rounded-xl px-3 py-2.5 text-[15px] hover:bg-ink-850">
                      {label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      setMenu(false)
                      setConfirmDelete(true)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] text-error hover:bg-error/10"
                  >
                    <Trash2 className="size-4" /> Delete app
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {advanced && (
          <nav className="mx-auto flex max-w-[1760px] gap-1 overflow-x-auto px-4 pb-3 sm:px-6" aria-label="Advanced tools">
            {ADVANCED.map((a) => (
              <NavLink key={a.to} to={`/studio/projects/${project.id}/${a.to}`} className={({ isActive }) => cn('shrink-0 rounded-full px-3.5 py-1.5 text-[14px]', isActive ? 'bg-fg text-ink-900' : 'text-fg-muted hover:bg-ink-850')}>
                {a.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      <Outlet context={{ project }} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        destructive
        title="Delete this app?"
        description={<>This permanently removes the videos, every version, the history and{project.app_slug ? ' the live app with all its records' : ' everything else'}. This can’t be undone.</>}
        confirmLabel="Delete app"
      />
    </div>
  )
}
