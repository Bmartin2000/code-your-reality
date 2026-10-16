import { motion } from 'motion/react'
import { Check, Minus, X } from 'lucide-react'
import type { JobStage } from '../../lib/types'
import { Spinner } from '../ui/Button'
import { cn } from '../../lib/cn'

export function formatMs(ms: number | null): string {
  if (ms == null) return ''
  if (ms < 1) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function Icon({ status }: { status: JobStage['status'] }) {
  const base = 'flex size-6 shrink-0 items-center justify-center rounded-full border'
  if (status === 'running')
    return (
      <span className={cn(base, 'border-accent/60 text-accent')}>
        <Spinner className="size-3.5" />
      </span>
    )
  if (status === 'done')
    return (
      <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className={cn(base, 'border-accent/50 bg-accent/15 text-accent')}>
        <Check className="size-3.5" />
      </motion.span>
    )
  if (status === 'failed')
    return (
      <span className={cn(base, 'border-error/50 bg-error/10 text-error')}>
        <X className="size-3.5" />
      </span>
    )
  if (status === 'skipped')
    return (
      <span className={cn(base, 'border-line text-fg-subtle')}>
        <Minus className="size-3.5" />
      </span>
    )
  return <span className={cn(base, 'border-line')} />
}

/** Renders exactly the stage records persisted by the backend job. */
export function StageTimeline({ stages, visibleCount }: { stages: JobStage[]; visibleCount?: number }) {
  return (
    <ol className="relative">
      {stages.map((s, i) => {
        const hidden = visibleCount != null && i >= visibleCount
        const status = hidden ? 'pending' : s.status
        return (
          <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
            {i < stages.length - 1 && <span className={cn('absolute left-3 top-7 h-[calc(100%-24px)] w-px', status === 'done' ? 'bg-accent/40' : 'bg-line')} aria-hidden />}
            <Icon status={status} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-[14px] font-medium', status === 'pending' ? 'text-fg-subtle' : status === 'failed' ? 'text-error' : 'text-fg')}>{s.label}</span>
                {!hidden && s.duration_ms != null && <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-subtle">{formatMs(s.duration_ms)}</span>}
              </div>
              {!hidden && s.detail && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('mt-0.5 text-[13px] leading-relaxed', s.status === 'failed' ? 'text-error/90' : 'text-fg-muted')}>
                  {s.detail}
                </motion.p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
