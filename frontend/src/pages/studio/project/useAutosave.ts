import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../../lib/api'
import { setProjectCache } from '../../../lib/queries'
import { useWorkspace } from '../../../lib/workspace'
import { workflowSchema, type WorkflowDefinition } from '../../../lib/workflow-schema'
import type { ProjectDetail } from '../../../lib/types'
import { toast } from '../../../lib/toast'

export type SaveState = { kind: 'saved' } | { kind: 'pending' } | { kind: 'saving' } | { kind: 'invalid'; message: string } | { kind: 'error'; message: string }

/** Loads the latest server definition into the workspace and saves local edits as new versions. */
export function useWorkflowSync(project: ProjectDetail) {
  const qc = useQueryClient()
  const { draft, revision, savedRevision, baseVersion, projectId, load, acceptServer } = useWorkspace()
  const [state, setState] = useState<SaveState>({ kind: 'saved' })
  const inFlight = useRef(false)
  const wf = project.workflow!

  useEffect(() => {
    const ws = useWorkspace.getState()
    const clean = ws.revision === ws.savedRevision
    if (ws.projectId !== project.id || (wf.version > ws.baseVersion && clean)) {
      load(project.id, wf.definition, wf.version)
      setState({ kind: 'saved' })
    }
  }, [project.id, wf.version, wf.definition, load])

  useEffect(() => {
    if (!draft || projectId !== project.id || revision === savedRevision) return
    setState({ kind: 'pending' })
    const t = window.setTimeout(async () => {
      if (inFlight.current) return
      const parsed = workflowSchema.safeParse(draft)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        setState({ kind: 'invalid', message: `${issue.path.join('.')}: ${issue.message}` })
        return
      }
      inFlight.current = true
      setState({ kind: 'saving' })
      const rev = revision
      try {
        const p = await api.saveWorkflow(project.id, parsed.data as WorkflowDefinition, baseVersion)
        acceptServer(p.workflow!.definition, p.workflow!.version, rev)
        setProjectCache(qc, p)
        setState({ kind: 'saved' })
      } catch (e) {
        const err = e as ApiError
        if (err.status === 409) {
          toast.error('Workflow changed elsewhere', 'Reloaded the latest version.')
          const fresh = await api.project(project.id)
          load(project.id, fresh.workflow!.definition, fresh.workflow!.version)
          setProjectCache(qc, fresh)
          setState({ kind: 'saved' })
        } else {
          setState({ kind: 'error', message: err.message })
        }
      } finally {
        inFlight.current = false
      }
    }, 700)
    return () => window.clearTimeout(t)
  }, [draft, revision, savedRevision, baseVersion, project.id, projectId, acceptServer, load, qc])

  return state
}
