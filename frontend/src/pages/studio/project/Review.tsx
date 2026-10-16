import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertCircle, ArrowRight, CheckCheck, ShieldCheck } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { useWorkflowSync } from './useAutosave'
import { Page } from '../../../components/studio/Page'
import { Button } from '../../../components/ui/Button'
import { EmptyState, LoadingState, ProvenanceBadge, TechnicalLabel } from '../../../components/ui/primitives'
import { ReviewActions } from '../../../components/studio/inspector/controls'
import { useWorkspace, setReview } from '../../../lib/workspace'
import { forEachReviewable, reviewCounts, RULE_KIND_LABELS, type Reviewable } from '../../../lib/workflow-schema'
import { acceptWhere } from '../../../lib/workflow-ops'
import { api } from '../../../lib/api'
import { setProjectCache } from '../../../lib/queries'
import { toast } from '../../../lib/toast'
import { timecode } from '../../../lib/format'
import { cn } from '../../../lib/cn'

type Row = { kind: string; id: string; label: string; item: Reviewable; detail?: string }

const GROUPS: { kind: string; title: string; blurb: string }[] = [
  { kind: 'rule', title: 'Business rules', blurb: 'Confirmed enforceable rules are checked by the runtime on every operation.' },
  { kind: 'entity', title: 'Entities', blurb: 'Each confirmed entity becomes a data model, a list view and a form.' },
  { kind: 'field', title: 'Fields', blurb: 'Rejected fields are removed from the generated forms.' },
  { kind: 'state_machine', title: 'State models', blurb: 'Lifecycles become guarded state transitions.' },
  { kind: 'transition', title: 'Transitions', blurb: 'Only confirmed transitions become operations in the app.' },
  { kind: 'action', title: 'Actions', blurb: 'Actions document what people do at each stage.' },
]

export default function Review() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const saveState = useWorkflowSync(project)
  const { draft, update } = useWorkspace()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [approving, setApproving] = useState(false)

  const rows = useMemo(() => {
    const out: Row[] = []
    if (!draft) return out
    forEachReviewable(draft, (item, kind, id, label) => {
      let detail: string | undefined
      if (kind === 'rule') detail = RULE_KIND_LABELS[draft.rules.find((r) => r.id === id)!.kind].label
      out.push({ kind, id, label, item, detail })
    })
    return out
  }, [draft])

  if (!project.workflow) return <EmptyState className="m-8" title="No workflow yet" body="Analyze a recording or define the workflow first." />
  if (!draft || useWorkspace.getState().projectId !== project.id) return <LoadingState />

  const counts = reviewCounts(draft)
  const issues = project.workflow.issues
  const blocking = issues.filter((i) => i.severity === 'error' && !i.message.includes('awaits review'))
  const warnings = issues.filter((i) => i.severity === 'warning')
  const settled = saveState.kind === 'saved'
  const canApprove = counts.pending === 0 && blocking.length === 0 && settled
  const visible = rows.filter((r) => filter === 'all' || r.item.review.status === 'pending')

  const setStatus = (row: Row, s: 'accepted' | 'rejected' | 'pending') =>
    update((d) => {
      forEachReviewable(d, (item, kind, id) => {
        if (kind === row.kind && id === row.id) setReview(item, s)
      })
    })

  const approve = async () => {
    setApproving(true)
    try {
      const p = await api.approve(project.id)
      setProjectCache(qc, p)
      toast.success('Workflow approved', `Version ${p.workflow!.version} is locked in for compilation.`)
      navigate(`/studio/projects/${project.id}/compile`)
    } catch (e) {
      toast.error('Approval blocked', (e as Error).message)
    } finally {
      setApproving(false)
    }
  }

  return (
    <Page>
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <TechnicalLabel>Step 4 · verify</TechnicalLabel>
            <h2 className="display mt-3 text-[clamp(2rem,3.4vw,3rem)] leading-[1]">
              Confirm what the application will <span className="serif-accent text-accent">enforce.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
              Nothing proposed by a model or a template is compiled until a person confirms it. Rejected items are left out of the application entirely.
            </p>

            <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line-soft bg-line-soft">
              {[
                ['Awaiting', counts.pending, 'text-warning'],
                ['Confirmed', counts.accepted, 'text-success'],
                ['Rejected', counts.rejected, 'text-error'],
              ].map(([k, v, c]) => (
                <div key={k as string} className="bg-ink-925 px-3 py-3">
                  <dt className="meta">{k}</dt>
                  <dd className={cn('mt-1 font-mono text-2xl tabular-nums', c as string)}>{v}</dd>
                </div>
              ))}
            </dl>

            {blocking.length > 0 && (
              <div className="mt-5 space-y-1.5" role="alert">
                <TechnicalLabel className="block text-error">Blocking issues</TechnicalLabel>
                {blocking.map((i, k) => (
                  <p key={k} className="flex gap-2 text-[13px] leading-snug text-error">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    {i.message}
                  </p>
                ))}
              </div>
            )}
            {warnings.length > 0 && (
              <details className="mt-4 text-[13px] text-fg-muted">
                <summary className="cursor-pointer text-warning">{warnings.length} warning(s) — compilation can proceed</summary>
                <ul className="mt-2 space-y-1">
                  {warnings.map((w, k) => (
                    <li key={k}>· {w.message}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-8 flex flex-col gap-2">
              <Button variant="primary" size="lg" disabled={!canApprove} loading={approving} onClick={approve} icon={<ShieldCheck className="size-4" />}>
                Approve workflow
              </Button>
              {project.workflow.approved && (
                <Button variant="ghost" onClick={() => navigate(`/studio/projects/${project.id}/compile`)} iconRight={<ArrowRight className="size-4" />}>
                  Already approved · go to compile
                </Button>
              )}
              <p className="text-[12.5px] text-fg-subtle">
                {!settled ? 'Saving your latest decisions…' : counts.pending > 0 ? `Review ${counts.pending} more item(s) to approve.` : blocking.length ? 'Resolve the blocking issues in the workspace.' : 'Ready for approval.'}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-full border border-line-soft bg-ink-925 p-1" role="tablist">
              {(['pending', 'all'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('h-8 rounded-full px-3.5 text-[13px]', filter === f ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:text-fg')}>
                  {f === 'pending' ? `Needs review (${counts.pending})` : `All (${rows.length})`}
                </button>
              ))}
            </div>
            <Button size="sm" icon={<CheckCheck className="size-3.5" />} onClick={() => update((d) => acceptWhere(d, (s) => s === 'observed' || s === 'narration' || s === 'human'))}>
              Confirm all with direct evidence
            </Button>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={<CheckCheck className="size-5" />} title="Nothing left to review" body="Every finding has a decision. Approve the workflow to compile it." />
          ) : (
            <div className="space-y-10">
              {GROUPS.map((g) => {
                const list = visible.filter((r) => r.kind === g.kind)
                if (!list.length) return null
                return (
                  <section key={g.kind}>
                    <h3 className="text-[15px] font-semibold text-fg">{g.title}</h3>
                    <p className="mt-1 text-[13px] text-fg-muted">{g.blurb}</p>
                    <ul className="mt-4 space-y-2">
                      {list.map((r) => {
                        const ev = r.item.provenance.evidence[0]
                        return (
                          <motion.li
                            layout
                            key={`${r.kind}:${r.id}`}
                            className={cn(
                              'surface flex flex-col gap-3 rounded-xl px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between',
                              r.item.review.status === 'accepted' && 'border-success/25',
                              r.item.review.status === 'rejected' && 'opacity-60',
                            )}
                          >
                            <div className="min-w-0">
                              <p className={cn('text-[14px] leading-snug text-fg', r.item.review.status === 'rejected' && 'line-through')}>{r.label}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                {r.detail && <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent">{r.detail}</span>}
                                <ProvenanceBadge source={r.item.provenance.source} compact />
                                {ev?.quote && (
                                  <span className="max-w-[420px] truncate text-[12px] text-fg-subtle" title={ev.quote}>
                                    {ev.start != null && <span className="font-mono">{timecode(ev.start)} </span>}“{ev.quote}”
                                  </span>
                                )}
                                {!ev && r.item.provenance.source === 'inferred' && <span className="text-[12px] text-warning">AI inference — confirmation required</span>}
                              </div>
                            </div>
                            <ReviewActions item={r.item} onChange={(s) => setStatus(r, s)} compact />
                          </motion.li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
