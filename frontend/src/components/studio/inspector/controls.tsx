import { useEffect, useId, useState, type ReactNode } from 'react'
import { Check, CircleDashed, Clock, Eye, Image, Mic, RotateCcw, X } from 'lucide-react'
import type { Evidence, Reviewable } from '../../../lib/workflow-schema'
import { usePlayer } from '../../../lib/workspace'
import { timecode } from '../../../lib/format'
import { ProvenanceBadge, ReviewBadge, TechnicalLabel } from '../../ui/primitives'
import { cn } from '../../../lib/cn'

export function FieldLabel({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="meta">{children}</span>
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  )
}

/** Text input that commits on blur/Enter so every keystroke doesn't create a workflow version. */
export function CommitInput({
  value,
  onCommit,
  label,
  multiline,
  mono,
  validate,
  placeholder,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  label?: string
  multiline?: boolean
  mono?: boolean
  validate?: (v: string) => string | null
  placeholder?: string
  className?: string
}) {
  const id = useId()
  const [v, setV] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => setV(value), [value])
  const commit = () => {
    const e = validate?.(v) ?? null
    setErr(e)
    if (e) return
    if (v !== value) onCommit(v)
  }
  const common = {
    id,
    value: v,
    placeholder,
    'aria-invalid': !!err || undefined,
    'aria-describedby': err ? `${id}-err` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    className: cn('field-input', mono && 'font-mono text-[12.5px]', multiline && 'min-h-[72px] resize-y leading-relaxed'),
  }
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      {multiline ? (
        <textarea {...common} />
      ) : (
        <input {...common} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      )}
      {err && (
        <p id={`${id}-err`} className="mt-1 text-[12px] text-error">
          {err}
        </p>
      )}
    </div>
  )
}

export function SelectInput({
  value,
  onChange,
  options,
  label,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  label?: string
  className?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <select id={id} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full border transition-colors', checked ? 'border-accent/60 bg-accent/25' : 'border-line bg-ink-925')}
      >
        <span className={cn('absolute top-0.5 size-3.5 rounded-full transition-[left,background-color] duration-200', checked ? 'left-[18px] bg-accent' : 'left-0.5 bg-fg-subtle')} />
      </button>
      {label}
    </label>
  )
}

export function ReviewActions({ item, onChange, compact }: { item: Reviewable; onChange: (s: 'accepted' | 'rejected' | 'pending') => void; compact?: boolean }) {
  const s = item.review.status
  if (s !== 'pending') {
    return (
      <div className="flex items-center gap-2">
        <ReviewBadge status={s} />
        <button onClick={() => onChange('pending')} className="inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg" aria-label="Reopen for review">
          <RotateCcw className="size-3" /> {!compact && 'Reopen'}
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange('accepted')}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-success/35 bg-success/[0.06] px-2.5 text-[12px] font-medium text-success transition-colors hover:bg-success/15"
      >
        <Check className="size-3.5" /> Confirm
      </button>
      <button
        onClick={() => onChange('rejected')}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px] text-fg-muted transition-colors hover:border-error/40 hover:text-error"
      >
        <X className="size-3.5" /> Reject
      </button>
    </div>
  )
}

export function MiniReview({ item, onChange, label }: { item: Reviewable; onChange: (s: 'accepted' | 'rejected' | 'pending') => void; label: string }) {
  const s = item.review.status
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={`Review ${label}`}>
      <button
        title="Confirm"
        aria-label={`Confirm ${label}`}
        aria-pressed={s === 'accepted'}
        onClick={() => onChange(s === 'accepted' ? 'pending' : 'accepted')}
        className={cn('inline-flex size-6 items-center justify-center rounded-full transition-colors', s === 'accepted' ? 'bg-success/15 text-success' : 'text-fg-subtle hover:text-success')}
      >
        <Check className="size-3.5" />
      </button>
      <button
        title="Reject"
        aria-label={`Reject ${label}`}
        aria-pressed={s === 'rejected'}
        onClick={() => onChange(s === 'rejected' ? 'pending' : 'rejected')}
        className={cn('inline-flex size-6 items-center justify-center rounded-full transition-colors', s === 'rejected' ? 'bg-error/15 text-error' : 'text-fg-subtle hover:text-error')}
      >
        <X className="size-3.5" />
      </button>
      {s === 'pending' && <CircleDashed className="ml-0.5 size-3 text-warning" aria-label="awaiting review" />}
    </div>
  )
}

/** Evidence Intelligence: provenance, confidence and clickable source references. */
export function EvidencePanel({ item, hasMedia }: { item: Reviewable; hasMedia: boolean }) {
  const seek = usePlayer((s) => s.seek)
  const p = item.provenance
  const ev = p.evidence
  return (
    <section className="rounded-xl border border-line-soft bg-ink-925 p-3.5" aria-label="Source evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TechnicalLabel>Evidence</TechnicalLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge source={p.source} compact />
          {item.review.edited && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">Edited</span>}
        </div>
      </div>
      {ev.length === 0 ? (
        <p className={cn('mt-3 text-[13px] leading-relaxed', p.source === 'inferred' ? 'text-warning' : 'text-fg-muted')}>
          {p.source === 'inferred' ? 'AI inference — confirmation required. No direct source was cited.' : p.source === 'human' ? 'Authored by a person; no recording evidence.' : 'No reference cited.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {ev.map((e, i) => (
            <li key={i}>
              <EvidenceChip e={e} onSeek={hasMedia && e.start != null ? () => seek(e.start!) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {(p.note || p.confidence) && (
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[12.5px] leading-relaxed text-fg-muted">
          {p.confidence && (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-subtle">
              confidence {p.confidence}
              {p.note ? ' · ' : ''}
            </span>
          )}
          {p.note}
        </p>
      )}
    </section>
  )
}

function EvidenceChip({ e, onSeek }: { e: Evidence; onSeek?: () => void }) {
  const Icon = e.kind === 'frame' ? Image : e.kind === 'narration' ? Mic : Clock
  const when = e.kind === 'frame' ? `Frame ${e.frame_index ?? '?'}${e.start != null ? ` · ${timecode(e.start)}` : ''}` : e.start != null ? `${e.kind === 'narration' ? 'Narration' : 'Transcript'} ${timecode(e.start)}${e.end != null ? `–${timecode(e.end)}` : ''}` : 'Narration'
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent">
        <Icon className="size-3" aria-hidden /> {when}
        {onSeek && <Eye className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </span>
      {e.quote && <span className="mt-1 block text-[12.5px] leading-snug text-fg-muted">“{e.quote}”</span>}
    </>
  )
  return onSeek ? (
    <button onClick={onSeek} className="group block w-full rounded-lg border border-line-soft px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.04]" aria-label={`Jump to ${when}`}>
      {body}
    </button>
  ) : (
    <div className="rounded-lg border border-line-soft px-2.5 py-2">{body}</div>
  )
}
