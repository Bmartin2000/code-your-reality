import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CircleAlert, LifeBuoy, LogOut, RotateCcw, Sparkles, Users } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components/ui/primitives'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/overlays'
import { TestModeCard } from '../../components/studio/TestModeCard'
import { qk, useAccount, useCapabilities, useMe } from '../../lib/queries'
import { api } from '../../lib/api'
import { SUPPORT_URL } from '../../lib/plans'
import { toast } from '../../lib/toast'

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

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, (used / Math.max(max, 1)) * 100)
  return (
    <div>
      <div className="flex justify-between text-[14px]">
        <span className="text-fg-muted">{label}</span>
        <span className="font-medium">
          {used} of {max}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={used} aria-valuemax={max} aria-label={label}>
        <div className={pct >= 100 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-accent'} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function Settings() {
  const caps = useCapabilities()
  const account = useAccount()
  const me = useMe()
  const user = me.data?.user
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)
  const [downgrading, setDowngrading] = useState(false)
  const data = caps.data
  const engineOk = !!data && data.model.reachable && data.model.installed
  const acc = account.data
  const plan = acc?.plan

  const recheck = async () => {
    setRechecking(true)
    try {
      qc.setQueryData(qk.capabilities, await api.capabilities(true))
    } catch {
      caps.refetch()
    } finally {
      setRechecking(false)
    }
  }

  const downgrade = async () => {
    setDowngrading(true)
    try {
      qc.setQueryData(qk.account, await api.changePlan('free'))
      toast.success('Switched to the Free demo plan', 'Your apps and data are kept.')
      setConfirmDowngrade(false)
    } catch (e) {
      toast.error('Could not change the plan', (e as Error).message)
    } finally {
      setDowngrading(false)
    }
  }

  const signOut = async () => {
    setSigningOut(true)
    try {
      await api.logout()
    } finally {
      qc.clear()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-4 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display mb-6 text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">Account</h1>

      {user && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-ink-900 p-6" aria-label="Signed in">
          <div className="min-w-0">
            <p className="text-[14px] text-fg-subtle">Signed in as</p>
            <p className="mt-1 truncate text-[17px] font-semibold">
              {user.name} {user.role === 'admin' && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-semibold text-accent">Admin</span>}
            </p>
            <p className="truncate text-[14px] text-fg-muted">{user.email}</p>
          </div>
          <div className="flex gap-2">
            {user.role === 'admin' && (
              <ButtonLink to="/studio/users" size="sm" variant="secondary" icon={<Users className="size-4" />}>
                Users
              </ButtonLink>
            )}
            <Button size="sm" variant="secondary" onClick={signOut} loading={signingOut} icon={<LogOut className="size-4" />}>
              Sign out
            </Button>
          </div>
        </section>
      )}

      {user?.super_admin && <TestModeCard />}

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="plan-title">
        {account.isLoading ? (
          <LoadingState className="min-h-[120px]" />
        ) : account.isError ? (
          <ErrorState error={account.error} onRetry={() => account.refetch()} />
        ) : (
          acc &&
          plan && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] text-fg-subtle">Your plan</p>
                  <h2 id="plan-title" className="mt-1 flex items-center gap-2 text-[24px] font-semibold tracking-[-0.01em]">
                    {plan.name}
                    {plan.id !== 'free' && <Sparkles className="size-5 text-accent" />}
                  </h2>
                  {acc.company && <p className="mt-1 text-[14px] text-fg-muted">{acc.company} · {acc.billing_email}</p>}
                </div>
                {acc.test_mode && plan.id !== 'free' ? null : plan.id === 'free' ? (
                  <ButtonLink to="/studio/upgrade?plan=plus" variant="primary" size="sm">
                    Upgrade
                  </ButtonLink>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDowngrade(true)}>
                    Switch to Free
                  </Button>
                )}
              </div>
              <div className="mt-6 space-y-4">
                <Meter label="Apps" used={acc.usage.apps} max={plan.apps} />
                <Meter label="Video analyses this month" used={acc.usage.analyses_this_month} max={plan.analyses_per_month} />
              </div>
              <p className="mt-5 text-[13px] text-fg-subtle">Billing isn’t live in this preview: plans are switched with a demo checkout, and nothing is charged.</p>
            </>
          )
        )}
      </section>

      <section className="rounded-3xl bg-ink-900 p-6" aria-labelledby="support-title">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-accent">
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
            <p className="mt-1 text-[15px] text-fg-muted">{caps.isLoading ? 'Checking…' : engineOk ? `Ready · ${data!.model.model} ${data!.model.cloud ? 'via Ollama Cloud' : 'on this server'}` : 'Offline — videos can be saved and analyzed later'}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={recheck} loading={rechecking || caps.isFetching} icon={<RotateCcw className="size-4" />}>
            Check
          </Button>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-[14px] text-accent">Technical details</summary>
          <div className="mt-2">
            {caps.isLoading ? (
              <LoadingState className="min-h-[120px]" />
            ) : caps.isError ? (
              <ErrorState error={caps.error} onRetry={() => caps.refetch()} />
            ) : (
              data && (
                <>
                  <Row label="Model server" ok={data.model.reachable} value={`${data.model.cloud ? 'Ollama Cloud' : 'Ollama'} · ${data.model.url}${data.model.api_key_configured ? ' · API key set on the server' : ''}`} hint={data.model.reachable ? undefined : data.model.error} />
                  <Row label="Model" ok={data.model.installed} value={data.model.model} hint={data.model.installed ? (data.model.vision ? 'Sees the video frames and reads the transcript.' : 'No vision: transcript and notes only.') : data.model.error} />
                  <Row label="Speech to text" ok={data.transcription.installed && data.transcription.enabled} value={`faster-whisper · ${data.transcription.model}`} />
                  <Row label="Video processing" ok={data.ffmpeg.available} value={`FFmpeg · ${data.ffmpeg.source}`} />
                  <Row ok label="Frames analyzed per video" value={`${plan?.frame_samples ?? data.limits.frame_samples} on your plan · up to ${Math.round(data.limits.max_video_seconds / 60)} min per video`} />
                </>
              )
            )}
          </div>
        </details>
      </section>

      <ConfirmDialog
        open={confirmDowngrade}
        onClose={() => setConfirmDowngrade(false)}
        onConfirm={downgrade}
        loading={downgrading}
        title="Switch to the Free demo plan?"
        description="Your apps and their data are kept. Reports, Connections and Team access are switched off, and only your first app can be rebuilt."
        confirmLabel="Switch to Free"
      />
    </div>
  )
}
