import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Bot, Cpu, RotateCcw, User } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { Page } from '../../../components/studio/Page'
import { ErrorState, LoadingState, ProvenanceBadge, ReviewBadge, SectionHeading, TechnicalLabel } from '../../../components/ui/primitives'
import { ConfirmDialog } from '../../../components/ui/overlays'
import { Button } from '../../../components/ui/Button'
import { FrameStrip, StoryboardPlayer, TranscriptViewer, VideoPlayer } from '../../../components/studio/Evidence'
import { api } from '../../../lib/api'
import { qk, useCapabilities } from '../../../lib/queries'
import { forEachReviewable, type Reviewable } from '../../../lib/workflow-schema'
import { usePlayer } from '../../../lib/workspace'
import { clockTime, relativeTime, timecode } from '../../../lib/format'
import { toast } from '../../../lib/toast'
import { cn } from '../../../lib/cn'

const ACTOR = { model: Bot, compiler: Cpu, system: Cpu, reviewer: User }

export default function EvidencePage() {
  const { project } = useProjectContext()
  const qc = useQueryClient()
  const caps = useCapabilities()
  const audit = useQuery({ queryKey: qk.audit(project.id), queryFn: () => api.audit(project.id), refetchInterval: 30000 })
  const seek = usePlayer((s) => s.seek)
  const setHighlight = usePlayer((s) => s.setHighlight)
  const [confirmRerun, setConfirmRerun] = useState(false)
  const [rerunning, setRerunning] = useState(false)

  const items: { kind: string; id: string; label: string; item: Reviewable }[] = []
  if (project.workflow) forEachReviewable(project.workflow.definition, (item, kind, id, label) => items.push({ kind, id, label, item }))
  const withEvidence = items.filter((i) => i.item.provenance.evidence.length > 0)
  const inferred = items.filter((i) => i.item.provenance.source === 'inferred' && i.item.provenance.evidence.length === 0)
  const canRerun = project.origin === 'analysis' && (!!project.media || !!project.narration) && caps.data?.model.installed

  const rerun = async () => {
    setRerunning(true)
    try {
      await api.analyze(project.id)
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
      toast.info('Analysis started', 'A new workflow version will be proposed for review when it finishes.')
      setConfirmRerun(false)
    } catch (e) {
      toast.error('Could not start analysis', (e as Error).message)
    } finally {
      setRerunning(false)
    }
  }

  return (
    <Page wide>
      <SectionHeading
        eyebrow="Evidence & audit"
        title="Every rule, traced to reality."
        description="Each finding links back to the moment it was observed or said. Every human decision and system action is recorded below."
        actions={
          canRerun ? (
            <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirmRerun(true)} disabled={project.status === 'analyzing'}>
              Re-run analysis
            </Button>
          ) : undefined
        }
      />
      <div className="mt-10 grid gap-10 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5">
          {project.sample_source ? (
            <>
              <StoryboardPlayer source={project.sample_source} />
              <TranscriptViewer segments={project.sample_source.transcript} sourceLabel="example narration" />
            </>
          ) : project.media ? (
            <>
              <VideoPlayer media={project.media} />
              <FrameStrip media={project.media} />
              <TranscriptViewer segments={project.media.transcript} sourceLabel={project.media.transcript_source ?? 'none'} />
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted">No recorded source for this project.</p>
          )}
        </div>
        <div className="space-y-10 xl:col-span-7">
          <section>
            <h3 className="text-[15px] font-semibold">Evidence index · {withEvidence.length} cited findings</h3>
            <ul className="mt-4 divide-y divide-line-soft rounded-2xl border border-line-soft">
              {withEvidence.map((i) => {
                const ev = i.item.provenance.evidence[0]
                return (
                  <li key={`${i.kind}:${i.id}`}>
                    <button
                      onClick={() => {
                        setHighlight(i.item.provenance.evidence)
                        if (ev.start != null) seek(ev.start)
                      }}
                      className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-ink-900 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-fg">{i.label}</span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-subtle">
                          {i.kind.replace('_', ' ')} · {ev.kind === 'frame' ? `frame ${ev.frame_index}` : ev.start != null ? `${timecode(ev.start)}${ev.end != null ? `–${timecode(ev.end)}` : ''}` : 'narration'}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        <ProvenanceBadge source={i.item.provenance.source} compact />
                        <ReviewBadge status={i.item.review.status} />
                      </span>
                    </button>
                  </li>
                )
              })}
              {withEvidence.length === 0 && <li className="px-4 py-6 text-sm text-fg-muted">No finding cites a source.</li>}
            </ul>
            {inferred.length > 0 && (
              <p className="mt-3 text-[13px] text-warning">
                {inferred.length} finding(s) are AI inferences without direct evidence — each requires explicit confirmation.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[15px] font-semibold">Audit trail</h3>
            <div className="mt-4">
              {audit.isLoading ? (
                <LoadingState />
              ) : audit.isError ? (
                <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
              ) : (
                <ol className="relative space-y-0 border-l border-line-soft pl-5">
                  {audit.data!.map((a) => {
                    const Icon = ACTOR[a.actor as keyof typeof ACTOR] ?? User
                    return (
                      <li key={a.id} className="relative pb-4">
                        <span className={cn('absolute -left-[29px] top-0.5 flex size-[18px] items-center justify-center rounded-full border bg-ink-950', a.action === 'rejected' ? 'border-error/50 text-error' : a.action === 'confirmed' || a.action === 'approved' ? 'border-success/50 text-success' : 'border-line text-fg-subtle')}>
                          <Icon className="size-2.5" />
                        </span>
                        <p className="text-[13.5px] text-fg-muted">{a.summary}</p>
                        <TechnicalLabel>
                          {a.actor} · {a.action} · <time dateTime={a.created_at} title={clockTime(a.created_at)}>{relativeTime(a.created_at)}</time>
                        </TechnicalLabel>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={rerun}
        loading={rerunning}
        title="Re-run the analysis?"
        description="The model will propose a new workflow version from the recording, transcript and narration. Your current version stays in the history, but the new proposal replaces it in the workspace and needs review again."
        confirmLabel="Re-run analysis"
      />
    </Page>
  )
}
