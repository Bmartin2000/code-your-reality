import { useEffect, useRef, useState } from 'react'
import { Camera, Lightbulb, Lock, Upload } from 'lucide-react'
import { RecordingControl, VideoUploadZone, validateVideo, type StagedVideo } from './Capture'
import { Button } from '../ui/Button'
import { useCapabilities } from '../../lib/queries'
import { useMediaQuery } from '../../lib/hooks'
import { useAiHosting } from '../../lib/hosting'

export interface CaptureResult {
  video: StagedVideo | null
  narration: string
}

/**
 * Mobile-first capture: on phones the big button opens the native camera app; on computers it
 * records with the webcam (or screen) in the browser. Upload is always available.
 */
export function CaptureFlow({
  busy,
  progress,
  submitLabel,
  onSubmit,
  onCancelUpload,
  error,
}: {
  busy: boolean
  progress: number | null
  submitLabel: string
  onSubmit: (r: CaptureResult) => void
  onCancelUpload?: () => void
  error?: string | null
}) {
  const caps = useCapabilities()
  const hosting = useAiHosting()
  const touch = useMediaQuery('(pointer: coarse)')
  const [staged, setStaged] = useState<StagedVideo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [narration, setNarration] = useState('')
  const [recording, setRecording] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const limits = { maxMb: caps.data?.limits.max_upload_mb ?? 200, maxSeconds: caps.data?.limits.max_video_seconds ?? 300 }

  useEffect(
    () => () => {
      if (staged?.url) URL.revokeObjectURL(staged.url)
    },
    [staged],
  )

  const stage = async (file: File, recorded = false) => {
    setFileError(null)
    setRecording(false)
    try {
      setStaged(await validateVideo(file, limits, recorded))
    } catch (e) {
      setFileError((e as Error).message)
    }
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) stage(f, e.target === cameraInput.current)
  }

  return (
    <div className="space-y-5">
      {!staged && !recording && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => (touch ? cameraInput.current?.click() : setRecording(true))}
            disabled={busy}
            className="flex min-h-[148px] flex-col items-center justify-center gap-3 rounded-3xl bg-accent px-6 py-8 text-on-accent transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Camera className="size-8" aria-hidden />
            <span className="text-[19px] font-semibold">Record with camera</span>
            <span className="text-[14px] opacity-80">{touch ? 'Opens your phone camera' : 'Uses this computer’s camera'}</span>
          </button>
          <button
            onClick={() => uploadInput.current?.click()}
            disabled={busy}
            className="flex min-h-[148px] flex-col items-center justify-center gap-3 rounded-3xl border border-line-soft bg-ink-900 px-6 py-8 text-fg transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Upload className="size-8 text-accent" aria-hidden />
            <span className="text-[19px] font-semibold">Upload a video</span>
            <span className="text-[14px] text-fg-subtle">MP4, MOV or WebM · up to {limits.maxMb} MB</span>
          </button>
          <input ref={cameraInput} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} onChange={pick} />
          <input ref={uploadInput} type="file" accept="video/*,.mp4,.mov,.webm,.mkv,.m4v" className="sr-only" tabIndex={-1} onChange={pick} />
        </div>
      )}

      {recording && !staged && (
        <div>
          <RecordingControl onRecorded={(f) => stage(f, true)} maxSeconds={limits.maxSeconds} disabled={busy} />
          <Button variant="ghost" className="mt-2" onClick={() => setRecording(false)}>
            Cancel
          </Button>
        </div>
      )}

      {staged && (
        <VideoUploadZone
          staged={staged}
          onFile={(f) => stage(f)}
          onRemove={() => {
            setStaged(null)
            setFileError(null)
          }}
          error={fileError}
          progress={progress}
          disabled={busy}
        />
      )}
      {fileError && !staged && (
        <p role="alert" className="text-[15px] text-error">
          {fileError}
        </p>
      )}

      <label className="block">
        <span className="mb-2 block text-[15px] font-medium text-fg">
          Anything to add? <span className="font-normal text-fg-subtle">Optional</span>
        </span>
        <textarea
          className="field-input min-h-[110px] resize-y leading-relaxed"
          placeholder="For example: “A camera can only be rented if it’s on the shelf. Every rental needs a deposit.”"
          value={narration}
          maxLength={8000}
          onChange={(e) => setNarration(e.target.value)}
        />
      </label>

      <div className="flex gap-3 rounded-2xl bg-ink-900 p-4 text-[14px] leading-relaxed text-fg-muted">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <p>
          <span className="font-medium text-fg">For the best result:</span> keep it to 1–2 minutes, do the task once from start to finish, and say out loud what you check and what must never happen.
        </p>
      </div>

      {(error || (caps.data && !(caps.data.model.reachable && caps.data.model.installed))) && (
        <p role="alert" className="rounded-2xl bg-warning/10 p-4 text-[14px] text-warning">
          {error ?? `The AI engine is offline (${caps.data!.model.error}). You can still save your video and analyze it later.`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={busy || (!staged && !narration.trim())} onClick={() => onSubmit({ video: staged, narration })}>
          {submitLabel}
        </Button>
        {busy && progress !== null && progress < 1 && onCancelUpload && (
          <Button variant="ghost" onClick={onCancelUpload}>
            Cancel upload
          </Button>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-fg-subtle">
        <Lock className="size-3.5" aria-hidden /> {hosting.privacy}
      </p>
    </div>
  )
}
