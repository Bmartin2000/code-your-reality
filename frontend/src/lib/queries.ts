import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Job, ProjectDetail } from './types'

export const qk = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  job: (id: string) => ['job', id] as const,
  audit: (id: string) => ['audit', id] as const,
  apps: ['apps'] as const,
  app: (slug: string) => ['app', slug] as const,
  appData: (slug: string) => ['app-data', slug] as const,
  records: (slug: string, entity: string) => ['app-data', slug, 'records', entity] as const,
  record: (slug: string, entity: string, id: string) => ['app-data', slug, 'record', entity, id] as const,
  stats: (slug: string) => ['app-data', slug, 'stats'] as const,
  events: (slug: string) => ['app-data', slug, 'events'] as const,
  capabilities: ['capabilities'] as const,
  account: ['account'] as const,
  me: ['me'] as const,
  users: ['users'] as const,
}

const ACTIVE = new Set(['analyzing', 'compiling'])

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: qk.project(id ?? ''),
    queryFn: () => api.project(id!),
    enabled: !!id,
    // Poll while the backend reports a running job; stop as soon as it settles.
    refetchInterval: (q) => (q.state.data && ACTIVE.has(q.state.data.status) ? 900 : false),
  })
}

export function useJob(id: string | undefined | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: qk.job(id ?? ''),
    queryFn: async () => {
      const job = await api.job(id!)
      if (job.status === 'succeeded' || job.status === 'failed') {
        qc.invalidateQueries({ queryKey: qk.project(job.project_id) })
        qc.invalidateQueries({ queryKey: qk.projects })
      }
      return job
    },
    enabled: !!id,
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status
      return s === 'succeeded' || s === 'failed' ? false : 600
    },
  })
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: api.projects })
}

export function useApps() {
  return useQuery({ queryKey: qk.apps, queryFn: api.apps })
}

export function useCapabilities() {
  return useQuery({ queryKey: qk.capabilities, queryFn: () => api.capabilities(), staleTime: 30_000 })
}

export function setProjectCache(qc: ReturnType<typeof useQueryClient>, p: ProjectDetail) {
  qc.setQueryData(qk.project(p.id), p)
  qc.invalidateQueries({ queryKey: qk.projects })
}

export function useAccount() {
  return useQuery({ queryKey: qk.account, queryFn: api.account, staleTime: 10_000 })
}

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 60_000 })
}

export function useUsers() {
  return useQuery({ queryKey: qk.users, queryFn: api.users })
}
