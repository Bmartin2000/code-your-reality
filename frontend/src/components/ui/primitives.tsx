import type { ReactNode } from 'react'
import { AlertTriangle, CircleDashed, Eye, Mic, Sparkles, UserCheck, X, Check, RotateCcw, WifiOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ProjectStatus } from '../../lib/types'
import type { ProvenanceSource, ReviewStatus } from '../../lib/workflow-schema'
import { Button } from './Button'
import { ApiError } from '../../lib/api'

export function TechnicalLabel({ children, className, tone = 'subtle' }: { children: ReactNode; className?: string; tone?: 'subtle' | 'accent' | 'muted' }) {
  return (
    <span
      className={cn(
        'meta',
        tone === 'accent' && 'text-accent',
        tone === 'muted' && 'text-fg-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function SectionHeading({ eyebrow, title, description, actions, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && <TechnicalLabel className="mb-3 block">{eyebrow}</TechnicalLabel>}
        <h1 className="display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.05] text-fg">{title}</h1>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function BrandMark({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#FFFFFF" stroke="#D2D2D7" />
        <path d="M8.5 9h6.5a5 5 0 0 1 0 10H8.5z" fill="none" stroke="#1D1D1F" strokeWidth="2" />
        <path d="M15 19l6 5" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" />
        <rect x="19.5" y="8" width="4.5" height="4.5" rx="1" fill="#0071E3" />
      </svg>
      {withWord && (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
          Reality<span className="text-fg-muted"> Compiler</span>
        </span>
      )}
    </span>
  )
}

// --- Status ---------------------------------------------------------------------------------

const STATUS_META: Record<ProjectStatus, { label: string; color: string; pulse?: boolean }> = {
  draft: { label: 'Draft', color: 'var(--color-fg-subtle)' },
  uploaded: { label: 'Uploaded', color: 'var(--color-info)' },
  analyzing: { label: 'Analyzing', color: 'var(--color-accent)', pulse: true },
  needs_review: { label: 'Needs review', color: 'var(--color-warning)' },
  verified: { label: 'Verified', color: 'var(--color-success)' },
  compiling: { label: 'Compiling', color: 'var(--color-accent)', pulse: true },
  ready: { label: 'Ready', color: 'var(--color-accent)' },
  failed: { label: 'Failed', color: 'var(--color-error)' },
}

export function StatusIndicator({ status, className }: { status: ProjectStatus; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]', className)} style={{ color: m.color }}>
      <span className="relative flex size-2">
        {m.pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ background: m.color }} />}
        <span className="relative size-2 rounded-full" style={{ background: m.color }} />
      </span>
      {m.label}
    </span>
  )
}

// --- Provenance -----------------------------------------------------------------------------

export const PROVENANCE_META: Record<ProvenanceSource, { label: string; short: string; icon: typeof Eye; color: string }> = {
  observed: { label: 'Directly observed', short: 'Observed', icon: Eye, color: '#0071E3' },
  narration: { label: 'From narration', short: 'Narration', icon: Mic, color: '#7D4CDB' },
  inferred: { label: 'AI inference', short: 'Inferred', icon: Sparkles, color: '#B25E00' },
  human: { label: 'Human authored', short: 'Human', icon: UserCheck, color: '#1D8A3E' },
}

export function ProvenanceBadge({ source, compact, className }: { source: ProvenanceSource; compact?: boolean; className?: string }) {
  const m = PROVENANCE_META[source]
  const Icon = m.icon
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em]', className)}
      style={{ color: m.color, borderColor: `${m.color}40`, background: `${m.color}0f` }}
      title={m.label}
    >
      <Icon className="size-3" aria-hidden />
      {compact ? m.short : m.label}
    </span>
  )
}

export function ReviewBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  const meta = {
    pending: { label: 'Awaiting review', cls: 'text-warning border-warning/30 bg-warning/5', Icon: CircleDashed },
    accepted: { label: 'Human confirmed', cls: 'text-success border-success/30 bg-success/5', Icon: Check },
    rejected: { label: 'Rejected', cls: 'text-error border-error/30 bg-error/5', Icon: X },
  }[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em]', meta.cls, className)}>
      <meta.Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  )
}

// --- States ---------------------------------------------------------------------------------

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-ink-900 text-fg-muted">{icon}</div>}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const isNet = error instanceof ApiError && (error.isNetwork || error.status >= 502)
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-2xl border border-error/25 bg-error/[0.04] px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-error/30 text-error">
        {isNet ? <WifiOff className="size-5" /> : <AlertTriangle className="size-5" />}
      </div>
      <p className="text-[15px] font-medium text-fg">{isNet ? 'Server unreachable' : 'This could not be loaded'}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{message}</p>
      {onRetry && (
        <Button className="mt-5" size="sm" onClick={onRetry} icon={<RotateCcw className="size-3.5" />}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex min-h-[240px] flex-col items-center justify-center gap-4', className)} role="status" aria-live="polite">
      <div className="relative h-px w-40 overflow-hidden bg-line">
        <div className="animate-indeterminate absolute inset-y-0 left-0 w-1/3 bg-accent" />
      </div>
      <TechnicalLabel>{label}</TechnicalLabel>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{children}</kbd>
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line-soft', className)} />
}
