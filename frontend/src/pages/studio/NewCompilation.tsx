import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileText, LayoutTemplate, Lock, Square } from 'lucide-react'
import { Page } from '../../components/studio/Page'
import { RecordingControl, VideoUploadZone, validateVideo, type StagedVideo } from '../../components/studio/Capture'
import { Button } from '../../components/ui/Button'
import { TechnicalLabel } from '../../components/ui/primitives'
import { api, ApiError } from '../../lib/api'
import { setProjectCache, useCapabilities } from '../../lib/queries'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/cn'

function ManualStart() {
  const [name, setName] = useState('Equipment rental desk')
  const [template, setTemplate] = useState<'rental' | 'blank'>('rental')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const p = await api.createManual(name.trim(), template)
      setProjectCache(qc, p)
      navigate(`/studio/projects/${p.id}`)
    } catch (err) {
      toast.error('Could not create the project', (err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 max-w-2xl space-y-6">
      <label className="block">
        <TechnicalLabel className="mb-2 block">Workflow name</TechnicalLabel>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <fieldset>
        <legend className="meta mb-2">Starting point</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { k: 'rental', icon: LayoutTemplate, title: 'Equipment rental template', body: 'Inventory, customers and rentals with availability rules. Edit anything before compiling.' },
              { k: 'blank', icon: Square, title: 'Blank workflow', body: 'Define entities, states and rules yourself in the workflow editor.' },
            ] as const
          ).map((o) => (
            <label
              key={o.k}
              className={cn('surface flex cursor-pointer flex-col rounded-2xl p-4 transition-colors', template === o.k ? 'border-accent/60' : 'hover:border-line')}
            >
              <input type="radio" name="template" value={o.k} checked={template === o.k} onChange={() => setTemplate(o.k)} className="sr-only" />
              <o.icon className={cn('size-4', template === o.k ? 'text-accent' : 'text-fg-muted')} />
              <span className="mt-3 text-sm font-medium text-fg">{o.title}</span>
              <span className="mt-1 text-[13px] leading-relaxed text-fg-muted">{o.body}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" size="lg" loading={busy} iconRight={<ArrowRight className="size-4" />}>
        Create workflow
      </Button>
    </form>
  )
}

export default function NewCompilation() {
  const [params, setParams] = useSearchParams()
  const manual = params.get('mode') === 'manual'
  const caps = useCapabilities()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [narration, setNarration] = useState('')
  const [staged, setStaged] = useState<StagedVideo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'save' | null>(null)
  const abort = useRef<AbortController | null>(null)

  const limits = { maxMb: caps.data?.limits.max_upload_mb ?? 200, maxSeconds: caps.data?.limits.max_video_seconds ?? 300 }
  const modelReady = !!caps.data?.model.reachable && !!caps.data?.model.installed

  useEffect(() => () => {
    if (staged?.url) URL.revokeObjectURL(staged.url)
  }, [staged])

  const stage = async (file: File, recorded = false) => {
    setFileError(null)
    try {
      const v = await validateVideo(file, limits, recorded)
      setStaged(v)
      if (!name) setName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80))
    } catch (e) {
      setFileError((e as Error).message)
    }
  }

  const submit = async (analyze: boolean) => {
    if (!staged && !narration.trim()) {
      setFileError('Add a recording or write a narration to continue.')
      return
    }
    setBusy(analyze ? 'analyze' : 'save')
    let projectId: string | null = null
    try {
      let p = await api.createProject(name.trim() || 'Untitled observation', narration.trim())
      projectId = p.id
      if (staged) {
        abort.current = new AbortController()
        setProgress(0)
        p = await api.uploadMedia(p.id, staged.file, setProgress, abort.current.signal)
      }
      setProjectCache(qc, p)
      if (analyze) await api.analyze(p.id)
      navigate(`/studio/projects/${p.id}`)
    } catch (e) {
      const err = e as ApiError
      setProgress(null)
      setBusy(null)
      if (err.status === -1) {
        toast.info('Upload cancelled')
        if (projectId) api.deleteProject(projectId).catch(() => undefined)
        return
      }
      if (projectId && (err.status === 415 || err.status === 413)) api.deleteProject(projectId).catch(() => undefined)
      setFileError(err.message)
      toast.error('Could not start the compilation', err.message)
    }
  }

  return (
    <Page>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <TechnicalLabel>Step 1 · capture reality</TechnicalLabel>
          <h1 className="display mt-4 text-[clamp(2.25rem,4vw,3.5rem)] leading-[1]">
            Show us how the work <span className="serif-accent text-accent">happens.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-fg-muted">
            {manual ? 'No recording or model at hand? Define the workflow directly — it goes through the same review, validation and compiler.' : 'Upload a short recording or capture a workflow directly.'}
          </p>
          <div className="mt-8 inline-flex rounded-full border border-line-soft bg-ink-925 p-1" role="tablist" aria-label="How to start">
            {[
              { k: false, label: 'Record or upload' },
              { k: true, label: 'Define manually' },
            ].map((t) => (
              <button
                key={String(t.k)}
                role="tab"
                aria-selected={manual === t.k}
                onClick={() => setParams(t.k ? { mode: 'manual' } : {})}
                className={cn('h-8 rounded-full px-3.5 text-[13px] transition-colors', manual === t.k ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!manual && (
            <aside className="mt-10 rounded-2xl border border-line-soft p-4" aria-label="Privacy notice">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <Lock className="size-3.5 text-accent" /> What happens to your media
              </div>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-muted">
                <li>Files are stored on this Reality Compiler server only, under a server-generated name.</li>
                <li>Audio is transcribed locally with faster-whisper; frames and text go to the model server configured by your administrator ({caps.data?.model.url ?? 'Ollama'}).</li>
                <li>Nothing is sent to third-party cloud services by this application. Deleting a project deletes its media and derived frames.</li>
              </ul>
            </aside>
          )}
        </div>

        <div className="lg:col-span-8">
          {manual ? (
            <ManualStart />
          ) : (
            <div className="space-y-6">
              <label className="block">
                <TechnicalLabel className="mb-2 block">Project name</TechnicalLabel>
                <input className="field-input" placeholder="e.g. Rental counter — weekday intake" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
              </label>

              <VideoUploadZone
                staged={staged}
                onFile={(f) => stage(f)}
                onRemove={() => {
                  setStaged(null)
                  setFileError(null)
                }}
                error={fileError}
                progress={progress}
                disabled={!!busy}
              />

              {!staged && <RecordingControl onRecorded={(f) => stage(f, true)} maxSeconds={limits.maxSeconds} disabled={!!busy} />}

              <label className="block">
                <span className="mb-2 flex items-center justify-between">
                  <TechnicalLabel>Narration · optional</TechnicalLabel>
                  <TechnicalLabel>{narration.length}/8000</TechnicalLabel>
                </span>
                <textarea
                  className="field-input min-h-[120px] resize-y leading-relaxed"
                  placeholder="Explain the process in your own words: what you check, what you write down, what must never happen…"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value.slice(0, 8000))}
                />
                <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
                  <FileText className="size-3.5" /> Used alongside the spoken transcript. You can edit the transcript after upload.
                </span>
              </label>

              {caps.data && !modelReady && (
                <p className="rounded-xl border border-warning/25 bg-warning/[0.04] px-4 py-3 text-sm text-fg-muted">
                  <span className="text-warning">The AI model is unavailable</span> ({caps.data.model.error}). You can still upload now and analyze later, or define the workflow manually.
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-line-soft pt-6 sm:flex-row sm:justify-end">
                {progress !== null && progress < 1 && (
                  <Button variant="ghost" onClick={() => abort.current?.abort()}>
                    Cancel upload
                  </Button>
                )}
                <Button onClick={() => submit(false)} loading={busy === 'save'} disabled={!!busy}>
                  Save without analyzing
                </Button>
                <Button variant="primary" onClick={() => submit(true)} loading={busy === 'analyze'} disabled={!!busy || !modelReady} iconRight={<ArrowRight className="size-4" />}>
                  Upload and analyze
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
