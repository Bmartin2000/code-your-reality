import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, AlertTriangle, ArrowRight, Box, GitBranch, ListChecks, MessageCircleQuestion, Plus, Scale, Trash2, Workflow, X, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Issue } from '../../../lib/types'
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  KEY_RE,
  RULE_KIND_LABELS,
  RULE_KINDS,
  type Entity,
  type FieldType,
  type RuleKind,
  type WorkflowDefinition,
  uniqueKey,
} from '../../../lib/workflow-schema'
import { acceptedReview, humanProvenance, markEdited, setReview, useWorkspace, type Selection } from '../../../lib/workspace'
import { addStageAfter, newField, removeEntity, removeStage, renameFieldKey } from '../../../lib/workflow-ops'
import { Button, IconButton } from '../../ui/Button'
import { TechnicalLabel } from '../../ui/primitives'
import { CommitInput, EvidencePanel, FieldLabel, MiniReview, ReviewActions, SelectInput, Toggle } from './controls'
import { rulesForStage } from '../WorkflowCanvas'
import { cn } from '../../../lib/cn'

const keyValidator = (taken: string[], current: string) => (v: string) =>
  !KEY_RE.test(v) ? 'Lowercase letters, digits, underscores; start with a letter.' : v !== current && taken.includes(v) ? 'Already used.' : null

function Header({ icon, kind, title, onClose, actions }: { icon: ReactNode; kind: string; title: string; onClose?: () => void; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 pb-4 pt-5">
      <div className="min-w-0">
        <TechnicalLabel className="flex items-center gap-1.5">
          {icon}
          {kind}
        </TechnicalLabel>
        <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.02em] text-fg">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {onClose && (
          <IconButton label="Close inspector" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>
    </div>
  )
}

function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null
  return (
    <ul className="space-y-1.5">
      {issues.map((i, k) => (
        <li key={k} className={cn('flex gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-snug', i.severity === 'error' ? 'bg-error/[0.07] text-error' : 'bg-warning/[0.06] text-warning')}>
          {i.severity === 'error' ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  )
}

// --- Entity ---------------------------------------------------------------------------------

function EntityEditor({ d, entity, focusField, hasMedia, issues }: { d: WorkflowDefinition; entity: Entity; focusField?: string; hasMedia: boolean; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const select = useWorkspace((s) => s.select)
  const edit = (fn: (e: Entity, d: WorkflowDefinition) => void) =>
    update((dd) => {
      const e = dd.entities.find((x) => x.key === entity.key)!
      fn(e, dd)
      markEdited(e)
    })
  const editField = (key: string, fn: (f: Entity['fields'][number], d: WorkflowDefinition) => void) =>
    update((dd) => {
      const f = dd.entities.find((x) => x.key === entity.key)!.fields.find((x) => x.key === key)!
      fn(f, dd)
      markEdited(f)
    })
  const otherEntities = d.entities.filter((e) => e.key !== entity.key)
  const myIssues = issues.filter((i) => i.target_id === entity.key || i.target_id.startsWith(`${entity.key}.`))

  return (
    <div className="space-y-5 px-5 py-5">
      <ReviewActions item={entity} onChange={(s) => update((dd) => setReview(dd.entities.find((x) => x.key === entity.key)!, s))} />
      <IssueList issues={myIssues} />
      <EvidencePanel item={entity} hasMedia={hasMedia} />
      <div className="grid grid-cols-2 gap-3">
        <CommitInput label="Name" value={entity.label} onCommit={(v) => edit((e) => (e.label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
        <CommitInput label="Plural" value={entity.plural_label} onCommit={(v) => edit((e) => (e.plural_label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
      </div>
      <CommitInput label="Description" multiline value={entity.description} onCommit={(v) => edit((e) => (e.description = v))} />
      <SelectInput
        label="Title field"
        value={entity.title_field}
        onChange={(v) => edit((e) => (e.title_field = v))}
        options={entity.fields.map((f) => ({ value: f.key, label: f.label }))}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <TechnicalLabel>Fields · {entity.fields.length}</TechnicalLabel>
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => edit((e) => e.fields.push(newField(e)))}>
            Add field
          </Button>
        </div>
        <ul className="space-y-2">
          {entity.fields.map((f) => (
            <li
              key={f.key}
              className={cn('rounded-xl border p-3 transition-colors', focusField === f.key ? 'border-accent/50 bg-accent/[0.03]' : 'border-line-soft bg-ink-925', f.review.status === 'rejected' && 'opacity-55')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-fg-subtle">{f.key}</span>
                <div className="flex items-center gap-1">
                  <MiniReview item={f} label={f.label} onChange={(s) => update((dd) => setReview(dd.entities.find((x) => x.key === entity.key)!.fields.find((x) => x.key === f.key)!, s))} />
                  <IconButton label={`Remove field ${f.label}`} className="size-6" onClick={() => edit((e) => (e.fields = e.fields.filter((x) => x.key !== f.key)))}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <CommitInput value={f.label} onCommit={(v) => editField(f.key, (ff) => (ff.label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
                <select
                  className="field-input"
                  aria-label={`Type of ${f.label}`}
                  value={f.type}
                  onChange={(ev) =>
                    editField(f.key, (ff) => {
                      ff.type = ev.target.value as FieldType
                      if (ff.type === 'reference' && !ff.ref_entity) ff.ref_entity = otherEntities[0]?.key ?? null
                      if (ff.type !== 'reference') ff.ref_entity = null
                    })
                  }
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t} disabled={t === 'reference' && !otherEntities.length}>
                      {FIELD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              {f.type === 'enum' && (
                <CommitInput
                  className="mt-2"
                  value={f.options.join(', ')}
                  placeholder="Options, separated by commas"
                  onCommit={(v) => editField(f.key, (ff) => (ff.options = [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))]))}
                  validate={(v) => (v.split(',').some((x) => x.trim()) ? null : 'Add at least one option')}
                />
              )}
              {f.type === 'reference' && (
                <SelectInput
                  className="mt-2"
                  value={f.ref_entity ?? ''}
                  onChange={(v) => editField(f.key, (ff) => (ff.ref_entity = v))}
                  options={otherEntities.map((e) => ({ value: e.key, label: `→ ${e.label}` }))}
                />
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <Toggle checked={f.required} onChange={(v) => editField(f.key, (ff) => (ff.required = v))} label="Required" />
                {f.system ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-subtle">Set by workflow</span>
                ) : (
                  <details className="text-[12px] text-fg-subtle">
                    <summary className="cursor-pointer select-none hover:text-fg">Key</summary>
                    <CommitInput
                      mono
                      className="mt-1.5 w-40"
                      value={f.key}
                      validate={keyValidator(
                        entity.fields.map((x) => x.key),
                        f.key,
                      )}
                      onCommit={(v) => {
                        update((dd) => renameFieldKey(dd, entity.key, f.key, v))
                        select({ kind: 'field', id: `${entity.key}.${v}` })
                      }}
                    />
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="quiet"
        size="sm"
        icon={<Trash2 className="size-3.5" />}
        onClick={() => {
          update((dd) => removeEntity(dd, entity.key))
          select(null)
        }}
      >
        Delete entity and its rules
      </Button>
    </div>
  )
}

// --- State machine -------------------------------------------------------------------------

function MachineEditor({ d, entityKey, focusTransition, hasMedia, issues }: { d: WorkflowDefinition; entityKey: string; focusTransition?: string; hasMedia: boolean; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const m = d.state_machines.find((x) => x.entity === entityKey)!
  const edit = (fn: (mm: typeof m) => void) =>
    update((dd) => {
      const mm = dd.state_machines.find((x) => x.entity === entityKey)!
      fn(mm)
      markEdited(mm)
    })
  const stateOpts = m.states.map((s) => ({ value: s.key, label: s.label }))
  const myIssues = issues.filter((i) => i.target_id === entityKey || i.target_id.startsWith(`${entityKey}.`)).filter((i) => i.target_kind === 'state_machine' || i.target_kind === 'transition')
  return (
    <div className="space-y-5 px-5 py-5">
      <ReviewActions item={m} onChange={(s) => update((dd) => setReview(dd.state_machines.find((x) => x.entity === entityKey)!, s))} />
      <IssueList issues={myIssues} />
      <EvidencePanel item={m} hasMedia={hasMedia} />
      <SelectInput label="Initial state" value={m.initial} onChange={(v) => edit((mm) => (mm.initial = v))} options={stateOpts} />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <TechnicalLabel>States</TechnicalLabel>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="size-3.5" />}
            onClick={() => edit((mm) => mm.states.push({ key: uniqueKey('state', mm.states.map((s) => s.key)), label: 'New state', description: '', tone: 'neutral', terminal: false }))}
          >
            Add state
          </Button>
        </div>
        <ul className="space-y-2">
          {m.states.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[1fr_110px_auto] items-start gap-2">
              <CommitInput value={s.label} onCommit={(v) => edit((mm) => (mm.states[i].label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
              <select className="field-input" aria-label={`Tone of ${s.label}`} value={s.tone} onChange={(e) => edit((mm) => (mm.states[i].tone = e.target.value as typeof s.tone))}>
                {['neutral', 'active', 'success', 'warning'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <IconButton
                label={`Remove state ${s.label}`}
                className="mt-1"
                disabled={m.states.length <= 1}
                onClick={() =>
                  edit((mm) => {
                    mm.states = mm.states.filter((x) => x.key !== s.key)
                    mm.transitions = mm.transitions.filter((t) => t.to_state !== s.key).map((t) => ({ ...t, from_states: t.from_states.filter((f) => f !== s.key) }))
                    if (mm.initial === s.key) mm.initial = mm.states[0].key
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <TechnicalLabel>Transitions</TechnicalLabel>
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="size-3.5" />}
            onClick={() =>
              edit((mm) =>
                mm.transitions.push({
                  key: uniqueKey('transition', mm.transitions.map((t) => t.key)),
                  label: 'New transition',
                  from_states: [mm.initial],
                  to_state: mm.states[mm.states.length - 1].key,
                  description: '',
                  provenance: humanProvenance(),
                  review: acceptedReview(),
                }),
              )
            }
          >
            Add transition
          </Button>
        </div>
        <ul className="space-y-2">
          {m.transitions.map((t, i) => (
            <li key={t.key} className={cn('rounded-xl border p-3', focusTransition === t.key ? 'border-accent/50' : 'border-line-soft bg-ink-925', t.review.status === 'rejected' && 'opacity-55')}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-fg-subtle">{t.key}</span>
                <div className="flex items-center gap-1">
                  <MiniReview item={t} label={t.label} onChange={(s) => update((dd) => setReview(dd.state_machines.find((x) => x.entity === entityKey)!.transitions[i], s))} />
                  <IconButton label={`Remove transition ${t.label}`} className="size-6" onClick={() => edit((mm) => (mm.transitions = mm.transitions.filter((x) => x.key !== t.key)))}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              <CommitInput className="mt-2" value={t.label} onCommit={(v) => edit((mm) => (mm.transitions[i].label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {m.states.map((s) => {
                  const on = t.from_states.includes(s.key)
                  return (
                    <button
                      key={s.key}
                      aria-pressed={on}
                      onClick={() =>
                        edit((mm) => {
                          const tt = mm.transitions[i]
                          tt.from_states = on ? tt.from_states.filter((x) => x !== s.key) : [...tt.from_states, s.key]
                        })
                      }
                      className={cn('rounded-full border px-2 py-0.5 text-[11.5px]', on ? 'border-accent/50 text-accent' : 'border-line text-fg-subtle hover:text-fg')}
                    >
                      {s.label}
                    </button>
                  )
                })}
                <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden />
                <select className="field-input h-7 w-auto py-0 text-[12px]" aria-label="Target state" value={t.to_state} onChange={(e) => edit((mm) => (mm.transitions[i].to_state = e.target.value))}>
                  {stateOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// --- Rule ----------------------------------------------------------------------------------

function RuleEditor({ d, ruleId, hasMedia, issues }: { d: WorkflowDefinition; ruleId: string; hasMedia: boolean; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const select = useWorkspace((s) => s.select)
  const r = d.rules.find((x) => x.id === ruleId)!
  const p = r.params as Record<string, unknown>
  const edit = (fn: (rr: typeof r) => void) =>
    update((dd) => {
      const rr = dd.rules.find((x) => x.id === ruleId)!
      fn(rr)
      markEdited(rr)
    })
  const setParam = (k: string, v: unknown) => edit((rr) => (rr.params = { ...rr.params, [k]: v }))

  const entity = d.entities.find((e) => e.key === p.entity)
  const machine = d.state_machines.find((m) => m.entity === p.entity)
  const refFields = entity?.fields.filter((f) => f.type === 'reference') ?? []
  const refField = entity?.fields.find((f) => f.key === p.ref_field)
  const refEntity = d.entities.find((e) => e.key === refField?.ref_entity)
  const target = refEntity?.fields.find((f) => f.key === p.target_field)
  const events = [{ value: 'create', label: `When a ${entity?.label.toLowerCase() ?? 'record'} is created` }, ...(machine?.transitions.map((t) => ({ value: t.key, label: `On “${t.label}”` })) ?? [])]
  const fieldOpts = (pred: (t: string) => boolean) => (entity?.fields.filter((f) => pred(f.type)) ?? []).map((f) => ({ value: f.key, label: f.label }))
  const has = (k: string) => k in RULE_PARAM_KEYS[r.kind]

  return (
    <div className="space-y-5 px-5 py-5">
      <ReviewActions item={r} onChange={(s) => update((dd) => setReview(dd.rules.find((x) => x.id === ruleId)!, s))} />
      <IssueList issues={issues.filter((i) => i.target_kind === 'rule' && i.target_id === ruleId)} />
      <EvidencePanel item={r} hasMedia={hasMedia} />
      <CommitInput label="Rule statement" multiline value={r.statement} onCommit={(v) => edit((rr) => (rr.statement = v))} validate={(v) => (v.trim() ? null : 'Describe the rule')} />
      <div>
        <SelectInput
          label="How the runtime treats it"
          value={r.kind}
          onChange={(v) =>
            edit((rr) => {
              rr.kind = v as RuleKind
              const keep: Record<string, unknown> = {}
              for (const k of Object.keys(RULE_PARAM_KEYS[rr.kind])) if (k in rr.params) keep[k] = rr.params[k]
              if (rr.kind !== 'note' && !keep.entity) keep.entity = d.entities[0]?.key
              rr.params = keep
            })
          }
          options={RULE_KINDS.map((k) => ({ value: k, label: RULE_KIND_LABELS[k].label }))}
        />
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">{RULE_KIND_LABELS[r.kind].hint}</p>
      </div>

      {r.kind !== 'note' && (
        <div className="space-y-3 rounded-xl border border-line-soft bg-ink-925 p-3.5">
          <TechnicalLabel>Enforcement parameters</TechnicalLabel>
          <SelectInput label="Applies to" value={String(p.entity ?? '')} placeholder="Choose entity" onChange={(v) => setParam('entity', v)} options={d.entities.map((e) => ({ value: e.key, label: e.label }))} />
          {has('on') && <SelectInput label="Event" value={String(p.on ?? '')} placeholder="Choose event" onChange={(v) => setParam('on', v)} options={events} />}
          {has('ref_field') && (
            <SelectInput label="Linked record" value={String(p.ref_field ?? '')} placeholder="Choose reference field" onChange={(v) => setParam('ref_field', v)} options={refFields.map((f) => ({ value: f.key, label: f.label }))} />
          )}
          {has('target_field') && refEntity && (
            <SelectInput label={`${refEntity.label} field`} value={String(p.target_field ?? '')} placeholder="Choose field" onChange={(v) => setParam('target_field', v)} options={refEntity.fields.map((f) => ({ value: f.key, label: f.label }))} />
          )}
          {(has('equals') || (has('value') && r.kind === 'set_ref_field')) &&
            (target?.type === 'enum' ? (
              <SelectInput
                label={has('equals') ? 'Must equal' : 'Set to'}
                value={String(p[has('equals') ? 'equals' : 'value'] ?? '')}
                placeholder="Choose value"
                onChange={(v) => setParam(has('equals') ? 'equals' : 'value', v)}
                options={target.options.map((o) => ({ value: o, label: o }))}
              />
            ) : (
              <CommitInput label={has('equals') ? 'Must equal' : 'Set to'} value={String(p[has('equals') ? 'equals' : 'value'] ?? '')} onCommit={(v) => setParam(has('equals') ? 'equals' : 'value', v)} />
            ))}
          {has('field') && (
            <SelectInput
              label="Field"
              value={String(p.field ?? '')}
              placeholder="Choose field"
              onChange={(v) => setParam('field', v)}
              options={fieldOpts((t) => (r.kind === 'min_value' ? t === 'number' || t === 'money' : true))}
            />
          )}
          {r.kind === 'set_field' && (
            <div className="space-y-2">
              <Toggle checked={p.value === '$today'} onChange={(v) => setParam('value', v ? '$today' : '')} label="Use today's date" />
              {p.value !== '$today' && <CommitInput label="Value" value={String(p.value ?? '')} onCommit={(v) => setParam('value', v)} />}
            </div>
          )}
          {has('min') && (
            <CommitInput label="Minimum" value={String(p.min ?? '')} onCommit={(v) => setParam('min', Number(v))} validate={(v) => (v.trim() !== '' && Number.isFinite(Number(v)) ? null : 'Enter a number')} />
          )}
          {r.kind === 'date_order' && (
            <div className="grid grid-cols-2 gap-2">
              <SelectInput label="Earlier date" value={String(p.start_field ?? '')} placeholder="Choose" onChange={(v) => setParam('start_field', v)} options={fieldOpts((t) => t === 'date')} />
              <SelectInput label="Later date" value={String(p.end_field ?? '')} placeholder="Choose" onChange={(v) => setParam('end_field', v)} options={fieldOpts((t) => t === 'date')} />
            </div>
          )}
          {has('states') && machine && (
            <div>
              <FieldLabel>While in states</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {machine.states.map((s) => {
                  const list = Array.isArray(p.states) ? (p.states as string[]) : []
                  const on = list.includes(s.key)
                  return (
                    <button key={s.key} aria-pressed={on} onClick={() => setParam('states', on ? list.filter((x) => x !== s.key) : [...list, s.key])} className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-accent/50 text-accent' : 'border-line text-fg-subtle hover:text-fg')}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <Button
        variant="quiet"
        size="sm"
        icon={<Trash2 className="size-3.5" />}
        onClick={() => {
          update((dd) => (dd.rules = dd.rules.filter((x) => x.id !== ruleId)))
          select(null)
        }}
      >
        Remove rule
      </Button>
    </div>
  )
}

const RULE_PARAM_KEYS: Record<RuleKind, Record<string, true>> = {
  ref_field_equals: { entity: true, on: true, ref_field: true, target_field: true, equals: true },
  exclusive_reference: { entity: true, ref_field: true, states: true },
  set_ref_field: { entity: true, on: true, ref_field: true, target_field: true, value: true },
  set_field: { entity: true, on: true, field: true, value: true },
  min_value: { entity: true, field: true, min: true },
  date_order: { entity: true, start_field: true, end_field: true },
  note: {},
}

// --- Action / Stage / Question / Workflow --------------------------------------------------

function ActionEditor({ d, id, hasMedia, issues }: { d: WorkflowDefinition; id: string; hasMedia: boolean; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const select = useWorkspace((s) => s.select)
  const a = d.actions.find((x) => x.id === id)!
  const edit = (fn: (aa: typeof a) => void) =>
    update((dd) => {
      const aa = dd.actions.find((x) => x.id === id)!
      fn(aa)
      markEdited(aa)
    })
  const machine = d.state_machines.find((m) => m.entity === a.entity)
  return (
    <div className="space-y-5 px-5 py-5">
      <ReviewActions item={a} onChange={(s) => update((dd) => setReview(dd.actions.find((x) => x.id === id)!, s))} />
      <IssueList issues={issues.filter((i) => i.target_kind === 'action' && i.target_id === id)} />
      <EvidencePanel item={a} hasMedia={hasMedia} />
      <CommitInput label="Label" value={a.label} onCommit={(v) => edit((aa) => (aa.label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
      <CommitInput label="Description" multiline value={a.description} onCommit={(v) => edit((aa) => (aa.description = v))} />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Kind" value={a.kind} onChange={(v) => edit((aa) => (aa.kind = v as typeof a.kind))} options={['create', 'transition', 'update'].map((k) => ({ value: k, label: k }))} />
        <SelectInput label="Entity" value={a.entity} onChange={(v) => edit((aa) => (aa.entity = v))} options={d.entities.map((e) => ({ value: e.key, label: e.label }))} />
      </div>
      {a.kind === 'transition' && (
        <SelectInput label="Transition" value={a.transition ?? ''} placeholder="Choose transition" onChange={(v) => edit((aa) => (aa.transition = v))} options={(machine?.transitions ?? []).map((t) => ({ value: t.key, label: t.label }))} />
      )}
      <Button
        variant="quiet"
        size="sm"
        icon={<Trash2 className="size-3.5" />}
        onClick={() => {
          update((dd) => {
            dd.actions = dd.actions.filter((x) => x.id !== id)
            for (const s of dd.stages) if (s.action === id) s.action = null
          })
          select(null)
        }}
      >
        Remove action
      </Button>
    </div>
  )
}

function StageEditor({ d, id, issues }: { d: WorkflowDefinition; id: string; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const select = useWorkspace((s) => s.select)
  const s = d.stages.find((x) => x.id === id)!
  const edit = (fn: (ss: typeof s) => void) => update((dd) => fn(dd.stages.find((x) => x.id === id)!))
  const rules = rulesForStage(d, s)
  return (
    <div className="space-y-5 px-5 py-5">
      <IssueList issues={issues.filter((i) => i.target_kind === 'stage' && i.target_id === id)} />
      <CommitInput label="Label" value={s.label} onCommit={(v) => edit((ss) => (ss.label = v))} validate={(v) => (v.trim() ? null : 'Required')} />
      <CommitInput label="Description" multiline value={s.description} onCommit={(v) => edit((ss) => (ss.description = v))} />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Kind" value={s.kind} onChange={(v) => edit((ss) => (ss.kind = v as typeof s.kind))} options={['start', 'action', 'state', 'end'].map((k) => ({ value: k, label: k }))} />
        <SelectInput
          label="Performs action"
          value={s.action ?? ''}
          onChange={(v) => edit((ss) => (ss.action = v || null))}
          options={[{ value: '', label: 'None' }, ...d.actions.map((a) => ({ value: a.id, label: a.label }))]}
        />
      </div>
      <div>
        <FieldLabel>Leads to</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {d.stages
            .filter((x) => x.id !== id)
            .map((x) => {
              const on = s.next.includes(x.id)
              return (
                <button key={x.id} aria-pressed={on} onClick={() => edit((ss) => (ss.next = on ? ss.next.filter((n) => n !== x.id) : [...ss.next, x.id]))} className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-accent/50 text-accent' : 'border-line text-fg-subtle hover:text-fg')}>
                  {x.label}
                </button>
              )
            })}
        </div>
      </div>
      {rules.length > 0 && (
        <div>
          <FieldLabel>Rules enforced at this stage</FieldLabel>
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.id}>
                <button onClick={() => select({ kind: 'rule', id: r.id })} className="flex w-full items-start gap-2 rounded-lg border border-line-soft px-3 py-2 text-left text-[13px] text-fg-muted hover:border-line hover:text-fg">
                  <Scale className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  {r.statement}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="quiet" icon={<Plus className="size-3.5" />} onClick={() => update((dd) => select({ kind: 'stage', id: addStageAfter(dd, id) }))}>
          Add stage after
        </Button>
        <Button
          size="sm"
          variant="quiet"
          icon={<Trash2 className="size-3.5" />}
          onClick={() => {
            update((dd) => removeStage(dd, id))
            select(null)
          }}
        >
          Remove stage
        </Button>
      </div>
    </div>
  )
}

function QuestionEditor({ d, id }: { d: WorkflowDefinition; id: string }) {
  const update = useWorkspace((s) => s.update)
  const q = d.questions.find((x) => x.id === id)!
  const edit = (fn: (qq: typeof q) => void) => update((dd) => fn(dd.questions.find((x) => x.id === id)!))
  return (
    <div className="space-y-5 px-5 py-5">
      {q.context && <p className="text-[13px] leading-relaxed text-fg-muted">{q.context}</p>}
      <CommitInput label="Your answer" multiline value={q.answer} onCommit={(v) => edit((qq) => (qq.answer = v))} placeholder="Clarify for the record. Answers are documentation; change rules or fields to make them enforceable." />
      <Toggle checked={q.resolved} onChange={(v) => edit((qq) => (qq.resolved = v))} label="Resolved" />
    </div>
  )
}

function WorkflowEditor({ d, issues }: { d: WorkflowDefinition; issues: Issue[] }) {
  const update = useWorkspace((s) => s.update)
  const pendingCount = issues.filter((i) => i.message.includes('awaits review')).length
  const structural = issues.filter((i) => !i.message.includes('awaits review'))
  return (
    <div className="space-y-5 px-5 py-5">
      <CommitInput label="Workflow name" value={d.name} onCommit={(v) => update((dd) => (dd.name = v))} validate={(v) => (v.trim() ? null : 'Required')} />
      <CommitInput label="Description" multiline value={d.description} onCommit={(v) => update((dd) => (dd.description = v))} />
      <div>
        <FieldLabel>Validation</FieldLabel>
        {pendingCount > 0 && <p className="mb-2 text-[13px] text-warning">{pendingCount} finding(s) await review before approval.</p>}
        {structural.length ? <IssueList issues={structural} /> : <p className="text-[13px] text-success">No structural issues.</p>}
      </div>
      <p className="text-[12.5px] leading-relaxed text-fg-subtle">Select any stage, entity, rule or action to inspect its evidence and edit it.</p>
    </div>
  )
}

// --- Frame ---------------------------------------------------------------------------------

export function Inspector({ d, selection, issues, hasMedia, onClose }: { d: WorkflowDefinition; selection: Selection | null; issues: Issue[]; hasMedia: boolean; onClose?: () => void }) {
  let content: ReactNode = null
  let header: ReactNode = null
  const allIssues = issues
  // Review status is shown by the review controls; editors only list structural problems.
  issues = issues.filter((i) => !i.message.includes('awaits review'))
  const sel = selection ?? { kind: 'workflow' as const, id: d.id }

  if (sel.kind === 'entity' || sel.kind === 'field') {
    const [ek, fk] = sel.id.split('.')
    const e = d.entities.find((x) => x.key === ek)
    if (e) {
      header = <Header icon={<Box className="size-3" />} kind={sel.kind === 'field' ? 'Entity · field' : 'Entity'} title={e.label} onClose={onClose} />
      content = <EntityEditor d={d} entity={e} focusField={fk} hasMedia={hasMedia} issues={issues} />
    }
  } else if (sel.kind === 'machine' || sel.kind === 'transition') {
    const [ek, tk] = sel.id.split('.')
    if (d.state_machines.some((m) => m.entity === ek)) {
      header = <Header icon={<GitBranch className="size-3" />} kind="State model" title={`${d.entities.find((e) => e.key === ek)?.label ?? ek} lifecycle`} onClose={onClose} />
      content = <MachineEditor d={d} entityKey={ek} focusTransition={tk} hasMedia={hasMedia} issues={issues} />
    }
  } else if (sel.kind === 'rule') {
    const r = d.rules.find((x) => x.id === sel.id)
    if (r) {
      header = <Header icon={<Scale className="size-3" />} kind={`Business rule · ${RULE_KIND_LABELS[r.kind].label}`} title={r.statement} onClose={onClose} />
      content = <RuleEditor d={d} ruleId={r.id} hasMedia={hasMedia} issues={issues} />
    }
  } else if (sel.kind === 'action') {
    const a = d.actions.find((x) => x.id === sel.id)
    if (a) {
      header = <Header icon={<Zap className="size-3" />} kind="Action" title={a.label} onClose={onClose} />
      content = <ActionEditor d={d} id={a.id} hasMedia={hasMedia} issues={issues} />
    }
  } else if (sel.kind === 'stage') {
    const s = d.stages.find((x) => x.id === sel.id)
    if (s) {
      header = <Header icon={<Workflow className="size-3" />} kind="Process stage" title={s.label} onClose={onClose} />
      content = <StageEditor d={d} id={s.id} issues={issues} />
    }
  } else if (sel.kind === 'question') {
    const q = d.questions.find((x) => x.id === sel.id)
    if (q) {
      header = <Header icon={<MessageCircleQuestion className="size-3" />} kind="Open question" title={q.question} onClose={onClose} />
      content = <QuestionEditor d={d} id={q.id} />
    }
  }
  if (!content) {
    header = <Header icon={<ListChecks className="size-3" />} kind="Workflow" title={d.name} onClose={onClose} />
    content = <WorkflowEditor d={d} issues={allIssues} />
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={`${sel.kind}:${sel.id.split('.')[0]}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
        {header}
        {content}
      </motion.div>
    </AnimatePresence>
  )
}
