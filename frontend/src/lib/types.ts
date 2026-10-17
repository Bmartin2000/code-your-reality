import type { WorkflowDefinition } from './workflow-schema'

export type ProjectStatus =
  | 'draft'
  | 'uploaded'
  | 'analyzing'
  | 'needs_review'
  | 'verified'
  | 'compiling'
  | 'ready'
  | 'failed'

export type ProjectOrigin = 'sample' | 'analysis' | 'manual'

export interface ProjectSummary {
  id: string
  name: string
  description: string
  origin: ProjectOrigin
  status: ProjectStatus
  workflow_version: number | null
  workflow_name: string | null
  app_slug: string | null
  media_name: string | null
  created_at: string
  updated_at: string
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface MediaAsset {
  id: string
  original_name: string
  content_type: string
  size_bytes: number
  duration_seconds: number | null
  has_audio: boolean | null
  transcript: TranscriptSegment[]
  transcript_source: 'whisper' | 'edited' | null
  frames: { index: number; time: number; url: string }[]
  url: string
  created_at: string
}

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface JobStage {
  key: string
  label: string
  status: StageStatus
  detail: string
  duration_ms: number | null
  outputs: Record<string, unknown>
}

export interface Job {
  id: string
  project_id: string
  kind: 'analysis' | 'compile' | 'change'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  stages: JobStage[]
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface Issue {
  severity: 'error' | 'warning'
  message: string
  target_kind: string
  target_id: string
}

export interface WorkflowEnvelope {
  id: string
  version: number
  source: 'ai_extraction' | 'sample' | 'template' | 'blank' | 'human_edit' | 'change_request'
  approved: boolean
  approved_at: string | null
  definition: WorkflowDefinition
  issues: Issue[]
  review: { pending: number; accepted: number; rejected: number }
  created_at: string
}

export interface SampleScene {
  start: number
  end: number
  scene: 'shelf' | 'board' | 'binder' | 'slip' | 'tag' | 'return'
  caption: string
}

export interface SampleSource {
  title: string
  transcript: TranscriptSegment[]
  scenes: SampleScene[]
  duration: number
}

export interface ProjectDetail extends ProjectSummary {
  narration: string
  media: MediaAsset | null
  workflow: WorkflowEnvelope | null
  analysis_job: Job | null
  compile_job: Job | null
  change_job: Job | null
  app_owner_key: string | null
  sample_source: SampleSource | null
}

export interface AuditEvent {
  id: number
  actor: string
  action: string
  target_kind: string
  target_id: string
  summary: string
  created_at: string
}

// --- Generated application manifest ---------------------------------------------------------

export interface ManifestField {
  key: string
  label: string
  type: string
  required: boolean
  description: string
  options: string[]
  ref_entity: string | null
  default: unknown
  system: boolean
}

export interface ManifestState {
  key: string
  label: string
  description: string
  tone: 'neutral' | 'active' | 'success' | 'warning'
  terminal: boolean
}

export interface ManifestEntity {
  key: string
  label: string
  plural_label: string
  description: string
  title_field: string
  code_prefix: string
  fields: ManifestField[]
  state: {
    field: string
    initial: string
    states: ManifestState[]
    transitions: { key: string; label: string; from_states: string[]; to_state: string; description: string }[]
  } | null
}

export interface ManifestRule {
  id: string
  kind: string
  statement: string
  params: Record<string, unknown>
  enforced: boolean
  source: string
  confirmed: boolean
}

export interface Manifest {
  manifest_version: number
  workflow: { id: string; name: string; description: string; domain: string; version: number }
  warnings: Issue[]
  entities: ManifestEntity[]
  forms: { entity: string; create_fields: string[]; edit_fields: string[] }[]
  views: { key: string; label: string; kind: string; entity: string | null; columns: string[] }[]
  rules: ManifestRule[]
  guards: Record<string, Record<string, string[]>>
  effects: Record<string, Record<string, string[]>>
  invariants: Record<string, string[]>
  locked_fields: Record<string, string[]>
  actions: { id: string; label: string; description: string; kind: string; entity: string; transition: string | null }[]
  stages: { id: string; label: string; kind: string; next: string[] }[]
}

export interface AppSummary {
  id: string
  slug: string
  name: string
  is_sample: boolean
  project_id: string
  project_origin: ProjectOrigin | null
  workflow_version: number | null
  created_at: string
  updated_at: string
  entities: { key: string; label: string; plural_label: string }[]
}

export interface AppDetail extends AppSummary {
  manifest: Manifest
  can_seed_sample: boolean
  access_mode: 'open' | 'team'
  locked: false
  viewer: AppViewer
  features: { reports: boolean; integrations: boolean; team: boolean; plan: string }
}

export interface LockedApp {
  slug: string
  name: string
  access_mode: 'team'
  locked: true
}

export interface AppRecord {
  id: string
  entity: string
  code: string
  title: string
  data: Record<string, unknown>
  refs: Record<string, { id: string; title: string; code: string; data: Record<string, unknown> }>
  transitions: { key: string; label: string }[]
  created_at: string
  updated_at: string
}

export interface RecordEvent {
  id: number
  record_id: string | null
  entity: string
  kind: 'created' | 'updated' | 'transition' | 'effect' | 'rejected'
  summary: string
  detail: Record<string, unknown> | null
  created_at: string
}

export interface Effect {
  rule: string
  record: string
  field: string
  from: unknown
  to: unknown
}

export interface AppStats {
  [entity: string]: { total: number; breakdown: Record<string, Record<string, number>> }
}

export interface Capabilities {
  ffmpeg: { available: boolean; source: string }
  transcription: { engine: string; installed: boolean; enabled: boolean; model: string }
  model: { reachable: boolean; url: string; model: string; installed: boolean; vision: boolean; error: string | null; cloud?: boolean; api_key_configured?: boolean; capabilities_source?: string }
  limits: { max_upload_mb: number; max_video_seconds: number; formats: string[]; frame_samples: number }
}

// --- Account / plans ----------------------------------------------------------------------------

export interface PlanLimits {
  id: 'free' | 'plus' | 'business'
  name: string
  price_eur: number | null
  apps: number
  members: number
  analyses_per_month: number
  frame_samples: number
  reports: boolean
  integrations: boolean
  team: boolean
}

export interface AccountSummary {
  plan: PlanLimits
  company: string
  billing_email: string
  plan_started_at: string | null
  usage: { apps: number; analyses_this_month: number }
  plans: PlanLimits[]
  billing_live: boolean
  /** Only for the founding Super Admin in Subscription Test Mode. */
  test_mode: { plan: 'free' | 'plus'; real_plan: string } | null
}

export interface TestModeState {
  plan: 'free' | 'plus' | null
  real_plan: string
  effective: PlanLimits
  usage: { apps: number; analyses_this_month: number }
  log: { from: string | null; to: string | null; at: string }[]
}

export interface AppViewer {
  role: 'owner' | 'manager' | 'staff' | 'viewer'
  name: string | null
  permissions: string[]
}

export interface ReportSeriesPoint {
  date: string
  count: number
}

export interface EntityReport {
  key: string
  label: string
  plural_label: string
  total: number
  created_last_30_days: number
  per_day: ReportSeriesPoint[]
  numeric: { field: string; label: string; type: string; sum: number; avg: number; min: number; max: number; count: number }[]
  breakdowns: { field: string; label: string; values: { value: string; label: string; count: number }[] }[]
  top_references: { field: string; label: string; target: string; top: { id: string; title: string; count: number }[] }[]
  lifecycle: { open: number; closed: number; avg_hours_to_close: number | null; due_field: string | null; overdue: { id: string; title: string; due: string }[]; overdue_count: number } | null
}

export interface AppReports {
  generated_at: string
  entities: EntityReport[]
  activity: ReportSeriesPoint[]
  operations: number
  rejections: number
  rules_that_stopped_mistakes: { statement: string; count: number }[]
}

export interface IntegrationTool {
  id: string
  name: string
  status: 'available' | 'planned'
  via: string
  mentioned: boolean
  evidence: { quote: string; start: number | null; kind: string } | null
}

export interface AppIntegrations {
  unlocked: boolean
  tools: IntegrationTool[]
  calendar_path: string | null
  csv: { entity: string; label: string; path: string }[]
  webhooks: { id: string; url: string; secret: string; active: boolean; last_status: string | null; last_sent_at: string | null }[]
}

export interface AppMember {
  id: string
  name: string
  role: 'owner' | 'manager' | 'staff' | 'viewer'
  key: string
  created_at: string
}

export interface AppTeam {
  access_mode: 'open' | 'team'
  unlocked: boolean
  seats: number
  members: AppMember[]
}
