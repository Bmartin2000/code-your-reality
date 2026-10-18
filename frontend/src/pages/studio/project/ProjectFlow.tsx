import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowRight, Check, CheckCircle2, Copy, Download, ExternalLink, LayoutTemplate, MessageSquareText, Quote, RefreshCw, Share2, Sparkles, X } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { Button, ButtonLink, Spinner } from '../../../components/ui/Button'
import { api, ApiError, setAppKey } from '../../../lib/api'
import { qk, setProjectCache, useAccount, useJob } from '../../../lib/queries'
import { toast } from '../../../lib/toast'
import type { Job, ProjectDetail } from '../../../lib/types'
import { FIELD_TYPE_LABELS, forEachReviewable, type WorkflowDefinition } from '../../../lib/workflow-schema'
import { timecode, relativeTime } from '../../../lib/format'
import { cn } from '../../../lib/cn'
import { appPageUrl } from '../../../lib/base'

// --- Working (analysis or change request in progress) --------------------------------------------

const FRIENDLY: Record<string, string> = {
  media_received: 'Video received',
  audio_extraction: 'Preparing the sound',
  transcription: 'Listening to what you said',
  frame_sampling: 'Looking at the video',
  model_interpretation: 'Understanding your process',
  validation: 'Double-checking the result',
  request_received: 'Reading your request',
  apply_changes: 'Making the change',
}

function useElapsed(since: string | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) : 0
}

function Working({ job, title }: { job: Job; title: string }) {
  const elapsed = useElapsed(job.created_at)
  return (
    <section className="rounded-3xl bg-ink-900 p-6 sm:p-8" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-[21px] font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="text-[14px] text-fg-subtle">{timecode(elapsed)} elapsed · usually a few minutes</p>
        </div>
      </div>
      <ol className="mt-6 space-y-3">
        {job.stages.map((s) => (
          <li key={s.key} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center">
              {s.status === 'running' ? (
                <Spinner className="size-5 text-accent" />
              ) : s.status === 'done' ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : s.status === 'failed' ? (
                <AlertCircle className="size-5 text-error" />
              ) : s.status === 'skipped' ? (
                <span className="size-2 rounded-full bg-line" />
              ) : (
                <span className="size-2.5 rounded-full border-2 border-line" />
              )}
            </span>
            <span className={cn('text-[16px]', s.status === 'pending' || s.status === 'skipped' ? 'text-fg-subtle' : 'text-fg')}>{FRIENDLY[s.key] ?? s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[14px] text-fg-subtle">You can leave this page — we’ll keep working and show the result here.</p>
    </section>
  )
}

// --- Review in plain language ---------------------------------------------------------------------

type Decision = Record<string, boolean> // key -> keep?

function itemKey(kind: string, id: string) {
  return `${kind}:${id}`
}

function initialDecisions(d: WorkflowDefinition): Decision {
  const out: Decision = {}
  forEachReviewable(d, (item, kind, id) => {
    out[itemKey(kind, id)] = item.review.status !== 'rejected'
  })
  return out
}

function KeepToggle({ keep, onChange, label }: { keep: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={keep}
      aria-label={`${keep ? 'Keep' : 'Leave out'}: ${label}`}
      onClick={() => onChange(!keep)}
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full transition-colors', keep ? 'bg-success/12 text-success' : 'bg-ink-800 text-fg-subtle')}
    >
      {keep ? <Check className="size-5" /> : <X className="size-5" />}
    </button>
  )
}

function Review({ project }: { project: ProjectDetail }) {
  const wf = project.workflow!
  const d = wf.definition
  const qc = useQueryClient()
  const [decisions, setDecisions] = useState<Decision>(() => initialDecisions(d))
  const [phase, setPhase] = useState<'idle' | 'saving' | 'building'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => setDecisions(initialDecisions(d)), [wf.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: boolean) => setDecisions((x) => ({ ...x, [k]: v }))
  const keep = (kind: string, id: string) => decisions[itemKey(kind, id)] !== false
  const sample = project.origin === 'sample'
  const isUpdate = !!project.app_slug

  const build = async () => {
    setProblem(null)
    setPhase('saving')
    try {
      const next = structuredClone(d)
      forEachReviewable(next, (item, kind, id) => {
        const k = decisions[itemKey(kind, id)] !== false
        item.review = { ...item.review, status: k ? 'accepted' : 'rejected', at: new Date().toISOString() }
      })
      for (const q of next.questions) q.resolved = true
      let p = await api.saveWorkflow(project.id, next, wf.version)
      p = await api.approve(project.id)
      setProjectCache(qc, p)
      setPhase('building')
      await api.compile(project.id)
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
    } catch (e) {
      const err = e as ApiError
      setPhase('idle')
      const first = err.body?.issues?.[0]?.message
      setProblem(err.body?.upgrade ? `${err.message} Upgrade in Account to build more apps.` : first ? `${err.message} ${first}` : err.message)
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
    }
  }

  const rules = d.rules
  const evidenceQuote = (ev?: { start?: number | null; quote: string; kind: string }) =>
    ev?.quote ? (
      <span className="mt-2 flex gap-2 text-[14px] leading-snug text-fg-muted">
        <Quote className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span>
          {ev.start != null && <span className="font-medium text-fg-subtle">{timecode(ev.start)} · </span>}“{ev.quote}”
        </span>
      </span>
    ) : null

  return (
    <div className="space-y-6 pb-32">
      <header>
        <h2 className="display text-[clamp(1.8rem,5vw,2.5rem)] leading-[1.08]">{isUpdate ? 'Check the update.' : 'Here’s what we understood.'}</h2>
        <p className="mt-2 text-[17px] text-fg-muted">
          {sample ? 'This example was prepared in advance (no AI was used). ' : ''}Keep what’s right, leave out what isn’t. Nothing goes into your app without your OK.
        </p>
      </header>

      <section className="rounded-3xl bg-ink-900 p-5 sm:p-6" aria-labelledby="r-data">
        <h3 id="r-data" className="text-[17px] font-semibold">What your app keeps track of</h3>
        <ul className="mt-4 space-y-3">
          {d.entities.map((e) => {
            const ek = keep('entity', e.key)
            return (
              <li key={e.key} className={cn('rounded-2xl border border-line-soft p-4', !ek && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-semibold">{e.plural_label}</p>
                    {e.description && <p className="mt-0.5 text-[14px] text-fg-muted">{e.description}</p>}
                  </div>
                  <KeepToggle keep={ek} onChange={(v) => set(itemKey('entity', e.key), v)} label={e.plural_label} />
                </div>
                {ek && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {e.fields
                      .filter((f) => !f.system)
                      .map((f) => {
                        const fk = keep('field', `${e.key}.${f.key}`)
                        return (
                          <button
                            key={f.key}
                            onClick={() => set(itemKey('field', `${e.key}.${f.key}`), !fk)}
                            aria-pressed={fk}
                            title={fk ? 'Tap to leave out' : 'Tap to keep'}
                            className={cn('rounded-full px-3 py-1.5 text-[14px] transition-colors', fk ? 'bg-ink-800 text-fg' : 'bg-transparent text-fg-subtle line-through ring-1 ring-line')}
                          >
                            {f.label}
                            {f.required && fk && <span className="text-accent"> *</span>}
                            <span className="ml-1.5 text-[12px] text-fg-subtle">{f.type === 'reference' ? `→ ${d.entities.find((x) => x.key === f.ref_entity)?.label ?? ''}` : FIELD_TYPE_LABELS[f.type]}</span>
                          </button>
                        )
                      })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {d.state_machines.length > 0 && (
        <section className="rounded-3xl bg-ink-900 p-5 sm:p-6" aria-labelledby="r-steps">
          <h3 id="r-steps" className="text-[17px] font-semibold">How things move along</h3>
          {d.state_machines.map((m) => (
            <div key={m.entity} className="mt-4">
              <p className="text-[14px] text-fg-subtle">{d.entities.find((e) => e.key === m.entity)?.label ?? m.entity}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {m.states.map((s, i) => (
                  <span key={s.key} className="flex items-center gap-2">
                    <span className="rounded-full bg-accent/10 px-3 py-1.5 text-[14px] font-medium text-accent">{s.label}</span>
                    {i < m.states.length - 1 && <ArrowRight className="size-4 text-fg-subtle" aria-hidden />}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-2">
                {m.transitions.map((t) => (
                  <li key={t.key} className="flex items-center justify-between gap-3 text-[15px]">
                    <span className={cn(!keep('transition', `${m.entity}.${t.key}`) && 'text-fg-subtle line-through')}>
                      Button: <span className="font-medium">{t.label}</span>
                    </span>
                    <KeepToggle keep={keep('transition', `${m.entity}.${t.key}`)} onChange={(v) => set(itemKey('transition', `${m.entity}.${t.key}`), v)} label={t.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-3xl bg-ink-900 p-5 sm:p-6" aria-labelledby="r-rules">
        <h3 id="r-rules" className="text-[17px] font-semibold">Rules your app will follow</h3>
        {rules.length === 0 ? (
          <p className="mt-3 text-[15px] text-fg-muted">No rules were found. You can add them later with a small change request.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line-soft">
            {rules.map((r) => {
              const k = keep('rule', r.id)
              const ev = r.provenance.evidence[0]
              return (
                <li key={r.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className={cn('min-w-0', !k && 'opacity-50')}>
                    <p className={cn('text-[16px] leading-snug', !k && 'line-through')}>{r.statement}</p>
                    {r.kind === 'note' && <p className="mt-1 text-[13px] text-fg-subtle">Kept as a note — the app won’t enforce it.</p>}
                    {evidenceQuote(ev)}
                    {!ev && r.provenance.source === 'inferred' && <p className="mt-2 text-[13px] font-medium text-warning">AI guess — nobody said this. Check it.</p>}
                  </div>
                  <KeepToggle keep={k} onChange={(v) => set(itemKey('rule', r.id), v)} label={r.statement} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {d.questions.some((q) => !q.resolved) && (
        <section className="rounded-3xl bg-ink-900 p-5 sm:p-6">
          <h3 className="text-[17px] font-semibold">Worth thinking about</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-fg-muted">
            {d.questions
              .filter((q) => !q.resolved)
              .map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
          </ul>
        </section>
      )}

      <p className="text-center text-[14px]">
        <Link to={`/studio/projects/${project.id}/advanced`} className="text-accent">
          Open the advanced editor
        </Link>
      </p>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line-soft bg-ink-950/90 px-4 py-3 backdrop-blur-xl md:bottom-0">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2">
          {problem && (
            <p role="alert" className="text-[14px] text-error">
              {problem}{' '}
              <Link to={`/studio/projects/${project.id}/advanced`} className="underline">
                Fix in the editor
              </Link>
            </p>
          )}
          <Button variant="primary" size="lg" className="w-full" loading={phase !== 'idle'} onClick={build}>
            {phase === 'building' ? 'Building your app…' : isUpdate ? 'Update my app' : 'Build my app'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- App ready ----------------------------------------------------------------------------------

function ChangeBox({ project }: { project: ProjectDetail }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const failed = project.change_job?.status === 'failed' ? project.change_job : null
  const send = async () => {
    setBusy(true)
    try {
      await api.changeRequest(project.id, text.trim())
      setText('')
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
    } catch (e) {
      toast.error('Could not send the request', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <label htmlFor="change" className="text-[15px] font-medium">
        Ask for a small change
      </label>
      <textarea
        id="change"
        className="field-input mt-2 min-h-[88px] resize-y"
        placeholder="For example: “Customers should also give an email address.”"
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[13px] text-fg-subtle">{text.length}/300 · one small change at a time</span>
        <Button variant="secondary" size="sm" loading={busy} disabled={text.trim().length < 3} onClick={send} icon={<MessageSquareText className="size-4" />}>
          Send
        </Button>
      </div>
      {failed?.error && (
        <p className="mt-3 rounded-2xl bg-warning/10 p-3 text-[14px] text-warning">
          Last request “{String(failed.result?.instruction ?? '')}” was not applied: {failed.error}
        </p>
      )}
    </div>
  )
}

function PlusCard({ project }: { project: ProjectDetail }) {
  const account = useAccount()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const plan = account.data?.plan
  if (!plan) return null
  if (plan.id === 'free')
    return (
      <section className="rounded-3xl bg-gradient-to-br from-[#E8F6FF] to-[#CCECFF] p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 text-[12px] font-semibold text-white">
          <Sparkles className="size-3.5" /> Plus
        </p>
        <h3 className="mt-3 text-[19px] font-semibold">Like it? Make it your team’s system.</h3>
        <ul className="mt-2 space-y-1 text-[15px] text-fg-muted">
          <li>· Deeper analysis of the same video (2× more frames)</li>
          <li>· Reports, team access with roles, calendar and webhooks</li>
          <li>· Up to 5 apps for your business</li>
        </ul>
        <ButtonLink to="/studio/upgrade?plan=plus" variant="primary" className="mt-4">
          Upgrade to Plus — €19 / month
        </ButtonLink>
      </section>
    )
  if (!project.media || project.origin === 'sample') return null
  const reanalyze = async () => {
    setBusy(true)
    try {
      await api.analyze(project.id)
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
    } catch (e) {
      toast.error('Could not start the analysis', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-3xl bg-ink-900 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-[17px] font-semibold">
        <Sparkles className="size-5 text-accent" /> {plan.name}: deeper analysis
      </h3>
      <p className="mt-1 text-[15px] text-fg-muted">Re-use the video you already recorded. The AI now studies {plan.frame_samples} frames instead of 6. You’ll review the result before your app changes.</p>
      <Button variant="secondary" className="mt-4" loading={busy} onClick={reanalyze} icon={<RefreshCw className="size-4" />}>
        Re-analyze my video
      </Button>
    </section>
  )
}

function Ready({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate()
  const slug = project.app_slug!
  useEffect(() => {
    // The Studio is the owner's console: remember the owner key so a private app opens directly.
    if (project.app_owner_key) setAppKey(slug, project.app_owner_key)
  }, [slug, project.app_owner_key])
  const url = appPageUrl(`/apps/${slug}`)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Copy failed', url)
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: project.workflow?.definition.name ?? 'My app', url })
    } catch {
      /* dismissed */
    }
  }
  return (
    <div className="space-y-4">
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-ink-900 p-6 text-center sm:p-10">
        <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/12 text-success">
          <Check className="size-8" />
        </motion.span>
        <h2 className="display mt-5 text-[clamp(1.8rem,5vw,2.5rem)] leading-[1.08]">Your app is ready.</h2>
        <p className="mt-2 text-[17px] text-fg-muted">
          {project.workflow?.definition.name} · version {project.workflow?.version}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink to={`/apps/${slug}`} variant="primary" size="lg" iconRight={<ExternalLink className="size-4" />}>
            Open my app
          </ButtonLink>
          <a href={api.exportUrl(slug)} className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-line bg-ink-900 px-7 text-[17px] font-medium text-fg hover:bg-ink-850">
            <Download className="size-4" /> Download
          </a>
        </div>
      </motion.section>

      <section className="rounded-3xl bg-ink-900 p-5 sm:p-6">
        <p className="text-[15px] font-medium">Online link</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-ink-950 px-3 py-2.5 text-[14px] text-fg-muted">{url}</code>
          <Button variant="secondary" size="sm" onClick={copy} icon={<Copy className="size-4" />}>
            Copy
          </Button>
          {'share' in navigator && (
            <Button variant="secondary" size="sm" onClick={share} icon={<Share2 className="size-4" />} aria-label="Share link">
              <span className="sr-only sm:not-sr-only">Share</span>
            </Button>
          )}
        </div>
        <p className="mt-2 text-[13px] text-fg-subtle">Anyone with this link can use the app, unless you make it private under Team (Plus).</p>
      </section>

      <PlusCard project={project} />

      <section className="rounded-3xl bg-ink-900 p-5 sm:p-6">
        <h3 className="text-[17px] font-semibold">Something changed?</h3>
        <p className="mt-1 text-[15px] text-fg-muted">Your app and its data stay live while you update it.</p>
        <Button variant="secondary" className="mt-4 w-full sm:w-auto" icon={<RefreshCw className="size-4" />} onClick={() => navigate(`/studio/projects/${project.id}/record`)}>
          Record again
        </Button>
        <div className="mt-6 border-t border-line-soft pt-5">
          <ChangeBox project={project} />
        </div>
      </section>
    </div>
  )
}

// --- Not analyzed yet / failed ---------------------------------------------------------------------

/** Why the analysis didn't start right after recording (passed along from the New app screen). */
export interface StartNotice {
  message: string
  upgrade: boolean
}

function Start({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient()
  const location = useLocation()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<StartNotice | null>((location.state as { analyzeError?: StartNotice } | null)?.analyzeError ?? null)
  const failed = project.analysis_job?.status === 'failed'
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      const r = await fn()
      setNotice(null)
      if (r && typeof r === 'object' && 'origin' in r) setProjectCache(qc, r as ProjectDetail)
      else qc.invalidateQueries({ queryKey: qk.project(project.id) })
    } catch (e) {
      const err = e as ApiError
      if (err.body?.upgrade) setNotice({ message: err.message, upgrade: true })
      else toast.error('Something went wrong', err.message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="rounded-3xl bg-ink-900 p-6 sm:p-8">
      <h2 className="text-[21px] font-semibold tracking-[-0.02em]">{failed && !notice ? 'We couldn’t finish the analysis.' : 'Your video is saved.'}</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-fg-muted">
        {notice ? 'The analysis didn’t start yet.' : failed ? project.analysis_job?.error : 'Start the analysis when the AI engine is available.'}
      </p>
      {notice && (
        <div role="alert" className="mt-4 rounded-2xl bg-[#FBF1DC] p-4 text-[15px] leading-relaxed text-warning">
          {notice.message}
          {notice.upgrade && (
            <ButtonLink to="/studio/upgrade?plan=plus" variant="primary" size="sm" className="mt-3 flex w-fit">
              See Plus
            </ButtonLink>
          )}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" loading={busy === 'a'} onClick={() => run('a', () => api.analyze(project.id))} icon={<RefreshCw className="size-4" />}>
          {failed ? 'Try again' : 'Analyze now'}
        </Button>
        <Button variant="secondary" loading={busy === 't'} onClick={() => run('t', () => api.convertToManual(project.id, project.name, 'rental'))} icon={<LayoutTemplate className="size-4" />}>
          Use the rental template
        </Button>
      </div>
    </section>
  )
}

// --- Page ---------------------------------------------------------------------------------------

export default function ProjectFlow() {
  const { project } = useProjectContext()
  const running = useMemo(() => [project.change_job, project.analysis_job].find((j) => j && (j.status === 'queued' || j.status === 'running')) ?? null, [project])
  const liveJob = useJob(running?.id).data ?? running
  const compiling = project.status === 'compiling'
  useJob(compiling ? project.compile_job?.id : null) // follows the build and refreshes the project when it's done
  const view = running ? 'working' : compiling ? 'building' : !project.workflow ? 'start' : project.status === 'ready' ? 'ready' : 'review'

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-10">
      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {view === 'working' && liveJob && <Working job={liveJob} title={liveJob.kind === 'change' ? 'Working on your change' : 'Understanding your video'} />}
          {view === 'building' && (
            <section className="rounded-3xl bg-ink-900 p-8 text-center">
              <Spinner className="mx-auto size-8 text-accent" />
              <h2 className="mt-4 text-[21px] font-semibold">Building your app…</h2>
            </section>
          )}
          {view === 'start' && <Start project={project} />}
          {view === 'review' && (
            <>
              {project.app_slug && (
                <div className="mb-6 rounded-2xl bg-accent/8 p-4 text-[15px] text-fg-muted">
                  Your current app keeps running until you confirm this update.{' '}
                  <Link to={`/apps/${project.app_slug}`} className="font-medium text-accent">
                    Open it
                  </Link>
                </div>
              )}
              {project.change_job?.status === 'succeeded' && relativeTime(project.change_job.updated_at) !== '' && project.workflow?.source === 'change_request' && (
                <div className="mb-6 rounded-2xl bg-ink-900 p-4 text-[15px]">
                  <p className="font-medium">Your request: “{String(project.change_job.result?.instruction ?? '')}”</p>
                  <ul className="mt-1 list-disc pl-5 text-fg-muted">
                    {((project.change_job.result?.summary as string[] | undefined) ?? []).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Review project={project} />
            </>
          )}
          {view === 'ready' && <Ready project={project} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
