import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import type { MediaAsset, SampleScene, SampleSource, TranscriptSegment } from '../../lib/types'
import { usePlayer } from '../../lib/workspace'
import { timecode } from '../../lib/format'
import { Button, IconButton } from '../ui/Button'
import { TechnicalLabel } from '../ui/primitives'
import { cn } from '../../lib/cn'

// --- Real video -------------------------------------------------------------------------------

export function VideoPlayer({ media }: { media: MediaAsset }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { seekNonce, seekTarget, setTime, setDuration } = usePlayer()

  useEffect(() => {
    if (seekNonce && ref.current) {
      ref.current.currentTime = seekTarget
      ref.current.play().catch(() => undefined)
    }
  }, [seekNonce, seekTarget])

  return (
    <div className="overflow-hidden rounded-xl border border-line-soft bg-black">
      <video
        ref={ref}
        src={media.url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black object-contain"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        aria-label={`Source recording: ${media.original_name}`}
      />
    </div>
  )
}

export function FrameStrip({ media }: { media: MediaAsset }) {
  const seek = usePlayer((s) => s.seek)
  const highlight = usePlayer((s) => s.highlight)
  if (!media.frames.length) return null
  const cited = new Set(highlight.filter((h) => h.kind === 'frame').map((h) => h.frame_index))
  return (
    <div>
      <TechnicalLabel className="mb-2 block">Sampled frames · sent to the model</TechnicalLabel>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {media.frames.map((f) => (
          <button
            key={f.index}
            onClick={() => seek(f.time)}
            className={cn('group relative overflow-hidden rounded-md border transition-colors', cited.has(f.index) ? 'border-accent' : 'border-line-soft hover:border-line')}
            aria-label={`Frame ${f.index} at ${timecode(f.time)}`}
          >
            <img src={f.url} alt="" className="aspect-video w-full object-cover opacity-80 group-hover:opacity-100" loading="lazy" />
            <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-fg drop-shadow">
              F{f.index} · {timecode(f.time)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Sample storyboard -------------------------------------------------------------------------

const STROKE = '#9DA8A3'
const ACCENT = '#C5F477'

function Bracket({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const c = 10
  return (
    <g stroke={ACCENT} strokeWidth="1.5" fill="none">
      <path d={`M${x} ${y + c}V${y}h${c} M${x + w - c} ${y}h${c}v${c} M${x + w} ${y + h - c}v${c}h-${c} M${x + c} ${y + h}h-${c}v-${c}`} />
    </g>
  )
}

function Tag({ x, y, label, on }: { x: number; y: number; label: string; on?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width="78" height="20" rx="3" fill={on ? '#1E2A16' : '#121617'} stroke={on ? ACCENT : '#2D3633'} />
      <text x={x + 39} y={y + 13.5} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" letterSpacing="1" fill={on ? ACCENT : STROKE}>
        {label}
      </text>
    </g>
  )
}

function Scene({ scene }: { scene: SampleScene['scene'] }) {
  const common = { fill: 'none', stroke: STROKE, strokeWidth: 1.2 }
  switch (scene) {
    case 'shelf':
      return (
        <g {...common}>
          {[90, 160, 230].map((y) => (
            <line key={y} x1="60" x2="420" y1={y} y2={y} />
          ))}
          <rect x="96" y="58" width="56" height="32" rx="4" />
          <circle cx="124" cy="74" r="10" />
          <rect x="190" y="128" width="26" height="32" rx="3" />
          <rect x="250" y="62" width="70" height="28" rx="3" />
          <line x1="340" y1="230" x2="360" y2="168" />
          <line x1="380" y1="230" x2="360" y2="168" />
          <rect x="348" y="160" width="24" height="14" />
          <Bracket x={86} y={48} w={76} h={52} />
          <text x="86" y="40" fontFamily="IBM Plex Mono" fontSize="9" fill={ACCENT} stroke="none" letterSpacing="1">ITEM · CAMERA</text>
        </g>
      )
    case 'board':
      return (
        <g {...common}>
          <rect x="110" y="40" width="260" height="190" rx="6" />
          <text x="130" y="64" fontFamily="IBM Plex Mono" fontSize="10" fill={STROKE} stroke="none" letterSpacing="1.5">AVAILABILITY BOARD</text>
          {[
            ['CAMERA R6', 'AVAILABLE', true],
            ['24-70 LENS', 'RENTED', false],
            ['300D LIGHT', 'MAINT.', false],
            ['NTG5 MIC', 'AVAILABLE', false],
          ].map(([n, s, on], i) => (
            <g key={i}>
              <text x="130" y={98 + i * 34} fontFamily="IBM Plex Mono" fontSize="10" fill={STROKE} stroke="none">{n}</text>
              <Tag x={268} y={84 + i * 34} label={s as string} on={on as boolean} />
            </g>
          ))}
          <Bracket x={262} y={78} w={90} h={32} />
        </g>
      )
    case 'binder':
      return (
        <g {...common}>
          <rect x="100" y="40" width="280" height="190" rx="6" />
          <line x1="240" y1="40" x2="240" y2="230" />
          {['NAME', 'EMAIL', 'PHONE'].map((l, i) => (
            <g key={l}>
              <text x="256" y={84 + i * 44} fontFamily="IBM Plex Mono" fontSize="9" fill={STROKE} stroke="none" letterSpacing="1">{l}</text>
              <line x1="256" x2="364" y1={100 + i * 44} y2={100 + i * 44} strokeDasharray="2 3" />
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="118" x2="222" y1={76 + i * 26} y2={76 + i * 26} opacity="0.5" />
          ))}
          <Bracket x={250} y={68} w={124} h={124} />
          <text x="250" y="60" fontFamily="IBM Plex Mono" fontSize="9" fill={ACCENT} stroke="none" letterSpacing="1">ENTITY · CUSTOMER</text>
        </g>
      )
    case 'slip':
      return (
        <g {...common}>
          <rect x="140" y="34" width="200" height="200" rx="4" />
          <text x="160" y="62" fontFamily="IBM Plex Mono" fontSize="10" fill={STROKE} stroke="none" letterSpacing="1.5">RENTAL SLIP Nº 0412</text>
          {[
            ['START', '14 OCT'],
            ['RETURN', '17 OCT'],
            ['DEPOSIT', '250.00'],
          ].map(([k, v], i) => (
            <g key={k}>
              <text x="160" y={100 + i * 36} fontFamily="IBM Plex Mono" fontSize="9" fill={STROKE} stroke="none" letterSpacing="1">{k}</text>
              <text x="320" y={100 + i * 36} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="11" fill="#F2F3EE" stroke="none">{v}</text>
              <line x1="160" x2="320" y1={108 + i * 36} y2={108 + i * 36} opacity="0.4" />
            </g>
          ))}
          <Bracket x={152} y={152} w={176} h={34} />
          <text x="152" y="206" fontFamily="IBM Plex Mono" fontSize="9" fill={ACCENT} stroke="none" letterSpacing="1">RULE · DEPOSIT ≥ 0</text>
        </g>
      )
    case 'tag':
      return (
        <g {...common}>
          <rect x="150" y="60" width="180" height="120" rx="8" />
          <circle cx="240" cy="84" r="6" />
          <Tag x={201} y={110} label="RENTED" on />
          <path d="M150 210 C 200 240, 280 240, 330 210" strokeDasharray="3 4" />
          <text x="240" y="236" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill={ACCENT} stroke="none" letterSpacing="1">STATE · AVAILABLE → RENTED</text>
        </g>
      )
    case 'return':
      return (
        <g {...common}>
          <line x1="60" x2="420" y1="170" y2="170" />
          <rect x="120" y="128" width="64" height="42" rx="5" />
          <circle cx="152" cy="149" r="12" />
          <Tag x={210} y={140} label="AVAILABLE" on />
          <path d="M322 136 l12 12 l24 -26" stroke={ACCENT} strokeWidth="2" />
          <text x="120" y="210" fontFamily="IBM Plex Mono" fontSize="9" fill={ACCENT} stroke="none" letterSpacing="1">TRANSITION · COMPLETE RETURN</text>
        </g>
      )
  }
}

export function StoryboardPlayer({ source }: { source: SampleSource }) {
  const { time, setTime, setDuration, seekNonce } = usePlayer()
  const [playing, setPlaying] = useState(false)
  const last = useRef<number | null>(null)

  useEffect(() => setDuration(source.duration), [source.duration, setDuration])
  useEffect(() => {
    if (seekNonce) setPlaying(true)
  }, [seekNonce])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (now: number) => {
      if (last.current != null) {
        const t = usePlayer.getState().time + (now - last.current) / 1000
        if (t >= source.duration) {
          setTime(source.duration)
          setPlaying(false)
          last.current = null
          return
        }
        setTime(t)
      }
      last.current = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      last.current = null
    }
  }, [playing, setTime, source.duration])

  const scene = source.scenes.find((s) => time >= s.start && time < s.end) ?? source.scenes[source.scenes.length - 1]
  const segment = source.transcript.find((s) => time >= s.start && time < s.end)

  return (
    <div className="overflow-hidden rounded-xl border border-line-soft bg-ink-925">
      <div className="relative aspect-video">
        <div className="grid-paper absolute inset-0 opacity-30" aria-hidden />
        <AnimatePresence mode="wait">
          <motion.svg key={scene.scene} viewBox="0 0 480 270" className="absolute inset-0 h-full w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} role="img" aria-label={scene.caption}>
            <Scene scene={scene.scene} />
          </motion.svg>
        </AnimatePresence>
        <span className="absolute left-3 top-3 rounded-full border border-warning/30 bg-ink-950/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-warning">
          Illustrated storyboard · sample
        </span>
        <AnimatePresence mode="wait">
          {segment && (
            <motion.p
              key={segment.start}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 bottom-3 mx-auto max-w-md rounded-md bg-ink-950/85 px-3 py-1.5 text-center text-[12.5px] leading-snug text-fg"
            >
              “{segment.text}”
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 border-t border-line-soft px-3 py-2">
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => (time >= source.duration ? (setTime(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={source.duration}
          step={0.1}
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          aria-label="Storyboard position"
          className="h-1 flex-1 accent-[#C5F477]"
        />
        <span className="font-mono text-[11px] tabular-nums text-fg-muted">
          {timecode(time)} / {timecode(source.duration)}
        </span>
      </div>
    </div>
  )
}

// --- Transcript -----------------------------------------------------------------------------

export function TranscriptViewer({
  segments,
  sourceLabel,
  onSave,
  saving,
}: {
  segments: TranscriptSegment[]
  sourceLabel: string
  onSave?: (segments: TranscriptSegment[]) => void
  saving?: boolean
}) {
  const { time, seek, highlight } = usePlayer()
  const [editing, setEditing] = useState<TranscriptSegment[] | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const cited = useMemo(
    () => highlight.filter((h) => h.kind !== 'frame' && h.start != null).map((h) => [h.start ?? 0, h.end ?? (h.start ?? 0) + 3] as const),
    [highlight],
  )
  const isCited = (s: TranscriptSegment) => cited.some(([a, b]) => a < s.end && b > s.start)
  const activeIdx = segments.findIndex((s) => time >= s.start && time < s.end)

  useEffect(() => {
    const firstCited = segments.findIndex(isCited)
    if (firstCited >= 0 && listRef.current) {
      const el = listRef.current.children[firstCited] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cited])

  if (editing) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <TechnicalLabel>Editing transcript</TechnicalLabel>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} icon={<X className="size-3.5" />}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={saving} onClick={() => (onSave?.(editing), setEditing(null))} icon={<Check className="size-3.5" />}>
              Save
            </Button>
          </div>
        </div>
        <ol className="space-y-2">
          {editing.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 w-11 shrink-0 font-mono text-[10.5px] text-fg-subtle">{timecode(s.start)}</span>
              <textarea
                className="field-input min-h-[60px] resize-y text-[13px]"
                value={s.text}
                aria-label={`Segment at ${timecode(s.start)}`}
                onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, text: e.target.value.slice(0, 600) } : x)))}
              />
              <IconButton label="Remove segment" onClick={() => setEditing(editing.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          variant="quiet"
          className="mt-2"
          icon={<Plus className="size-3.5" />}
          onClick={() => {
            const lastEnd = editing[editing.length - 1]?.end ?? 0
            setEditing([...editing, { start: lastEnd, end: lastEnd + 5, text: '' }])
          }}
        >
          Add segment
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <TechnicalLabel>Transcript · {sourceLabel}</TechnicalLabel>
        {onSave && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(segments.map((s) => ({ ...s })))} icon={<Pencil className="size-3" />}>
            Edit
          </Button>
        )}
      </div>
      {segments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-fg-muted">No speech transcript. {onSave ? 'Add one manually with Edit.' : ''}</p>
      ) : (
        <ol ref={listRef} className="space-y-0.5">
          {segments.map((s, i) => {
            const active = i === activeIdx
            const c = isCited(s)
            return (
              <li key={i}>
                <button
                  onClick={() => seek(s.start)}
                  className={cn(
                    'group flex w-full gap-3 rounded-lg border-l-2 px-2.5 py-2 text-left transition-colors',
                    c ? 'border-accent bg-accent/[0.06]' : 'border-transparent hover:bg-ink-850',
                    active && !c && 'bg-ink-850',
                  )}
                >
                  <span className={cn('mt-0.5 w-10 shrink-0 font-mono text-[10.5px] tabular-nums', c ? 'text-accent' : 'text-fg-subtle')}>{timecode(s.start)}</span>
                  <span className={cn('text-[13px] leading-relaxed', active || c ? 'text-fg' : 'text-fg-muted')}>{s.text}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
