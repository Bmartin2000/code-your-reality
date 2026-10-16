import type { Entity, EntityField, Rule, WorkflowDefinition } from './workflow-schema'
import { toKey, uniqueKey } from './workflow-schema'
import { acceptedReview, humanProvenance } from './workspace'

const FIELD_PARAMS = ['field', 'ref_field', 'start_field', 'end_field'] as const

export function renameFieldKey(d: WorkflowDefinition, entityKey: string, from: string, to: string) {
  const e = d.entities.find((x) => x.key === entityKey)
  if (!e) return
  const f = e.fields.find((x) => x.key === from)
  if (!f) return
  f.key = to
  if (e.title_field === from) e.title_field = to
  for (const r of d.rules) {
    if (r.params.entity === entityKey) for (const p of FIELD_PARAMS) if (r.params[p] === from) r.params[p] = to
    // target_field lives on the referenced entity
    if (r.params.target_field === from) {
      const owner = d.entities.find((x) => x.key === r.params.entity)
      const ref = owner?.fields.find((x) => x.key === r.params.ref_field)
      if (ref?.ref_entity === entityKey) r.params.target_field = to
    }
  }
  for (const v of d.views) if (v.entity === entityKey) v.columns = v.columns.map((c) => (c === from ? to : c))
}

export function newField(e: Entity): EntityField {
  return {
    key: uniqueKey('new_field', e.fields.map((f) => f.key)),
    label: 'New field',
    type: 'text',
    required: false,
    description: '',
    options: [],
    ref_entity: null,
    system: false,
    provenance: humanProvenance(),
    review: acceptedReview(),
  }
}

export function newEntity(d: WorkflowDefinition): Entity {
  const key = uniqueKey('entity', d.entities.map((e) => e.key))
  return {
    key,
    label: 'New entity',
    plural_label: 'New entities',
    description: '',
    title_field: 'name',
    fields: [
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        description: '',
        options: [],
        ref_entity: null,
        system: false,
        provenance: humanProvenance(),
        review: acceptedReview(),
      },
    ],
    provenance: humanProvenance(),
    review: acceptedReview(),
  }
}

export function newRule(d: WorkflowDefinition): Rule {
  return {
    id: uniqueKey('custom_rule', d.rules.map((r) => r.id)),
    kind: 'note',
    statement: 'Describe the rule in one sentence.',
    params: {},
    provenance: humanProvenance(),
    review: acceptedReview(),
  }
}

export function removeEntity(d: WorkflowDefinition, key: string) {
  d.entities = d.entities.filter((e) => e.key !== key)
  d.state_machines = d.state_machines.filter((m) => m.entity !== key)
  d.rules = d.rules.filter((r) => r.params.entity !== key)
  d.actions = d.actions.filter((a) => a.entity !== key)
  for (const e of d.entities) for (const f of e.fields) if (f.ref_entity === key) {
    f.type = 'text'
    f.ref_entity = null
  }
  for (const s of d.stages) {
    if (s.entity === key) s.entity = null
    if (s.action && !d.actions.some((a) => a.id === s.action)) s.action = null
  }
}

export function removeStage(d: WorkflowDefinition, id: string) {
  const removed = d.stages.find((s) => s.id === id)
  d.stages = d.stages.filter((s) => s.id !== id)
  for (const s of d.stages) {
    if (s.next.includes(id)) s.next = [...new Set([...s.next.filter((n) => n !== id), ...(removed?.next ?? [])])].filter((n) => n !== s.id)
  }
}

export function addStageAfter(d: WorkflowDefinition, afterId: string | null): string {
  const id = uniqueKey(toKey('new_stage'), d.stages.map((s) => s.id))
  const after = afterId ? d.stages.find((s) => s.id === afterId) : d.stages[d.stages.length - 1]
  const stage = { id, label: 'New stage', description: '', kind: 'action' as const, action: null, entity: null, state: null, next: after ? [...after.next] : [] }
  if (after) after.next = [id]
  const idx = after ? d.stages.indexOf(after) + 1 : d.stages.length
  d.stages.splice(idx, 0, stage)
  return id
}

export function acceptWhere(d: WorkflowDefinition, predicate: (source: string) => boolean) {
  const now = new Date().toISOString()
  const touch = (x: { provenance: { source: string }; review: { status: string; at?: string | null } }) => {
    if (x.review.status === 'pending' && predicate(x.provenance.source)) {
      x.review.status = 'accepted'
      x.review.at = now
    }
  }
  for (const e of d.entities) {
    touch(e)
    for (const f of e.fields) touch(f)
  }
  for (const m of d.state_machines) {
    touch(m)
    for (const t of m.transitions) touch(t)
  }
  d.rules.forEach(touch)
  d.actions.forEach(touch)
}
