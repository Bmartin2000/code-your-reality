import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LayoutTemplate, Square } from 'lucide-react'
import { CaptureFlow } from '../../components/studio/CaptureFlow'
import { Button } from '../../components/ui/Button'
import { api, ApiError } from '../../lib/api'
import type { ProjectDetail } from '../../lib/types'
import type { StartNotice } from './project/ProjectFlow'
import { qk, setProjectCache, useCapabilities } from '../../lib/queries'
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
      toast.error('Could not create the app', (err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="block">
        <span className="mb-2 block text-[15px] font-medium">App name</span>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-[15px] font-medium">Start from</legend>
        {(
          [
            { k: 'rental', icon: LayoutTemplate, title: 'Rental template', body: 'Items, customers and rentals with availability rules.' },
            { k: 'blank', icon: Square, title: 'Blank app', body: 'Define everything yourself in the editor.' },
          ] as const
        ).map((o) => (
          <label key={o.k} className={cn('flex cursor-pointer flex-col rounded-3xl border-2 bg-ink-900 p-5 transition-colors', template === o.k ? 'border-accent' : 'border-transparent')}>
            <input type="radio" name="template" value={o.k} checked={template === o.k} onChange={() => setTemplate(o.k)} className="sr-only" />
            <o.icon className="size-6 text-accent" />
            <span className="mt-3 text-[17px] font-semibold">{o.title}</span>
            <span className="mt-1 text-[14px] text-fg-muted">{o.body}</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        Create app
      </Button>
    </form>
  )
}

export default function NewCompilation() {
  const [params] = useSearchParams()
  const manual = params.get('mode') === 'manual'
  const caps = useCapabilities()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const modelReady = !!caps.data?.model.reachable && !!caps.data?.model.installed

  const submit = async ({ video, narration }: { video: { file: File } | null; narration: string }) => {
    setBusy(true)
    setError(null)
    let projectId: string | null = null
    let p: ProjectDetail
    try {
      const name = video ? video.file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80) : 'My process'
      p = await api.createProject(name.startsWith('recording') ? 'My process' : name, narration.trim())
      projectId = p.id
      if (video) {
        abort.current = new AbortController()
        setProgress(0)
        p = await api.uploadMedia(p.id, video.file, setProgress, abort.current.signal)
      }
    } catch (e) {
      // Nothing usable was saved: remove the empty project and stay here so the person can retry.
      const err = e as ApiError
      setBusy(false)
      setProgress(null)
      if (projectId) api.deleteProject(projectId).catch(() => undefined)
      if (err.status !== -1) setError(err.message)
      return
    }
    // The recording is saved from here on: always continue on the project page, so a slow or refused
    // analysis never leaves the person on this screen (where a reload would start over).
    setProjectCache(qc, p)
    let analyzeError: StartNotice | undefined
    if (modelReady) {
      try {
        await api.analyze(p.id)
        qc.invalidateQueries({ queryKey: qk.project(p.id) })
      } catch (e) {
        const err = e as ApiError
        analyzeError = { message: err.message, upgrade: !!err.body?.upgrade }
      }
    }
    navigate(`/studio/projects/${p.id}`, { state: analyzeError ? { analyzeError } : undefined })
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 sm:py-12">
      {manual && (
        <Link to="/studio/new" className="mb-6 inline-flex items-center gap-1 text-[15px] text-accent">
          <ArrowLeft className="size-4" /> Record instead
        </Link>
      )}
      <h1 className="display text-[clamp(2rem,6vw,2.75rem)] leading-[1.08]">{manual ? 'Start without a video' : 'Show us how you work.'}</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-fg-muted">
        {manual ? 'Pick a starting point. You can record a video later to refine it.' : 'Record the process once, from start to finish. We’ll turn it into an app you can check before it goes live.'}
      </p>
      <div className="mt-8">
        {manual ? (
          <ManualStart />
        ) : (
          <>
            <CaptureFlow busy={busy} progress={progress} error={error} submitLabel={modelReady ? 'Create my app' : 'Save video'} onSubmit={submit} onCancelUpload={() => abort.current?.abort()} />
            <p className="mt-8 text-center text-[15px] text-fg-muted">
              No video yet?{' '}
              <Link to="/studio/new?mode=manual" className="text-accent">
                Start from a template
              </Link>{' '}
              or{' '}
              <Link to="/demo" className="text-accent">
                try the demo
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}
