import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useProjectContext } from './ProjectLayout'
import { CaptureFlow } from '../../../components/studio/CaptureFlow'
import { api, ApiError } from '../../../lib/api'
import { setProjectCache } from '../../../lib/queries'

/** Record a new video for an existing app. The app keeps running until the new version is confirmed. */
export default function RecordAgain() {
  const { project } = useProjectContext()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const submit = async ({ video, narration }: { video: { file: File } | null; narration: string }) => {
    setBusy(true)
    setError(null)
    try {
      let p = await api.patchProject(project.id, { narration: narration.trim() })
      if (video) {
        abort.current = new AbortController()
        setProgress(0)
        p = await api.uploadMedia(project.id, video.file, setProgress, abort.current.signal)
      }
      setProjectCache(qc, p)
      await api.analyze(project.id)
      navigate(`/studio/projects/${project.id}`)
    } catch (e) {
      const err = e as ApiError
      setBusy(false)
      setProgress(null)
      if (err.status !== -1) setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-6 sm:px-6 sm:py-10">
      <Link to={`/studio/projects/${project.id}`} className="inline-flex items-center gap-1 text-[15px] text-accent">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="display mt-4 text-[clamp(1.9rem,6vw,2.5rem)] leading-[1.08]">Record what changed.</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-fg-muted">
        Show the process again, the way it works now. You’ll review the differences before your app is updated — the current version stays live meanwhile.
      </p>
      <div className="mt-8">
        <CaptureFlow busy={busy} progress={progress} error={error} submitLabel="Update my app" onSubmit={submit} onCancelUpload={() => abort.current?.abort()} />
      </div>
    </div>
  )
}
