import type {
  AccountSummary,
  AppIntegrations,
  AppReports,
  AppTeam,
  AppMember,
  LockedApp,
  AppDetail,
  AppRecord,
  AppStats,
  AppSummary,
  BillingInfo,
  ImportResult,
  Manifest,
  SectionColor,
  AuditEvent,
  Capabilities,
  Effect,
  Job,
  ProjectDetail,
  TestModeState,
  ProjectSummary,
  RecordEvent,
  TranscriptSegment,
} from './types'
import type { WorkflowDefinition } from './workflow-schema'

export interface ApiErrorBody {
  message: string
  upgrade?: boolean
  feature?: string
  auth?: boolean
  auth_required?: boolean
  field_errors?: Record<string, string>
  rule?: { id: string; statement: string; kind: string; source: string }
  issues?: { severity: string; message: string; target_kind: string; target_id: string }[]
  details?: unknown
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  created_at: string
  /** The founding account (first ever registered); only it can use Subscription Test Mode. */
  super_admin?: boolean
}

export interface AuthState {
  user: AuthUser | null
  needs_setup: boolean
  signup_open: boolean
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

/** Per-field messages from a refused form: explicit field_errors, or the fields named by a 422. */
export function fieldErrors(err: unknown): Record<string, string> | null {
  if (!(err instanceof ApiError)) return null
  if (err.body.field_errors) return err.body.field_errors
  const details = err.body.details as { loc?: (string | number)[] }[] | undefined
  if (err.status !== 422 || !Array.isArray(details)) return null
  const out: Record<string, string> = {}
  for (const d of details) {
    const name = d.loc?.[d.loc.length - 1]
    if (typeof name === 'string') out[name] = name === 'email' ? 'Enter a valid email address.' : 'Check this value.'
  }
  return Object.keys(out).length ? out : null
}

/** Personal access keys for private (team) apps, remembered per app in this browser. */
export function appKey(slug: string): string | null {
  try {
    return localStorage.getItem(`cyr.key.${slug}`)
  } catch {
    return null
  }
}

export function setAppKey(slug: string, key: string | null) {
  try {
    if (key) localStorage.setItem(`cyr.key.${slug}`, key)
    else localStorage.removeItem(`cyr.key.${slug}`)
  } catch {
    /* storage unavailable: the key has to come with the link each time */
  }
}

function headersFor(path: string, body: unknown): Record<string, string> {
  const h: Record<string, string> = {}
  if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json'
  const m = path.match(/^\/api\/apps\/([^/?]+)/)
  const key = m ? appKey(m[1]) : null
  if (key) h['X-App-Key'] = key
  return h
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: headersFor(path, body),
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the Code Your Reality server. Check that the backend is running.' })
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
  me: () => request<AuthState>('GET', '/api/auth/me'),
  login: (email: string, password: string) => request<{ user: AuthUser }>('POST', '/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ user: AuthUser }>('POST', '/api/auth/register', { name, email, password }),
  logout: () => request<{ status: string }>('POST', '/api/auth/logout'),
  users: () => request<AuthUser[]>('GET', '/api/users'),
  createUser: (body: { name: string; email: string; password: string; role: 'admin' | 'user' }) => request<AuthUser>('POST', '/api/users', body),
  setUserRole: (id: string, role: 'admin' | 'user') => request<AuthUser>('PATCH', `/api/users/${id}`, { role }),
  deleteUser: (id: string) => request<void>('DELETE', `/api/users/${id}`),
  testMode: () => request<TestModeState>('GET', '/api/admin/test-mode'),
  setTestMode: (plan: 'free' | 'plus' | null) => request<TestModeState>('PUT', '/api/admin/test-mode', { plan }),

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
  app: (slug: string) => request<AppDetail | LockedApp>('GET', `/api/apps/${slug}`),
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
  addNote: (slug: string, entity: string, id: string, text: string) => request<RecordEvent>('POST', `/api/apps/${slug}/records/${entity}/${id}/notes`, { text }),
  importRecords: (slug: string, entity: string, rows: Record<string, string>[]) => request<ImportResult>('POST', `/api/apps/${slug}/records/${entity}/import`, { rows }),
  customizeApp: (slug: string, body: { name?: string; sections: Record<string, { label?: string; plural_label?: string; color?: SectionColor }> }) =>
    request<{ manifest: Manifest; name: string }>('PUT', `/api/apps/${slug}/customize`, body),
  seedSample: (slug: string) => request<{ created: Record<string, number> }>('POST', `/api/apps/${slug}/seed-sample`),
  exportUrl: (slug: string) => {
    const key = appKey(slug)
    return `/api/apps/${slug}/export${key ? `?key=${key}` : ''}`
  },
  csvUrl: (path: string, slug: string) => {
    const key = appKey(slug)
    return `${path}${key ? `?key=${key}` : ''}`
  },
  reports: (slug: string) => request<AppReports>('GET', `/api/apps/${slug}/reports`),
  integrations: (slug: string) => request<AppIntegrations>('GET', `/api/apps/${slug}/integrations`),
  addWebhook: (slug: string, url: string) => request<{ id: string; secret: string }>('POST', `/api/apps/${slug}/webhooks`, { url }),
  deleteWebhook: (slug: string, id: string) => request<void>('DELETE', `/api/apps/${slug}/webhooks/${id}`),
  testWebhook: (slug: string, id: string) => request<{ status: string }>('POST', `/api/apps/${slug}/webhooks/${id}/test`),
  team: (slug: string) => request<AppTeam>('GET', `/api/apps/${slug}/team`),
  enableTeam: (slug: string) => request<{ access_mode: string; owner_key: string }>('POST', `/api/apps/${slug}/team/enable`),
  disableTeam: (slug: string) => request<{ access_mode: string }>('POST', `/api/apps/${slug}/team/disable`),
  addMember: (slug: string, name: string, role: string) => request<AppMember>('POST', `/api/apps/${slug}/team`, { name, role }),
  removeMember: (slug: string, id: string) => request<void>('DELETE', `/api/apps/${slug}/team/${id}`),

  account: () => request<AccountSummary>('GET', '/api/account'),
  checkout: (plan: 'plus' | 'business', company: string, billing_email: string) =>
    request<AccountSummary & { charged: boolean }>('POST', '/api/account/checkout', { plan, company, billing_email }),
  changePlan: (plan: 'free' | 'plus' | 'business') => request<AccountSummary>('POST', '/api/account/plan', { plan }),
  billing: () => request<BillingInfo>('GET', '/api/account/billing'),
  updateBilling: (company: string, billing_email: string) => request<BillingInfo>('PUT', '/api/account/billing', { company, billing_email }),
  resetApp: (slug: string) => request<{ deleted: number }>('POST', `/api/apps/${slug}/reset`),
}
