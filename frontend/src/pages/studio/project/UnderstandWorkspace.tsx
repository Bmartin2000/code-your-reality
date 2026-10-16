import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowRight, Box, CheckCheck, Cloud, CloudOff, GitBranch, Loader2, MessageCircleQuestion, PanelLeftClose, PanelLeftOpen, Plus, Scale, Zap } from 'lucide-react'
import type { ProjectDetail } from '../../../lib/types'
import { useWorkspace, usePlayer, type Selection } from '../../../lib/workspace'
import { reviewCounts, RULE_KIND_LABELS, FIELD_TYPE_LABELS, type WorkflowDefinition, type Evidence } from '../../../lib/workflow-schema'
import { acceptWhere, addStageAfter, newEntity, newRule } from '../../../lib/workflow-ops'
import { setReview } from '../../../lib/workspace'
import { useWorkflowSync, type SaveState } from './useAutosave'
import { useMediaQuery } from '../../../lib/hooks'
import { WorkflowCanvas } from '../../../components/studio/WorkflowCanvas'
import { Inspector } from '../../../components/studio/inspector/Inspector'
import { MiniReview } from '../../../components/studio/inspector/controls'
import { FrameStrip, StoryboardPlayer, TranscriptViewer, VideoPlayer } from '../../../components/studio/Evidence'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { EmptyState, ProvenanceBadge, TechnicalLabel } from '../../../components/ui/primitives'
import { LoadingState } from '../../../components/ui/primitives'
import { timecode } from '../../../lib/format'
import { cn } from '../../../lib/cn'
import { api } from '../../../lib/api'
import { setProjectCache } from '../../../lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../../../lib/toast'

function SaveIndicator({ state, version }: { state: SaveState; version: number }) {
  const map = {
    saved: { icon: Cloud, text: `Saved · v${version}`, cls: 'text-fg-subtle' },
    pending: { icon: Cloud, text: 'Unsaved changes', cls: 'text-fg-muted' },
    saving: { icon: Loader2, text: 'Saving…', cls: 'text-fg-muted' },
    invalid: { icon: AlertCircle, text: 'Not saved — fix the highlighted value', cls: 'text-warning' },
    error: { icon: CloudOff, text: 'Save failed', cls: 'text-error' },
  }[state.kind]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em]', map.cls)} role="status" title={'message' in state ? state.message : undefined}>
      <map.icon className={cn('size-3.5', state.kind === 'saving' && 'animate-spin')} />
      {map.text}
    </span>
  )
}

function evidenceFor(d: WorkflowDefinition, sel: Selection | null): Evidence[] {
  if (!sel) return []
  const [a, b] = sel.id.split('.')
  if (sel.kind === 'entity') return d.entities.find((e) => e.key === a)?.provenance.evidence ?? []
  if (sel.kind === 'field') {
    const e = d.entities.find((x) => x.key === a)
    return e?.fields.find((f) => f.key === b)?.provenance.evidence ?? e?.provenance.evidence ?? []
  }
  if (sel.kind === 'machine') return d.state_machines.find((m) => m.entity === a)?.provenance.evidence ?? []
  if (sel.kind === 'transition') return d.state_machines.find((m) => m.entity === a)?.transitions.find((t) => t.key === b)?.provenance.evidence ?? []
  if (sel.kind === 'rule') return d.rules.find((r) => r.id === sel.id)?.provenance.evidence ?? []
  if (sel.kind === 'action') return d.actions.find((x) => x.id === sel.id)?.provenance.evidence ?? []
  return []
}

function Section({ icon, title, count, action, children }: { icon: React.ReactNode; title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line-soft pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-fg">
          <span className="text-fg-subtle">{icon}</span>
          {title}
          {count != null && <span className="font-mono text-[11px] font-normal text-fg-subtle">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function EvidenceColumn({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  if (project.sample_source) {
    return (
      <div className="space-y-5">
        <div>
          <TechnicalLabel className="mb-2 block">Source · {project.sample_source.title}</TechnicalLabel>
          <StoryboardPlayer source={project.sample_source} />
          <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">Predefined example narration and illustrations. The workflow beside it was authored for this sample — it was not produced by a model.</p>
        </div>
        <TranscriptViewer segments={project.sample_source.transcript} sourceLabel="example narration" />
      </div>
    )
  }
  if (project.media) {
    return (
      <div className="space-y-5">
        <VideoPlayer media={project.media} />
        <FrameStrip media={project.media} />
        <TranscriptViewer
          segments={project.media.transcript}
          sourceLabel={project.media.transcript_source === 'edited' ? 'edited by you' : project.media.transcript_source ?? 'none'}
          saving={saving}
          onSave={async (segs) => {
            setSaving(true)
            try {
              setProjectCache(qc, await api.saveTranscript(project.id, segs))
              toast.success('Transcript saved', 'Re-run analysis from the Evidence page to use it.')
            } catch (e) {
              toast.error('Could not save the transcript', (e as Error).message)
            } finally {
              setSaving(false)
            }
          }}
        />
        {project.narration && (
          <div>
            <TechnicalLabel className="mb-2 block">Narration · written</TechnicalLabel>
            <p className="whitespace-pre-line rounded-lg border border-line-soft px-3 py-2.5 text-[13px] leading-relaxed text-fg-muted">{project.narration}</p>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-fg-muted">
      {project.narration ? (
        <>
          <TechnicalLabel className="mb-2 block">Narration · written</TechnicalLabel>
          <p className="whitespace-pre-line leading-relaxed">{project.narration}</p>
        </>
      ) : (
        'This workflow was defined manually. There is no recording to cite as evidence.'
      )}
    </div>
  )
}

export function UnderstandWorkspace({ project }: { project: ProjectDetail }) {
  const saveState = useWorkflowSync(project)
  const { draft, selection, select, update, baseVersion } = useWorkspace()
  const setHighlight = usePlayer((s) => s.setHighlight)
  const xl = useMediaQuery('(min-width: 1280px)')
  // Evidence starts open beside the structure on desktop; on smaller screens it's one tap away.
  const [evidenceOpen, setEvidenceOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  const issues = project.workflow!.issues
  const hasMedia = !!project.media || !!project.sample_source

  useEffect(() => {
    if (draft) setHighlight(evidenceFor(draft, selection))
  }, [draft, selection, setHighlight])
  useEffect(() => () => setHighlight([]), [setHighlight])

  const counts = useMemo(() => (draft ? reviewCounts(draft) : { pending: 0, accepted: 0, rejected: 0 }), [draft])
  if (!draft || useWorkspace.getState().projectId !== project.id) return <LoadingState label="Loading workflow" />

  const total = counts.pending + counts.accepted + counts.rejected
  const errors = issues.filter((i) => i.severity === 'error' && !i.message.includes('awaits review'))
  const directPending = (() => {
    let n = 0
    const walk = (x: { provenance: { source: string }; review: { status: string } }) => x.review.status === 'pending' && (x.provenance.source === 'observed' || x.provenance.source === 'narration') && n++
    draft.entities.forEach((e) => (walk(e), e.fields.forEach(walk)))
    draft.state_machines.forEach((m) => (walk(m), m.transitions.forEach(walk)))
    draft.rules.forEach(walk)
    draft.actions.forEach(walk)
    return n
  })()

  const isSel = (kind: Selection['kind'], id: string) => selection?.kind === kind && selection.id === id

  const inspector = <Inspector d={draft} selection={selection} issues={issues} hasMedia={hasMedia} onClose={xl ? undefined : () => select(null)} />

  return (
    <div className="mx-auto max-w-[1760px]">
      <div className={cn('grid gap-0', xl ? (evidenceOpen ? 'grid-cols-[300px_minmax(0,1fr)_360px] 2xl:grid-cols-[360px_minmax(0,1fr)_420px]' : 'grid-cols-[48px_minmax(0,1fr)_360px] 2xl:grid-cols-[48px_minmax(0,1fr)_420px]') : 'grid-cols-1')}>
        {/* LEFT · evidence */}
        <aside className={cn('border-line-soft px-4 py-6 sm:px-6 xl:sticky xl:top-[77px] xl:max-h-[calc(100dvh-77px)] xl:overflow-y-auto xl:border-r xl:px-5', !xl && 'border-b')} aria-label="Evidence">
          <div className="mb-4 flex items-center justify-between">
            {(evidenceOpen || !xl) && <TechnicalLabel>Evidence</TechnicalLabel>}
            <button onClick={() => setEvidenceOpen(!evidenceOpen)} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-ink-800 hover:text-fg" aria-label={evidenceOpen ? 'Collapse evidence panel' : 'Expand evidence panel'} aria-expanded={evidenceOpen}>
              {evidenceOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
          </div>
          {evidenceOpen && <EvidenceColumn project={project} />}
        </aside>

        {/* CENTER · structure */}
        <div className="@container min-w-0 px-4 py-6 sm:px-6 xl:px-8">
          <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
            <div className="min-w-0">
              <TechnicalLabel>Step 3 · understand</TechnicalLabel>
              <button onClick={() => select({ kind: 'workflow', id: draft.id })} className="mt-2 block text-left">
                <h2 className="display text-[clamp(1.6rem,2.4vw,2.25rem)] leading-[1.05] hover:text-accent">{draft.name}</h2>
              </button>
              {draft.description && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-fg-muted">{draft.description}</p>}
            </div>
            <SaveIndicator state={saveState} version={baseVersion} />
          </div>

          {/* review progress */}
          <div className="surface mt-6 rounded-2xl p-4">
            <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-fg">
                    {counts.pending === 0 ? 'Everything has been reviewed.' : `${counts.pending} of ${total} findings await your review.`}
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {counts.accepted} confirmed · {counts.rejected} rejected
                  </span>
                </div>
                <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-ink-700" aria-hidden>
                  <motion.div className="bg-success" animate={{ width: `${(counts.accepted / Math.max(total, 1)) * 100}%` }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
                  <motion.div className="bg-error/70" animate={{ width: `${(counts.rejected / Math.max(total, 1)) * 100}%` }} transition={{ duration: 0.4 }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 @2xl:ml-4">
                {directPending > 0 && (
                  <Button size="sm" icon={<CheckCheck className="size-3.5" />} onClick={() => update((d) => acceptWhere(d, (s) => s === 'observed' || s === 'narration'))} title="Confirm items backed by observed video or narration. Inferences stay pending.">
                    Confirm {directPending} with evidence
                  </Button>
                )}
                <ButtonLink to={`/studio/projects/${project.id}/review`} size="sm" variant={counts.pending === 0 ? 'primary' : 'secondary'} iconRight={<ArrowRight className="size-3.5" />}>
                  Verify & approve
                </ButtonLink>
              </div>
            </div>
            {errors.length > 0 && (
              <button onClick={() => select({ kind: 'workflow', id: draft.id })} className="mt-3 flex items-center gap-2 text-[12.5px] text-error hover:underline">
                <AlertCircle className="size-3.5" /> {errors.length} validation issue{errors.length > 1 ? 's' : ''} — inspect
              </button>
            )}
          </div>

          <div className="mt-8 space-y-8">
            {/* Process */}
            <Section
              icon={<GitBranch className="size-4" />}
              title="Process"
              count={draft.stages.length}
              action={
                <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => update((d) => select({ kind: 'stage', id: addStageAfter(d, selection?.kind === 'stage' ? selection.id : null) }))}>
                  Add stage
                </Button>
              }
            >
              {draft.stages.length ? (
                <div className="grid-paper rounded-2xl border border-line-soft bg-ink-925 p-2 [background-size:32px_32px]">
                  <WorkflowCanvas definition={draft} issues={issues} selectedId={selection?.kind === 'stage' ? selection.id : null} onSelect={(id) => select({ kind: 'stage', id })} />
                </div>
              ) : (
                <EmptyState title="No process stages yet" body="Stages describe the order of work. They are documentation; the runtime enforces states and rules." />
              )}
            </Section>

            {/* Entities */}
            <Section
              icon={<Box className="size-4" />}
              title="Entities"
              count={draft.entities.length}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus className="size-3.5" />}
                  onClick={() =>
                    update((d) => {
                      const e = newEntity(d)
                      d.entities.push(e)
                      select({ kind: 'entity', id: e.key })
                    })
                  }
                >
                  Add entity
                </Button>
              }
            >
              {draft.entities.length === 0 ? (
                <EmptyState title="No entities" body="Entities are the things the process keeps track of — customers, items, orders." />
              ) : (
                <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
                  {draft.entities.map((e) => (
                    <div
                      key={e.key}
                      className={cn('surface rounded-2xl p-4 transition-colors', isSel('entity', e.key) || selection?.id.startsWith(`${e.key}.`) && selection.kind === 'field' ? 'border-accent/50' : 'hover:border-line', e.review.status === 'rejected' && 'opacity-50')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => select({ kind: 'entity', id: e.key })} className="min-w-0 text-left">
                          <span className="block text-[15px] font-semibold tracking-[-0.01em] text-fg hover:text-accent">{e.label}</span>
                          <span className="mt-1 block"><ProvenanceBadge source={e.provenance.source} compact /></span>
                        </button>
                        <MiniReview item={e} label={e.label} onChange={(s) => update((d) => setReview(d.entities.find((x) => x.key === e.key)!, s))} />
                      </div>
                      <ul className="mt-3 space-y-0.5">
                        {e.fields.map((f) => (
                          <li key={f.key}>
                            <button
                              onClick={() => select({ kind: 'field', id: `${e.key}.${f.key}` })}
                              className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-ink-800', isSel('field', `${e.key}.${f.key}`) && 'bg-ink-800', f.review.status === 'rejected' && 'line-through opacity-50')}
                            >
                              <span className="flex min-w-0 items-center gap-1.5 truncate text-fg-muted">
                                {f.label}
                                {f.required && <span className="text-accent" aria-label="required">*</span>}
                                {f.review.status === 'pending' && <span className="size-1 rounded-full bg-warning" aria-label="awaiting review" />}
                              </span>
                              <span className="shrink-0 font-mono text-[10.5px] text-fg-subtle">
                                {f.type === 'reference' ? `→ ${draft.entities.find((x) => x.key === f.ref_entity)?.label ?? f.ref_entity}` : FIELD_TYPE_LABELS[f.type]}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Lifecycle */}
            {draft.state_machines.length > 0 && (
              <Section icon={<GitBranch className="size-4" />} title="Lifecycle">
                <div className="space-y-3">
                  {draft.state_machines.map((m) => (
                    <div key={m.entity} className={cn('surface rounded-2xl p-4', isSel('machine', m.entity) && 'border-accent/50')}>
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => select({ kind: 'machine', id: m.entity })} className="text-left">
                          <span className="text-[14px] font-semibold text-fg hover:text-accent">{draft.entities.find((e) => e.key === m.entity)?.label ?? m.entity} states</span>
                          <span className="ml-2 align-middle"><ProvenanceBadge source={m.provenance.source} compact /></span>
                        </button>
                        <MiniReview item={m} label="state model" onChange={(s) => update((d) => setReview(d.state_machines.find((x) => x.entity === m.entity)!, s))} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {m.states.map((s, i) => (
                          <span key={s.key} className="flex items-center gap-2">
                            <span className={cn('rounded-full border px-2.5 py-1 font-mono text-[11px]', s.key === m.initial ? 'border-accent/50 text-accent' : 'border-line text-fg-muted')}>{s.label}</span>
                            {i < m.states.length - 1 && <ArrowRight className="size-3 text-fg-subtle" />}
                          </span>
                        ))}
                      </div>
                      <ul className="mt-3 space-y-1">
                        {m.transitions.map((t) => (
                          <li key={t.key} className="flex items-center justify-between gap-2">
                            <button onClick={() => select({ kind: 'transition', id: `${m.entity}.${t.key}` })} className={cn('text-left text-[13px] text-fg-muted hover:text-fg', t.review.status === 'rejected' && 'line-through opacity-50')}>
                              <Zap className="mr-1.5 inline size-3 text-accent" />
                              {t.label} <span className="font-mono text-[10.5px] text-fg-subtle">{t.from_states.join(', ')} → {t.to_state}</span>
                            </button>
                            <MiniReview item={t} label={t.label} onChange={(s) => update((d) => setReview(d.state_machines.find((x) => x.entity === m.entity)!.transitions.find((x) => x.key === t.key)!, s))} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Rules */}
            <Section
              icon={<Scale className="size-4" />}
              title="Business rules"
              count={draft.rules.length}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus className="size-3.5" />}
                  onClick={() =>
                    update((d) => {
                      const r = newRule(d)
                      d.rules.push(r)
                      select({ kind: 'rule', id: r.id })
                    })
                  }
                >
                  Add rule
                </Button>
              }
            >
              {draft.rules.length === 0 ? (
                <EmptyState title="No rules" body="Add the conditions the process must respect. Enforceable rules are checked by the runtime on every operation." />
              ) : (
                <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft">
                  <AnimatePresence initial={false}>
                    {draft.rules.map((r) => {
                      const ev = r.provenance.evidence[0]
                      const hasIssue = issues.some((i) => i.target_kind === 'rule' && i.target_id === r.id && i.severity === 'error' && !i.message.includes('awaits review'))
                      return (
                        <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn('flex items-start gap-3 px-4 py-3.5 transition-colors', isSel('rule', r.id) ? 'bg-accent/[0.05]' : 'bg-ink-925 hover:bg-ink-900')}>
                          <button onClick={() => select({ kind: 'rule', id: r.id })} className="min-w-0 flex-1 text-left">
                            <span className={cn('block text-[14px] leading-snug', r.review.status === 'rejected' ? 'text-fg-subtle line-through' : 'text-fg')}>
                              {hasIssue && <AlertCircle className="mr-1.5 inline size-3.5 text-error" aria-label="has an issue" />}
                              {r.statement}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.06em]', r.kind === 'note' ? 'text-fg-subtle' : 'text-accent')}>{RULE_KIND_LABELS[r.kind].label}</span>
                              <ProvenanceBadge source={r.provenance.source} compact />
                              {ev?.start != null && <span className="font-mono text-[10.5px] text-fg-subtle">{timecode(ev.start)}{ev.end != null ? `–${timecode(ev.end)}` : ''}</span>}
                              {r.provenance.source === 'inferred' && !ev && <span className="text-[11.5px] text-warning">AI inference — confirmation required</span>}
                            </span>
                          </button>
                          <MiniReview item={r} label={r.statement} onChange={(s) => update((d) => setReview(d.rules.find((x) => x.id === r.id)!, s))} />
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </Section>

            {/* Actions */}
            <Section icon={<Zap className="size-4" />} title="Detected actions" count={draft.actions.length}>
              {draft.actions.length === 0 ? (
                <p className="text-[13px] text-fg-muted">No actions recorded.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draft.actions.map((a) => (
                    <span key={a.id} className={cn('inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1.5', isSel('action', a.id) ? 'border-accent/50' : 'border-line-soft bg-ink-925', a.review.status === 'rejected' && 'opacity-50')}>
                      <button onClick={() => select({ kind: 'action', id: a.id })} className="text-[13px] text-fg-muted hover:text-fg">
                        {a.label}
                      </button>
                      <MiniReview item={a} label={a.label} onChange={(s) => update((d) => setReview(d.actions.find((x) => x.id === a.id)!, s))} />
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {draft.questions.length > 0 && (
              <Section icon={<MessageCircleQuestion className="size-4" />} title="Open questions" count={draft.questions.filter((q) => !q.resolved).length}>
                <ul className="space-y-2">
                  {draft.questions.map((q) => (
                    <li key={q.id}>
                      <button onClick={() => select({ kind: 'question', id: q.id })} className={cn('flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left', isSel('question', q.id) ? 'border-accent/50' : 'border-line-soft hover:border-line')}>
                        <MessageCircleQuestion className={cn('mt-0.5 size-4 shrink-0', q.resolved ? 'text-success' : 'text-warning')} />
                        <span className="text-[13.5px] text-fg-muted">
                          {q.question}
                          {q.resolved && <span className="ml-2 font-mono text-[10.5px] uppercase text-success">resolved</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>

        {/* RIGHT · inspector */}
        {xl && (
          <aside className="border-l border-line-soft bg-ink-925/60 xl:sticky xl:top-[77px] xl:max-h-[calc(100dvh-77px)] xl:overflow-y-auto" aria-label="Inspector">
            {inspector}
          </aside>
        )}
      </div>

      {!xl && (
        <AnimatePresence>
          {selection && (
            <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-ink-950/70" onClick={() => select(null)} />
              <motion.aside
                role="dialog"
                aria-label="Inspector"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-0 right-0 w-full overflow-y-auto border-l border-line bg-ink-900 sm:w-[440px]"
              >
                {inspector}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
