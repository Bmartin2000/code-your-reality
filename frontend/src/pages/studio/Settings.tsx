import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleAlert, LifeBuoy, RotateCcw } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { Button } from '../../components/ui/Button'
import { qk, useCapabilities } from '../../lib/queries'
import { api } from '../../lib/api'
import { PLANS, SUPPORT_URL, chosenPlan } from '../../lib/plans'

function Row({ label, ok, value, hint }: { label: string; ok: boolean; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line-soft py-4 last:border-0">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />}
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        <p className="mt-0.5 break-words text-[14px] text-fg-muted">{value}</p>
        {hint && <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">{hint}</p>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { data, isLoading, isError, error, refetch, isFetching } = useCapabilities()
  const qc = useQueryClient()
  const [rechecking, setRechecking] = useState(false)
  const plan = PLANS.find((p) => p.id === chosenPlan()) ?? PLANS[0]
  const engineOk = !!data && data.model.reachable && data.model.installed

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
    <div className="mx-auto max-w-[720px] space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display mb-6 text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Account</h1>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="plan-title">
        <p className="text-[14px] text-fg-subtle">Your plan</p>
        <h2 id="plan-title" className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">
          {plan.name} · free pilot
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          {plan.price}
          {plan.period ?? ''} after the pilot. Online payment isn’t switched on in this preview — Integrint will contact you before anything is billed.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {plan.features.map((f) => (
            <li key={f} className="rounded-full bg-ink-950 px-3 py-1.5 text-[13px] text-fg-muted">
              {f}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="support-title">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <LifeBuoy className="size-5" />
          </span>
          <div>
            <h2 id="support-title" className="text-[19px] font-semibold">Support by Integrint</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">Stuck with a recording, or the AI misunderstood something? Real people help you get it right.</p>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
              Contact support <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="engine-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="engine-title" className="text-[19px] font-semibold">AI engine</h2>
            <p className="mt-1 text-[15px] text-fg-muted">{isLoading ? 'Checking…' : engineOk ? `Ready · ${data!.model.model} on this computer` : 'Offline — videos can be saved and analyzed later'}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={recheck} loading={rechecking || isFetching} icon={<RotateCcw className="size-4" />}>
            Check
          </Button>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-[14px] text-accent">Technical details</summary>
          <div className="mt-2">
            {isLoading ? (
              <LoadingState className="min-h-[120px]" />
            ) : isError ? (
              <ErrorState error={error} onRetry={() => refetch()} />
            ) : (
              data && (
                <>
                  <Row label="Model server" ok={data.model.reachable} value={`Ollama-compatible · ${data.model.url}`} hint={data.model.reachable ? undefined : data.model.error} />
                  <Row
                    label="Model"
                    ok={data.model.installed}
                    value={data.model.model}
                    hint={data.model.installed ? (data.model.vision ? 'Can see video frames as well as read the transcript.' : 'No vision: uses the transcript and narration only.') : data.model.error}
                  />
                  <Row
                    label="Speech to text"
                    ok={data.transcription.installed && data.transcription.enabled}
                    value={`faster-whisper · ${data.transcription.model}`}
                    hint={data.transcription.installed ? 'The first use downloads the speech model.' : 'Not installed: frames and written notes only.'}
                  />
                  <Row label="Video processing" ok={data.ffmpeg.available} value={`FFmpeg · ${data.ffmpeg.source}`} />
                  <Row ok label="Limits" value={`${data.limits.max_upload_mb} MB · ${Math.round(data.limits.max_video_seconds / 60)} min per video · ${data.limits.frame_samples} frames analyzed`} />
                </>
              )
            )}
          </div>
        </details>
      </section>
    </div>
  )
}
