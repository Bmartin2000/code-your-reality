/**
 * Client-side mirror of the backend workflow definition (backend/app/workflow/schema.py).
 * The backend re-validates everything; this schema keeps the editor honest before saving.
 */
import { z } from 'zod'

export const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/
const key = z.string().regex(KEY_RE, 'Use lowercase letters, digits and underscores, starting with a letter.')

export const PROVENANCE_SOURCES = ['observed', 'narration', 'inferred', 'human'] as const
export const REVIEW_STATUSES = ['pending', 'accepted', 'rejected'] as const
export const FIELD_TYPES = ['text', 'long_text', 'number', 'money', 'date', 'email', 'phone', 'enum', 'reference', 'boolean'] as const
export const RULE_KINDS = ['ref_field_equals', 'exclusive_reference', 'set_ref_field', 'set_field', 'min_value', 'date_order', 'note'] as const

export const evidenceSchema = z.object({
  kind: z.enum(['transcript', 'frame', 'narration']),
  start: z.number().min(0).nullable().optional(),
  end: z.number().min(0).nullable().optional(),
  frame_index: z.number().int().min(0).nullable().optional(),
  quote: z.string().max(600).default(''),
})

export const provenanceSchema = z.object({
  source: z.enum(PROVENANCE_SOURCES).default('inferred'),
  evidence: z.array(evidenceSchema).max(12).default([]),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  note: z.string().max(600).default(''),
})

export const reviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES).default('pending'),
  edited: z.boolean().default(false),
  note: z.string().max(600).default(''),
  at: z.string().nullable().optional(),
})

const reviewable = { provenance: provenanceSchema, review: reviewSchema }

export const fieldSchema = z.object({
  key,
  label: z.string().min(1, 'Label is required').max(80),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  description: z.string().max(400).default(''),
  options: z.array(z.string().max(60)).max(24).default([]),
  ref_entity: key.nullable().optional(),
  default: z.unknown().optional(),
  system: z.boolean().default(false),
  ...reviewable,
})

export const entitySchema = z.object({
  key,
  label: z.string().min(1).max(80),
  plural_label: z.string().min(1).max(80),
  description: z.string().max(400).default(''),
  title_field: key,
  fields: z.array(fieldSchema).max(40),
  ...reviewable,
})

export const stateSchema = z.object({
  key,
  label: z.string().min(1).max(60),
  description: z.string().max(300).default(''),
  tone: z.enum(['neutral', 'active', 'success', 'warning']).default('neutral'),
  terminal: z.boolean().default(false),
})

export const transitionSchema = z.object({
  key,
  label: z.string().min(1).max(60),
  from_states: z.array(key).max(12),
  to_state: key,
  description: z.string().max(300).default(''),
  ...reviewable,
})

export const stateMachineSchema = z.object({
  entity: key,
  field: key.default('status'),
  initial: key,
  states: z.array(stateSchema).min(1).max(16),
  transitions: z.array(transitionSchema).max(24),
  ...reviewable,
})

export const ruleSchema = z.object({
  id: key,
  kind: z.enum(RULE_KINDS),
  statement: z.string().min(1, 'Describe the rule').max(400),
  params: z.record(z.string(), z.unknown()).default({}),
  ...reviewable,
})

export const actionSchema = z.object({
  id: key,
  label: z.string().min(1).max(80),
  description: z.string().max(300).default(''),
  kind: z.enum(['create', 'transition', 'update']),
  entity: key,
  transition: key.nullable().optional(),
  ...reviewable,
})

export const stageSchema = z.object({
  id: key,
  label: z.string().min(1).max(60),
  description: z.string().max(300).default(''),
  kind: z.enum(['start', 'action', 'state', 'end']),
  action: key.nullable().optional(),
  entity: key.nullable().optional(),
  state: key.nullable().optional(),
  next: z.array(key).max(6),
})

export const viewSchema = z.object({
  key,
  label: z.string().min(1).max(60),
  kind: z.enum(['dashboard', 'list', 'detail', 'form']),
  entity: key.nullable().optional(),
  columns: z.array(z.string()).max(12).default([]),
})

export const questionSchema = z.object({
  id: key,
  question: z.string().min(1).max(400),
  context: z.string().max(400).default(''),
  resolved: z.boolean().default(false),
  answer: z.string().max(600).default(''),
})

export const workflowSchema = z.object({
  schema_version: z.literal('1.0'),
  id: key,
  name: z.string().min(1).max(120),
  description: z.string().max(800).default(''),
  domain: z.string().max(60).default('general'),
  version: z.number().int().min(1),
  entities: z.array(entitySchema).max(12),
  state_machines: z.array(stateMachineSchema).max(6),
  rules: z.array(ruleSchema).max(40),
  actions: z.array(actionSchema).max(30),
  stages: z.array(stageSchema).max(30),
  views: z.array(viewSchema).max(30),
  questions: z.array(questionSchema).max(20),
})

export type Evidence = z.infer<typeof evidenceSchema>
export type Provenance = z.infer<typeof provenanceSchema>
export type Review = z.infer<typeof reviewSchema>
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number]
export type FieldType = (typeof FIELD_TYPES)[number]
export type RuleKind = (typeof RULE_KINDS)[number]
export type EntityField = z.infer<typeof fieldSchema>
export type Entity = z.infer<typeof entitySchema>
export type WorkflowState = z.infer<typeof stateSchema>
export type Transition = z.infer<typeof transitionSchema>
export type StateMachine = z.infer<typeof stateMachineSchema>
export type Rule = z.infer<typeof ruleSchema>
export type Action = z.infer<typeof actionSchema>
export type Stage = z.infer<typeof stageSchema>
export type Question = z.infer<typeof questionSchema>
export type WorkflowDefinition = z.infer<typeof workflowSchema>

export type Reviewable = { provenance: Provenance; review: Review }

export function toKey(value: string, fallback = 'item'): string {
  let k = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!k || !/^[a-z]/.test(k)) k = `${fallback}_${k}`.replace(/_+$/, '')
  return k.slice(0, 48)
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  long_text: 'Long text',
  number: 'Number',
  money: 'Money',
  date: 'Date',
  email: 'Email',
  phone: 'Phone',
  enum: 'Choice',
  reference: 'Reference',
  boolean: 'Yes / no',
}

export const RULE_KIND_LABELS: Record<RuleKind, { label: string; hint: string }> = {
  ref_field_equals: { label: 'Precondition', hint: 'A linked record must be in a given condition before the event.' },
  exclusive_reference: { label: 'Exclusivity', hint: 'Only one open record may point at the same target.' },
  set_ref_field: { label: 'Effect on linked record', hint: 'After the event, update a field of the linked record.' },
  set_field: { label: 'Effect on record', hint: 'After the event, write a value into the record itself.' },
  min_value: { label: 'Minimum value', hint: 'A numeric field must not fall below a minimum.' },
  date_order: { label: 'Date order', hint: 'One date must not come after another.' },
  note: { label: 'Documented note', hint: 'Recorded with the workflow, not enforced by the runtime.' },
}

/** Walk every reviewable item of a definition. */
export function forEachReviewable(
  d: WorkflowDefinition,
  fn: (item: Reviewable, kind: string, id: string, label: string) => void,
) {
  for (const e of d.entities) {
    fn(e, 'entity', e.key, e.label)
    for (const f of e.fields) fn(f, 'field', `${e.key}.${f.key}`, `${e.label}.${f.label}`)
  }
  for (const m of d.state_machines) {
    fn(m, 'state_machine', m.entity, `${m.entity} states`)
    for (const t of m.transitions) fn(t, 'transition', `${m.entity}.${t.key}`, t.label)
  }
  for (const r of d.rules) fn(r, 'rule', r.id, r.statement)
  for (const a of d.actions) fn(a, 'action', a.id, a.label)
}

export function reviewCounts(d: WorkflowDefinition) {
  const counts = { pending: 0, accepted: 0, rejected: 0 }
  forEachReviewable(d, (item) => {
    counts[item.review.status]++
  })
  return counts
}
