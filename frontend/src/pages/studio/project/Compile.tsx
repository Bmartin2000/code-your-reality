import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, ArrowRight, ArrowUpRight, Box, FormInput, LayoutPanelLeft, Scale, ShieldCheck, Sparkles } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { Page } from '../../../components/studio/Page'
import { CompilerCore, compileLayers } from '../../../components/studio/CompilerCore'
import { StageTimeline } from '../../../components/studio/StageTimeline'
import { Button, ButtonLink } from '../../../components/ui/Button'
import { TechnicalLabel } from '../../../components/ui/primitives'
import { api } from '../../../lib/api'
import { qk, useJob } from '../../../lib/queries'
import { toast } from '../../../lib/toast'
import type { AppDetail, Issue, Manifest } from '../../../lib/types'
import { cn } from '../../../lib/cn'

const ASSEMBLY = [
  { key: 'nav', stage: 'prepare_forms', label: 'Navigation structure', icon: LayoutPanelLeft },
  { key: 'entities', stage: 'build_models', label: 'Data entities', icon: Box },
  { key: 'forms', stage: 'prepare_forms', label: 'Forms', icon: FormInput },
  { key: 'rules', stage: 'wire_transitions', label: 'Rules & transitions', icon: Scale },
  { key: 'live', stage: 'ready', label: 'Live application', icon: Sparkles },
] as const

function AssemblyBlock({ k, manifest }: { k: (typeof ASSEMBLY)[number]['key']; manifest: Manifest }) {
  if (k === 'nav')
    return (
      <div className="flex flex-wrap gap-1.5">
        {manifest.views.map((v) => (
          <span key={v.key} className="rounded-md border border-line bg-ink-950 px-2 py-1 text-[12px] text-fg-muted">
            {v.label}
          </span>
        ))}
      </div>
    )
  if (k === 'entities')
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {manifest.entities.map((e) => (
          <div key={e.key} className="rounded-lg border border-line bg-ink-950 px-3 py-2">
            <p className="text-[13px] font-medium text-fg">{e.label}</p>
            <p className="font-mono text-[10.5px] text-fg-subtle">
              {e.fields.length} fields{e.state ? ` · ${e.state.states.length} states` : ''}
            </p>
          </div>
        ))}
      </div>
    )
  if (k === 'forms')
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {manifest.forms.map((f) => {
          const e = manifest.entities.find((x) => x.key === f.entity)!
          return (
            <div key={f.entity} className="rounded-lg border border-line bg-ink-950 p-2.5">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">New {e.label}</p>
              {f.create_fields.slice(0, 4).map((k2) => (
                <div key={k2} className="mb-1 h-4 rounded border border-line-soft px-1.5 text-[9.5px] leading-4 text-fg-subtle">
                  {e.fields.find((x) => x.key === k2)?.label}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  if (k === 'rules')
    return (
      <ul className="space-y-1">
        {manifest.rules.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-[12.5px]">
            <ShieldCheck className={cn('mt-0.5 size-3.5 shrink-0', r.enforced ? 'text-accent' : 'text-fg-subtle')} />
            <span className={r.enforced ? 'text-fg-muted' : 'text-fg-subtle'}>
              {r.statement} {!r.enforced && <span className="font-mono text-[10px] uppercase">· documented</span>}
            </span>
          </li>
        ))}
      </ul>
    )
  return null
}

export default function Compile() {
  const { project } = useProjectContext()
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(project.compile_job?.id ?? null)
  const [replay, setReplay] = useState(false)
  const [visible, setVisible] = useState(99)
  const [starting, setStarting] = useState(false)
  const job = useJob(jobId).data ?? (jobId === project.compile_job?.id ? project.compile_job : null)
  const slug = (job?.result?.slug as string | undefined) ?? project.app_slug
  const app = useQuery({ queryKey: qk.app(slug ?? ''), queryFn: () => api.app(slug!) as Promise<AppDetail>, enabled: !!slug && job?.status === 'succeeded' })

  const finished = job ? job.stages.filter((s) => s.status === 'done' || s.status === 'failed').length : 0

  // Replay the recorded stage results in order (timings shown are the compiler's own measurements).
  useEffect(() => {
    if (!replay) return
    if (visible >= finished) {
      if (job && (job.status === 'succeeded' || job.status === 'failed') && visible >= finished) setReplay(false)
      return
    }
    const t = window.setTimeout(() => setVisible((v) => v + 1), 420)
    return () => window.clearTimeout(t)
  }, [replay, visible, finished, job])

  const start = async () => {
    setStarting(true)
    try {
      const j = await api.compile(project.id)
      setVisible(0)
      setReplay(true)
      setJobId(j.id)
      qc.invalidateQueries({ queryKey: qk.project(project.id) })
    } catch (e) {
      toast.error('Compilation could not start', (e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  if (!project.workflow?.approved) {
    return (
      <Page>
        <div className="mx-auto max-w-xl py-16 text-center">
          <TechnicalLabel>Step 5 · compile</TechnicalLabel>
          <h2 className="display mt-4 text-4xl">Approval comes first.</h2>
          <p className="mt-4 text-fg-muted">Only a human-approved workflow version can be compiled. Review the findings and approve the workflow.</p>
          <ButtonLink to={`/studio/projects/${project.id}/review`} variant="primary" className="mt-8" iconRight={<ArrowRight className="size-4" />}>
            Go to verification
          </ButtonLink>
        </div>
      </Page>
    )
  }

  const shownStages = job?.stages ?? []
  const effectiveVisible = replay ? visible : 99
  const doneKeys = new Set(shownStages.filter((s, i) => i < effectiveVisible && s.status === 'done').map((s) => s.key))
  const layers = job ? compileLayers(shownStages.map((s, i) => (i < effectiveVisible ? s : { ...s, status: i === effectiveVisible ? 'running' : 'pending' }))) : (['done', 'done', 'idle', 'idle'] as const).slice()
  const ok = job?.status === 'succeeded' && !replay
  const failed = job?.status === 'failed' && !replay
  const issues = (job?.result?.issues as Issue[] | undefined) ?? []
  const running = !!job && (job.status === 'running' || job.status === 'queued' || replay)

  return (
    <Page wide>
      <div className="grid gap-10 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <TechnicalLabel>Step 5 · compile</TechnicalLabel>
          <h2 className="display mt-3 text-[clamp(2rem,3.4vw,3.25rem)] leading-[1]">
            {ok ? (
              <>
                The application is <span className="serif-accent text-accent">live.</span>
              </>
            ) : (
              <>
                From verified logic to <span className="serif-accent text-accent">software.</span>
              </>
            )}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-fg-muted">
            The compiler turns workflow v{project.workflow.version} into data models, forms, views and a guarded state machine. No code is generated — the manifest runs on Code Your Reality's predefined runtime.
          </p>
          <CompilerCore layers={layers} className="mt-8 max-w-[560px]" label="Compilation progress" />
          <div className="mt-8 flex flex-wrap gap-2">
            {ok && slug ? (
              <>
                <ButtonLink to={`/apps/${slug}`} variant="primary" size="lg" iconRight={<ArrowUpRight className="size-4" />}>
                  Open application
                </ButtonLink>
                <Button size="lg" onClick={start} loading={starting}>
                  Recompile
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" onClick={start} loading={starting || running} disabled={running} iconRight={<ArrowRight className="size-4" />}>
                Compile Application
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-6 xl:col-span-7">
          <div className="surface rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <TechnicalLabel>Compiler stages</TechnicalLabel>
              {job && <TechnicalLabel>job {job.id.slice(0, 8)} · timings measured by the compiler</TechnicalLabel>}
            </div>
            {job ? (
              <StageTimeline stages={shownStages} visibleCount={effectiveVisible} />
            ) : (
              <p className="text-[13.5px] text-fg-muted">Not compiled yet. Stages appear here as the compiler reports them.</p>
            )}
            {failed && (
              <div className="mt-5 rounded-xl border border-error/30 bg-error/[0.05] p-4" role="alert">
                <p className="flex items-center gap-2 text-sm font-medium text-error">
                  <AlertCircle className="size-4" /> {job?.error}
                </p>
                {issues.filter((i) => i.severity === 'error').length > 0 && (
                  <ul className="mt-2 space-y-1 text-[13px] text-fg-muted">
                    {issues
                      .filter((i) => i.severity === 'error')
                      .map((i, k) => (
                        <li key={k}>· {i.message}</li>
                      ))}
                  </ul>
                )}
                <Link to={`/studio/projects/${project.id}/advanced`} className="mt-3 inline-block text-[13px] text-fg underline-offset-4 hover:underline">
                  Fix in the workspace
                </Link>
              </div>
            )}
          </div>

          {/* Signature: application assembly, driven by compiled output */}
          <div className="surface rounded-2xl p-5">
            <TechnicalLabel className="mb-4 block">Application assembly</TechnicalLabel>
            <ol className="space-y-3">
              {ASSEMBLY.map((a) => {
                const ready = doneKeys.has(a.stage) && app.data
                return (
                  <li key={a.key} className={cn('rounded-xl border p-3.5 transition-colors duration-500', ready ? 'border-line bg-ink-900' : 'border-dashed border-line-soft')}>
                    <div className="flex items-center gap-2.5">
                      <a.icon className={cn('size-4 transition-colors', ready ? 'text-accent' : 'text-fg-subtle')} />
                      <span className={cn('text-[13.5px] font-medium', ready ? 'text-fg' : 'text-fg-subtle')}>{a.label}</span>
                    </div>
                    <AnimatePresence>
                      {ready && app.data && a.key !== 'live' && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                          <div className="pt-3">
                            <AssemblyBlock k={a.key} manifest={app.data.manifest} />
                          </div>
                        </motion.div>
                      )}
                      {ready && a.key === 'live' && slug && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-3">
                          <Link to={`/apps/${slug}`} className="group flex items-center justify-between rounded-lg border border-accent/30 bg-accent/[0.05] px-3 py-2.5">
                            <span className="font-mono text-[12px] text-accent">/apps/{slug}</span>
                            <ArrowUpRight className="size-4 text-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                          </Link>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </Page>
  )
}
