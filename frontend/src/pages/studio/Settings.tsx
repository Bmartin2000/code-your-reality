import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Page } from '../../components/studio/Page'
import { ErrorState, LoadingState, SectionHeading, TechnicalLabel } from '../../components/ui/primitives'
import { Button } from '../../components/ui/Button'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useCapabilities } from '../../lib/queries'
import { api } from '../../lib/api'

function Row({ label, ok, value, hint }: { label: string; ok: boolean; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-line-soft py-5 last:border-0 sm:grid-cols-[220px_1fr]">
      <TechnicalLabel className="pt-0.5">{label}</TechnicalLabel>
      <div>
        <div className="flex items-center gap-2 text-sm text-fg">
          {ok ? <CheckCircle2 className="size-4 text-success" /> : <CircleAlert className="size-4 text-warning" />}
          {value}
        </div>
        {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{hint}</p>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { data, isLoading, isError, error, refetch, isFetching } = useCapabilities()
  const qc = useQueryClient()
  const [rechecking, setRechecking] = useState(false)
  const recheck = async () => {
    setRechecking(true)
    try {
      qc.setQueryData(qk.capabilities, await api.capabilities(true))
    } catch {
      refetch()
    } finally {
      setRechecking(false)
    }
  }
  return (
    <Page>
      <SectionHeading
        eyebrow="Studio · settings"
        title="Engine & environment"
        description="Live status reported by the backend. Configuration lives in environment variables on the server (see .env.example); nothing secret is stored in the browser."
        actions={
          <Button size="sm" onClick={recheck} loading={rechecking || isFetching} icon={<RotateCcw className="size-3.5" />}>
            Re-check
          </Button>
        }
      />
      <div className="surface mt-8 rounded-2xl px-5 sm:px-6">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <div className="py-6">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : (
          data && (
            <>
              <Row
                label="Model provider"
                ok={data.model.reachable}
                value={<span className="font-mono text-[13px]">Ollama-compatible · {data.model.url}</span>}
                hint={data.model.reachable ? 'Reachable.' : data.model.error}
              />
              <Row
                label="Model"
                ok={data.model.installed}
                value={<span className="font-mono text-[13px]">{data.model.model}</span>}
                hint={
                  data.model.installed
                    ? data.model.vision
                      ? 'Installed · reports vision capability, so sampled frames are sent with the transcript.'
                      : 'Installed · no vision capability reported; analysis will use transcript and narration only.'
                    : data.model.error ?? 'Not installed.'
                }
              />
              <Row
                label="Transcription"
                ok={data.transcription.installed && data.transcription.enabled}
                value={<span className="font-mono text-[13px]">faster-whisper · {data.transcription.model}</span>}
                hint={
                  !data.transcription.installed
                    ? 'faster-whisper is not installed; recordings are analyzed from frames and written narration only.'
                    : !data.transcription.enabled
                      ? 'Disabled by configuration.'
                      : 'The first transcription downloads the speech model weights to the local cache.'
                }
              />
              <Row label="Media processing" ok={data.ffmpeg.available} value={<span className="font-mono text-[13px]">FFmpeg · {data.ffmpeg.source}</span>} />
              <Row
                label="Upload limits"
                ok
                value={
                  <span className="font-mono text-[13px]">
                    {data.limits.max_upload_mb} MB · {data.limits.max_video_seconds}s · {data.limits.formats.join(' ')}
                  </span>
                }
                hint={`Up to ${data.limits.frame_samples} frames are sampled per recording to keep model calls bounded.`}
              />
            </>
          )
        )}
      </div>
    </Page>
  )
}
