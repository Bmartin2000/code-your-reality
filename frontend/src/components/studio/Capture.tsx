import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, Circle, FileVideo, MonitorUp, RefreshCw, Square, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '../ui/Button'
import { TechnicalLabel } from '../ui/primitives'
import { bytes, timecode } from '../../lib/format'
import { cn } from '../../lib/cn'

export const ACCEPTED_EXT = ['.mp4', '.m4v', '.mov', '.webm', '.mkv']
const ACCEPTED_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-m4v']

export interface StagedVideo {
  file: File
  url: string
  duration: number | null
  width: number | null
  height: number | null
  recorded: boolean
}

function readMetadata(file: File): Promise<{ duration: number | null; width: number | null; height: number | null; url: string }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = () =>
      resolve({
        url,
        duration: Number.isFinite(v.duration) ? v.duration : null,
        width: v.videoWidth || null,
        height: v.videoHeight || null,
      })
    v.onloadedmetadata = () => {
      // MediaRecorder WebM reports Infinity until the end is seeked once.
      if (v.duration === Infinity) {
        v.currentTime = 1e7
        v.ontimeupdate = () => {
          v.ontimeupdate = null
          done()
        }
      } else done()
    }
    v.onerror = () => resolve({ url, duration: null, width: null, height: null })
    v.src = url
  })
}

export async function validateVideo(file: File, limits: { maxMb: number; maxSeconds: number }, recorded = false): Promise<StagedVideo> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_EXT.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
    throw new Error(`“${file.name}” is not a supported video. Use ${ACCEPTED_EXT.join(', ')}.`)
  }
  if (file.size > limits.maxMb * 1024 * 1024) {
    throw new Error(`This file is ${bytes(file.size)}; the limit is ${limits.maxMb} MB.`)
  }
  if (file.size < 1024) throw new Error('This file is empty or too small to be a video.')
  const meta = await readMetadata(file)
  if (meta.duration && meta.duration > limits.maxSeconds) {
    URL.revokeObjectURL(meta.url)
    throw new Error(`This recording is ${timecode(meta.duration)} long; keep it under ${timecode(limits.maxSeconds)}.`)
  }
  return { file, recorded, ...meta }
}

export function VideoUploadZone({
  staged,
  onFile,
  onRemove,
  error,
  progress,
  disabled,
}: {
  staged: StagedVideo | null
  onFile: (f: File) => void
  onRemove: () => void
  error: string | null
  progress: number | null
  disabled?: boolean
}) {
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    if (disabled) return
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
  }

  if (staged) {
    return (
      <div className="surface overflow-hidden rounded-2xl">
        <div className="relative bg-black">
          <video src={staged.url} controls playsInline className="mx-auto max-h-[420px] w-full" aria-label="Preview of the selected recording" />
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-950 text-fg-muted">
              <FileVideo className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{staged.file.name}</p>
              <TechnicalLabel>
                {bytes(staged.file.size)} · {staged.duration ? timecode(staged.duration) : 'duration measured on upload'}
                {staged.width ? ` · ${staged.width}×${staged.height}` : ''}
                {staged.recorded ? ' · recorded in browser' : ''}
              </TechnicalLabel>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="quiet" onClick={() => input.current?.click()} disabled={disabled} icon={<RefreshCw className="size-3.5" />}>
              Replace
            </Button>
            <Button size="sm" variant="quiet" onClick={onRemove} disabled={disabled} icon={<Trash2 className="size-3.5" />}>
              Remove
            </Button>
          </div>
        </div>
        {progress !== null && (
          <div className="border-t border-line-soft px-4 py-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Upload progress">
            <div className="mb-2 flex justify-between">
              <TechnicalLabel tone="muted">{progress < 1 ? 'Uploading' : 'Upload complete · verifying on server'}</TechnicalLabel>
              <TechnicalLabel tone="accent">{Math.round(progress * 100)}%</TechnicalLabel>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-ink-700">
              <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
            </div>
          </div>
        )}
        <input ref={input} type="file" accept={[...ACCEPTED_EXT, ...ACCEPTED_MIME].join(',')} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
    )
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby="upload-hint"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onClick={() => !disabled && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn(
          'group relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-300',
          drag ? 'border-accent bg-accent/[0.04]' : 'border-line bg-ink-925 hover:border-fg-subtle/50 hover:bg-ink-900',
          error && 'border-error/50',
        )}
      >
        <div className={cn('grid-paper pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500', drag && 'opacity-40')} aria-hidden />
        <motion.span
          animate={{ y: drag ? -4 : 0, scale: drag ? 1.06 : 1 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn('relative flex size-12 items-center justify-center rounded-xl border bg-ink-950', drag ? 'border-accent text-accent' : 'border-line text-fg-muted')}
        >
          <UploadCloud className="size-5" />
        </motion.span>
        <p className="relative mt-5 text-[15px] font-medium text-fg">{drag ? 'Release to stage this recording' : 'Drop a recording here, or browse'}</p>
        <p id="upload-hint" className="relative mt-1.5 text-sm text-fg-muted">
          MP4, MOV, WebM or MKV · a short demonstration works best
        </p>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-2 text-sm text-error">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <input ref={input} type="file" accept={[...ACCEPTED_EXT, ...ACCEPTED_MIME].join(',')} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  )
}

type RecSource = 'camera' | 'screen'

export function RecordingControl({ onRecorded, maxSeconds, disabled }: { onRecorded: (f: File) => void; maxSeconds: number; disabled?: boolean }) {
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }, [])

  useEffect(() => {
    if (state === 'recording' && elapsed >= maxSeconds) stop()
  }, [elapsed, maxSeconds, state, stop])

  const start = async (source: RecSource) => {
    setError(null)
    setState('requesting')
    try {
      let s: MediaStream
      if (source === 'camera') {
        s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: true })
      } else {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
          mic.getAudioTracks().forEach((t) => display.addTrack(t))
        } catch {
          /* narration is optional; continue without microphone */
        }
        s = display
      }
      stream.current = s
      if (preview.current) {
        preview.current.srcObject = s
        preview.current.play().catch(() => undefined)
      }
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        const type = rec.mimeType || 'video/webm'
        const ext = type.includes('mp4') ? 'mp4' : 'webm'
        const blob = new Blob(chunks.current, { type })
        cleanup()
        setState('idle')
        setElapsed(0)
        if (blob.size > 0) {
          const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
          onRecorded(new File([blob], `recording-${stamp}.${ext}`, { type }))
        }
      }
      s.getVideoTracks()[0]?.addEventListener('ended', () => stop())
      rec.start(1000)
      recorder.current = rec
      setElapsed(0)
      timer.current = window.setInterval(() => setElapsed((x) => x + 1), 1000)
      setState('recording')
    } catch (e) {
      cleanup()
      setState('idle')
      const name = (e as DOMException)?.name
      setError(
        name === 'NotAllowedError'
          ? 'Permission was denied. Allow camera/screen access in your browser to record here, or upload a file instead.'
          : name === 'NotFoundError'
            ? 'No camera or microphone was found.'
            : 'Recording could not start in this browser. Upload a file instead.',
      )
    }
  }

  if (!supported) {
    return <p className="text-sm text-fg-muted">This browser can't record video. Upload a file instead.</p>
  }

  return (
    <div className="surface rounded-2xl p-4">
      {state === 'idle' || state === 'requesting' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-fg">Capture directly</p>
            <p className="text-[13px] text-fg-muted">Record yourself doing the task, or your screen while you narrate.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => start('camera')} disabled={disabled || state === 'requesting'} icon={<Camera className="size-3.5" />}>
              Camera
            </Button>
            <Button size="sm" onClick={() => start('screen')} disabled={disabled || state === 'requesting'} icon={<MonitorUp className="size-3.5" />}>
              Screen
            </Button>
          </div>
        </div>
      ) : null}
      <div className={cn('overflow-hidden rounded-xl bg-black', state === 'recording' ? 'mt-0 block' : 'hidden')}>
        <video ref={preview} muted playsInline className="max-h-[360px] w-full" aria-label="Live recording preview" />
      </div>
      {state === 'recording' && (
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-[12px] text-error">
            <Circle className="size-2.5 animate-soft-pulse fill-current" aria-hidden /> REC {timecode(elapsed)} / {timecode(maxSeconds)}
          </span>
          <Button size="sm" variant="danger" onClick={stop} icon={<Square className="size-3 fill-current" />}>
            Stop recording
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}
