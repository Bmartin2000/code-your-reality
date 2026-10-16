import type {
  AppDetail,
  AppRecord,
  AppStats,
  AppSummary,
  AuditEvent,
  Capabilities,
  Effect,
  Job,
  ProjectDetail,
  ProjectSummary,
  RecordEvent,
  TranscriptSegment,
} from './types'
import type { WorkflowDefinition } from './workflow-schema'

export interface ApiErrorBody {
  message: string
  field_errors?: Record<string, string>
  rule?: { id: string; statement: string; kind: string; source: string }
  issues?: { severity: string; message: string; target_kind: string; target_id: string }[]
  details?: unknown
}

export class ApiError extends Error {
  status: number
  body: ApiErrorBody
  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.status = status
    this.body = body
  }
  get isNetwork() {
    return this.status === 0
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the Reality Compiler server. Check that the backend is running.' })
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const err = (json as { error?: ApiErrorBody } | null)?.error
    const fallback =
      res.status === 502 || res.status === 503 || res.status === 504
        ? 'The backend is not responding. Start it and try again.'
        : `Request failed (${res.status}).`
    throw new ApiError(res.status, err ?? { message: fallback })
  }
  return json as T
}

/** Upload with progress reporting (fetch has no upload progress). */
function upload(path: string, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<ProjectDetail> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let json: unknown = null
      try {
        json = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json as ProjectDetail)
      else reject(new ApiError(xhr.status, (json as { error?: ApiErrorBody })?.error ?? { message: `Upload failed (${xhr.status}).` }))
    }
    xhr.onerror = () => reject(new ApiError(0, { message: 'The upload was interrupted. Check your connection and try again.' }))
    xhr.onabort = () => reject(new ApiError(-1, { message: 'Upload cancelled.' }))
    signal?.addEventListener('abort', () => xhr.abort())
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export const api = {
  capabilities: (refresh = false) => request<Capabilities>('GET', `/api/system/capabilities${refresh ? '?refresh=true' : ''}`),

  projects: () => request<ProjectSummary[]>('GET', '/api/projects'),
  project: (id: string) => request<ProjectDetail>('GET', `/api/projects/${id}`),
  createProject: (name: string, narration = '') => request<ProjectDetail>('POST', '/api/projects', { name, narration }),
  createSample: () => request<ProjectDetail>('POST', '/api/projects/sample'),
  createManual: (name: string, template: 'rental' | 'blank') => request<ProjectDetail>('POST', '/api/projects/manual', { name, template }),
  convertToManual: (id: string, name: string, template: 'rental' | 'blank') =>
    request<ProjectDetail>('POST', `/api/projects/${id}/manual`, { name, template }),
  patchProject: (id: string, body: { name?: string; narration?: string }) => request<ProjectDetail>('PATCH', `/api/projects/${id}`, body),
  deleteProject: (id: string) => request<void>('DELETE', `/api/projects/${id}`),

  uploadMedia: (id: string, file: File, onProgress: (f: number) => void, signal?: AbortSignal) =>
    upload(`/api/projects/${id}/media`, file, onProgress, signal),
  deleteMedia: (id: string) => request<ProjectDetail>('DELETE', `/api/projects/${id}/media`),
  saveTranscript: (id: string, segments: TranscriptSegment[]) => request<ProjectDetail>('PUT', `/api/projects/${id}/transcript`, { segments }),

  analyze: (id: string) => request<Job>('POST', `/api/projects/${id}/analyze`),
  job: (id: string) => request<Job>('GET', `/api/jobs/${id}`),

  saveWorkflow: (id: string, definition: WorkflowDefinition, baseVersion: number) =>
    request<ProjectDetail>('PUT', `/api/projects/${id}/workflow`, { definition, base_version: baseVersion }),
  approve: (id: string) => request<ProjectDetail>('POST', `/api/projects/${id}/workflow/approve`),
  changeRequest: (id: string, instruction: string) => request<Job>('POST', `/api/projects/${id}/workflow/change-request`, { instruction }),
  compile: (id: string) => request<Job>('POST', `/api/projects/${id}/compile`),
  audit: (id: string) => request<AuditEvent[]>('GET', `/api/projects/${id}/audit`),

  apps: () => request<AppSummary[]>('GET', '/api/apps'),
  app: (slug: string) => request<AppDetail>('GET', `/api/apps/${slug}`),
  appStats: (slug: string) => request<AppStats>('GET', `/api/apps/${slug}/stats`),
  appEvents: (slug: string, limit = 40) => request<RecordEvent[]>('GET', `/api/apps/${slug}/events?limit=${limit}`),
  records: (slug: string, entity: string) => request<AppRecord[]>('GET', `/api/apps/${slug}/records/${entity}`),
  record: (slug: string, entity: string, id: string) =>
    request<{ record: AppRecord; history: RecordEvent[] }>('GET', `/api/apps/${slug}/records/${entity}/${id}`),
  createRecord: (slug: string, entity: string, payload: Record<string, unknown>) =>
    request<{ record: AppRecord; effects: Effect[] }>('POST', `/api/apps/${slug}/records/${entity}`, payload),
  updateRecord: (slug: string, entity: string, id: string, payload: Record<string, unknown>) =>
    request<{ record: AppRecord }>('PATCH', `/api/apps/${slug}/records/${entity}/${id}`, payload),
  transition: (slug: string, entity: string, id: string, transition: string) =>
    request<{ record: AppRecord; effects: Effect[] }>('POST', `/api/apps/${slug}/records/${entity}/${id}/transitions/${transition}`),
  seedSample: (slug: string) => request<{ created: Record<string, number> }>('POST', `/api/apps/${slug}/seed-sample`),
  exportUrl: (slug: string) => `/api/apps/${slug}/export`,
  resetApp: (slug: string) => request<{ deleted: number }>('POST', `/api/apps/${slug}/reset`),
}
