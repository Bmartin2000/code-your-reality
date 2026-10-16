import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Hammer, LayoutTemplate, Play, RotateCcw, Square, Video } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { UnderstandWorkspace } from './UnderstandWorkspace'
import { Page } from '../../../components/studio/Page'
import { CompilerCore, analysisLayers } from '../../../components/studio/CompilerCore'
import { StageTimeline } from '../../../components/studio/StageTimeline'
import { FrameStrip, TranscriptViewer, VideoPlayer } from '../../../components/studio/Evidence'
import { VideoUploadZone, validateVideo, type StagedVideo } from '../../../components/studio/Capture'
import { Button } from '../../../components/ui/Button'
import { TechnicalLabel } from '../../../components/ui/primitives'
import { CommitInput } from '../../../components/studio/inspector/controls'
import { api } from '../../../lib/api'
import { setProjectCache, useCapabilities, useJob } from '../../../lib/queries'
import { toast } from '../../../lib/toast'
import type { ProjectDetail } from '../../../lib/types'
import { bytes, timecode } from '../../../lib/format'

function ObservePanel({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient()
  const caps = useCapabilities()
  const job = useJob(project.analysis_job?.id).data ?? project.analysis_job
  const [busy, setBusy] = useState<string | null>(null)
  const [staged, setStaged] = useState<StagedVideo | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const modelReady = !!caps.data?.model.reachable && !!caps.data?.model.installed
  const running = project.status === 'analyzing' || job?.status === 'running' || job?.status === 'queued'

  const act = async (key: string, fn: () => Promise<ProjectDetail | unknown>) => {
    setBusy(key)
    try {
      const res = await fn()
      if (res && typeof res === 'object' && 'status' in res && 'id' in res && 'origin' in res) setProjectCache(qc, res as ProjectDetail)
      else qc.invalidateQueries({ queryKey: ['project', project.id] })
    } catch (e) {
      toast.error('Action failed', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const uploadNow = async (file: File) => {
    setFileError(null)
    try {
      const v = await validateVideo(file, { maxMb: caps.data?.limits.max_upload_mb ?? 200, maxSeconds: caps.data?.limits.max_video_seconds ?? 300 })
      setStaged(v)
      setProgress(0)
      const p = await api.uploadMedia(project.id, v.file, setProgress)
      setProjectCache(qc, p)
      setStaged(null)
      setProgress(null)
    } catch (e) {
      setProgress(null)
      setFileError((e as Error).message)
    }
  }

  const failed = job?.status === 'failed'

  return (
    <Page wide>
      <div className="grid gap-8 lg:grid-cols-12">
        <section className="space-y-5 lg:col-span-5" aria-label="Source material">
          <TechnicalLabel>Source material</TechnicalLabel>
          {project.media ? (
            <>
              <VideoPlayer media={project.media} />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{project.media.original_name}</p>
                  <TechnicalLabel>
                    {bytes(project.media.size_bytes)}
                    {project.media.duration_seconds ? ` · ${timecode(project.media.duration_seconds)}` : ''}
                    {project.media.has_audio === false ? ' · no audio track' : ''}
                  </TechnicalLabel>
                </div>
                {!running && (
                  <Button size="sm" variant="quiet" loading={busy === 'remove'} onClick={() => act('remove', () => api.deleteMedia(project.id))}>
                    Remove
                  </Button>
                )}
              </div>
              <FrameStrip media={project.media} />
              {(project.media.transcript.length > 0 || job?.status === 'failed') && (
                <TranscriptViewer
                  segments={project.media.transcript}
                  sourceLabel={project.media.transcript_source === 'edited' ? 'edited by you' : 'faster-whisper'}
                  saving={busy === 'transcript'}
                  onSave={running ? undefined : (segs) => act('transcript', () => api.saveTranscript(project.id, segs))}
                />
              )}
            </>
          ) : (
            <VideoUploadZone staged={staged} onFile={uploadNow} onRemove={() => setStaged(null)} error={fileError} progress={progress} disabled={running} />
          )}
          <CommitInput
            label="Narration"
            multiline
            value={project.narration}
            placeholder="Describe the process in your own words (optional)."
            onCommit={(v) => act('narration', () => api.patchProject(project.id, { narration: v }))}
          />
        </section>

        <section className="lg:col-span-7" aria-label="Observation" aria-live="polite">
          <TechnicalLabel>Step 2 · observe</TechnicalLabel>
          <h2 className="display mt-3 text-[clamp(1.9rem,3vw,2.75rem)] leading-[1.02]">
            {running ? (
              <>
                Reading the <span className="serif-accent text-accent">evidence.</span>
              </>
            ) : failed ? (
              'The observation stopped.'
            ) : (
              <>
                Ready to <span className="serif-accent text-accent">observe.</span>
              </>
            )}
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
            {running
              ? 'Each stage below reflects the backend job as it runs. Local models can take a few minutes depending on your hardware — there is no fake progress estimate.'
              : failed
                ? job?.error
                : 'The recording and narration will be transcribed, sampled into frames and interpreted by the configured local model. Nothing it proposes is treated as fact until you confirm it.'}
          </p>

          <CompilerCore layers={analysisLayers(job?.stages)} className="mt-8 max-w-[640px]" label="Analysis progress across input, interpretation and logic layers" />

          {job && (
            <div className="surface mt-8 rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <TechnicalLabel>Analysis job · {job.id.slice(0, 8)}</TechnicalLabel>
                {running && (
                  <span className="relative block h-px w-24 overflow-hidden bg-line">
                    <span className="animate-indeterminate absolute inset-y-0 left-0 w-1/3 bg-accent" />
                  </span>
                )}
              </div>
              <StageTimeline stages={job.stages} />
            </div>
          )}

          {!running && (
            <div className="mt-8 flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={failed ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
                loading={busy === 'analyze'}
                disabled={!modelReady || (!project.media && !project.narration.trim())}
                onClick={() => act('analyze', () => api.analyze(project.id))}
              >
                {failed ? 'Retry analysis' : 'Analyze recording'}
              </Button>
              <Button icon={<LayoutTemplate className="size-4" />} loading={busy === 'tpl'} onClick={() => act('tpl', () => api.convertToManual(project.id, project.name, 'rental'))}>
                Use rental template
              </Button>
              <Button variant="ghost" icon={<Square className="size-4" />} loading={busy === 'blank'} onClick={() => act('blank', () => api.convertToManual(project.id, project.name, 'blank'))}>
                Define manually
              </Button>
            </div>
          )}
          {!running && caps.data && !modelReady && (
            <p className="mt-4 flex items-start gap-2 text-[13px] text-warning">
              <Hammer className="mt-0.5 size-3.5 shrink-0" /> AI analysis is unavailable: {caps.data.model.error}
            </p>
          )}
          {!project.media && !project.narration && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted">
              <Video className="size-3.5" /> Add a recording or a narration to analyze.
            </p>
          )}
        </section>
      </div>
    </Page>
  )
}

export default function ProjectHome() {
  const { project } = useProjectContext()
  if (project.workflow && project.status !== 'analyzing') return <UnderstandWorkspace project={project} />
  return <ObservePanel project={project} />
}
